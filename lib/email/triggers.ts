import { createClient } from '@/lib/supabase/server'
import { sendEmail } from './service'
import { renderTemplate } from './render'

/**
 * Fires the email template linked to a `booking_action_triggers` action,
 * if the trigger is active and has a template attached.
 *
 * v1 actually wires only `booking.confirmed`. The other actions
 * (`booking.updated`, `booking.cancelled`, `client.followup`) keep their
 * seeded rows + template editor but are not auto-fired yet.
 */
export async function runTrigger(
  action: string,
  variables: Record<string, string | number | null | undefined>,
  recipient: string,
): Promise<{ id: string } | null> {
  const supabase = await createClient()

  const { data: trigger } = await supabase
    .from('booking_action_triggers')
    .select('template_id, is_active')
    .eq('action', action)
    .maybeSingle()

  if (!trigger || !trigger.is_active || !trigger.template_id) return null

  const { data: template } = await supabase
    .from('email_templates')
    .select('subject, body, cc_address, bcc_address')
    .eq('id', trigger.template_id)
    .maybeSingle()

  if (!template) return null

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
    to: recipient,
    subject: renderTemplate(template.subject, variables),
    html: renderTemplate(template.body, variables),
    cc: template.cc_address ? renderTemplate(template.cc_address, variables) : undefined,
    bcc: template.bcc_address ? renderTemplate(template.bcc_address, variables) : undefined,
    attachments: resolvedAttachments.filter((a): a is NonNullable<typeof a> => a !== null),
  })
}
