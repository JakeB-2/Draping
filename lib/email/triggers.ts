import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from './service'
import { renderTemplate } from './render'

/**
 * Fires the email template linked to a `booking_action_triggers` action,
 * if the trigger is active and has a template attached.
 *
 * Booking requests and booking confirmations are wired to their separate
 * lifecycle actions. Other seeded actions remain available to the editor.
 */
export async function runTrigger(
  action: string,
  variables: Record<string, string | number | null | undefined>,
  recipient: string,
): Promise<{ id: string } | null> {
  const supabase = createAdminClient()

  const { data: trigger } = await supabase
    .from('booking_action_triggers')
    .select('template_id, is_active')
    .eq('action', action)
    .maybeSingle()

  if (!trigger || !trigger.is_active || !trigger.template_id) return null

  const { data: template } = await supabase
    .from('email_templates')
    .select('subject, body, to_address, cc_address, bcc_address')
    .eq('id', trigger.template_id)
    .maybeSingle()

  if (!template) return null

  const renderedTo = template.to_address?.trim()
    ? renderTemplate(template.to_address, variables).trim()
    : recipient
  const renderedCc = template.cc_address?.trim()
    ? renderTemplate(template.cc_address, variables).trim()
    : undefined
  const renderedBcc = template.bcc_address?.trim()
    ? renderTemplate(template.bcc_address, variables).trim()
    : undefined

  const { data: attachments } = await supabase
    .from('email_template_attachments')
    .select('storage_path, file_name, content_type')
    .eq('template_id', trigger.template_id)

  const resolvedAttachments = await Promise.all(
    (attachments ?? []).map(async (a) => {
      const { data } = await supabase.storage
        .from('draping-documents')
        .download(a.storage_path)
      if (!data) return null
      const buffer = Buffer.from(await data.arrayBuffer())
      return { filename: a.file_name, content: buffer, contentType: a.content_type ?? undefined }
    }),
  )

  return sendEmail({
    to: renderedTo || recipient,
    subject: renderTemplate(template.subject, variables),
    html: renderTemplate(template.body, variables),
    cc: renderedCc || undefined,
    bcc: renderedBcc || undefined,
    attachments: resolvedAttachments.filter((a): a is NonNullable<typeof a> => a !== null),
  })
}
