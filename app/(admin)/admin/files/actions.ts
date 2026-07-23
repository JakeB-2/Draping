'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '../auth'

const uploadSchema = z.object({
  title: z.string().trim().max(120).nullable().or(z.literal('').transform(() => null)),
  description: z.string().trim().max(500).nullable().or(z.literal('').transform(() => null)),
})

export type UploadActionState = { ok: boolean; error: string | null }

export async function uploadDocument(_prev: UploadActionState, formData: FormData): Promise<UploadActionState> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'Pick a file to upload.' }

  const parsed = uploadSchema.safeParse({
    title: formData.get('title') || null,
    description: formData.get('description') || null,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const storagePath = `documents/${Date.now()}-${crypto.randomUUID()}.${ext}`

  const { supabase } = await requireAdmin()
  const { error: uploadError } = await supabase.storage
    .from('draping-documents')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })
  if (uploadError) return { ok: false, error: uploadError.message }

  const { error: dbError } = await supabase.from('documents').insert({
    storage_path: storagePath,
    file_name: file.name,
    content_type: file.type || null,
    file_size: buffer.length,
    title: parsed.data.title,
    description: parsed.data.description,
  })
  if (dbError) {
    await supabase.storage.from('draping-documents').remove([storagePath])
    return { ok: false, error: dbError.message }
  }

  revalidatePath('/admin/files')
  return { ok: true, error: null }
}

export async function deleteDocument(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) throw new Error(fetchError.message)
  if (!doc) throw new Error('Document not found')

  const { error: storageError } = await supabase.storage
    .from('draping-documents')
    .remove([doc.storage_path])
  if (storageError) throw new Error(storageError.message)

  const { error: dbError } = await supabase.from('documents').delete().eq('id', id)
  if (dbError) throw new Error(dbError.message)

  revalidatePath('/admin/files')
}

export async function getDownloadUrl(id: string): Promise<string> {
  const { supabase } = await requireAdmin()
  const { data: doc } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle()
  if (!doc) throw new Error('Document not found')

  const { data, error } = await supabase.storage
    .from('draping-documents')
    .createSignedUrl(doc.storage_path, 60)
  if (error || !data) throw new Error(error?.message ?? 'Could not create download link')
  return data.signedUrl
}
