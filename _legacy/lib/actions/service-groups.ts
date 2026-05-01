'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type ServiceGroupInput = { name: string; description?: string | null }

export async function createServiceGroup(data: ServiceGroupInput): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('service_groups').insert({
    name: data.name.trim(),
    description: data.description?.trim() || null,
  })
  if (error) return error.message
  revalidatePath('/admin/service-groups')
}

export async function updateServiceGroup(id: string, data: ServiceGroupInput): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('service_groups').update({
    name: data.name.trim(),
    description: data.description?.trim() || null,
  }).eq('id', id)
  if (error) return error.message
  revalidatePath('/admin/service-groups')
}
