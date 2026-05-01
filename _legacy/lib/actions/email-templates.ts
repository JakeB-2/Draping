'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
