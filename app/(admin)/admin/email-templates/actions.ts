'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/service'
import { renderTemplate } from '@/lib/email/render'

export type TemplateInput = {
  name: string
  subject: string
  to_address?: string | null
  cc_address?: string | null
  bcc_address?: string | null
  body: string
}

export async function createEmailTemplate(data: TemplateInput): Promise<{ id: string } | string> {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from('email_templates')
    .insert({ ...data, updated_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error || !row) return error?.message ?? 'Failed to create template'
  revalidatePath('/admin/email-templates')
  return { id: row.id as string }
}

export async function updateEmailTemplate(id: string, data: TemplateInput): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('email_templates')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return error.message
  revalidatePath('/admin/email-templates')
  revalidatePath(`/admin/email-templates/${id}`)
}

export async function deleteEmailTemplate(id: string): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('email_templates').delete().eq('id', id)
  if (error) return error.message
  revalidatePath('/admin/email-templates')
}

export async function uploadTemplateAttachment(
  templateId: string,
  formData: FormData,
): Promise<string | undefined> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return 'No file provided'

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const ext = file.name.split('.').pop() ?? 'bin'
  const storagePath = `email-attachments/${templateId}/${Date.now()}.${ext}`

  const supabase = await createClient()
  const { error: uploadError } = await supabase.storage
    .from('draping-documents')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return uploadError.message

  const { error: dbError } = await supabase.from('email_template_attachments').insert({
    template_id: templateId,
    storage_path: storagePath,
    file_name: file.name,
    content_type: file.type,
    file_size: buffer.length,
  })
  if (dbError) return dbError.message

  revalidatePath(`/admin/email-templates/${templateId}`)
}

export async function deleteTemplateAttachment(
  attachmentId: string,
  storagePath: string,
  templateId: string,
): Promise<string | undefined> {
  const supabase = await createClient()

  const { error: storageError } = await supabase.storage
    .from('draping-documents')
    .remove([storagePath])
  if (storageError) return storageError.message

  const { error: dbError } = await supabase
    .from('email_template_attachments')
    .delete()
    .eq('id', attachmentId)
  if (dbError) return dbError.message

  revalidatePath(`/admin/email-templates/${templateId}`)
}

const SAMPLE_VARS: Record<string, string> = {
  booking_id: '0f4f01c1-c764-4b57-9b4c-cdd9de30f935',
  booking_reference: '0f4f01c1-c764-4b57-9b4c-cdd9de30f935',
  client_first_name: 'Sample',
  client_last_name: 'Client',
  client_full_name: 'Sample Client',
  client_email: 'sample@example.com',
  client_phone: '(613) 555-0142',
  client_count: '2',
  additional_client_names: 'Guest Client',
  booking_date: 'Saturday, 17 May 2026',
  booking_start_time: '10:00 AM',
  booking_end_time: '12:30 PM',
  booking_duration_minutes: '150',
  booking_price: '$285.00',
  booking_notes: 'Sample notes from client.',
  booking_includes_break: 'Yes',
  booking_break_minutes: '15',
  offering_name: 'Full Personal Colour Analysis',
  offering_description: 'Full PCA with palette wallet.',
  service_names: 'Personal colour analysis, Makeup colours',
  business_name: 'DNA My Colours',
  business_address: 'Ottawa, Ontario',
  business_email: 'hello@example.ca',
  business_phone: '(613) 555-0101',
  business_timezone: 'America/Toronto',
}

export async function sendTestEmail(templateId: string): Promise<string | undefined> {
  const supabase = await createClient()

  const [{ data: template }, { data: settings }, { data: attachments }] = await Promise.all([
    supabase
      .from('email_templates')
      .select('subject, body, cc_address, bcc_address')
      .eq('id', templateId)
      .maybeSingle(),
    supabase.from('booking_settings').select('owner_email').limit(1).maybeSingle(),
    supabase
      .from('email_template_attachments')
      .select('storage_path, file_name, content_type')
      .eq('template_id', templateId),
  ])

  if (!template) return 'Template not found'
  if (!settings?.owner_email) return 'Set Owner email under Settings before sending tests.'

  const resolved = await Promise.all(
    (attachments ?? []).map(async (a) => {
      const { data } = await supabase.storage.from('draping-documents').download(a.storage_path)
      if (!data) return null
      const buffer = Buffer.from(await data.arrayBuffer())
      return { filename: a.file_name, content: buffer, contentType: a.content_type ?? undefined }
    }),
  )

  try {
    await sendEmail({
      to: settings.owner_email,
      subject: `[TEST] ${renderTemplate(template.subject, SAMPLE_VARS)}`,
      html: renderTemplate(template.body, SAMPLE_VARS),
      cc: template.cc_address ? renderTemplate(template.cc_address, SAMPLE_VARS) : undefined,
      bcc: template.bcc_address ? renderTemplate(template.bcc_address, SAMPLE_VARS) : undefined,
      attachments: resolved.filter((a): a is NonNullable<typeof a> => a !== null),
    })
  } catch (e) {
    return e instanceof Error ? e.message : 'Test send failed'
  }
}
