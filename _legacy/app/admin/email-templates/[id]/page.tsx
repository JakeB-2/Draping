import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import EmailTemplateForm from '../EmailTemplateForm'

type TemplateRow = {
  id: string
  name: string
  subject: string
  to_address: string | null
  cc_address: string | null
  bcc_address: string | null
  body: string
}

type AttachmentRow = {
  id: string
  file_name: string
  content_type: string
  file_size: number | null
  storage_path: string
}

export default async function EditEmailTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: templateData }, { data: attachmentsData }] = await Promise.all([
    supabase.from('email_templates').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('email_template_attachments')
      .select('id, file_name, content_type, file_size, storage_path')
      .eq('template_id', id)
      .order('created_at'),
  ])

  if (!templateData) notFound()

  const template = templateData as unknown as TemplateRow
  const attachments = (attachmentsData ?? []) as unknown as AttachmentRow[]

  return (
    <EmailTemplateForm
      id={template.id}
      defaultValues={{
        name: template.name,
        subject: template.subject,
        to_address: template.to_address ?? '',
        cc_address: template.cc_address ?? '',
        bcc_address: template.bcc_address ?? '',
        body: template.body,
      }}
      attachments={attachments}
    />
  )
}
