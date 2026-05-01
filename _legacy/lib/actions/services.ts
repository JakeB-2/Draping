'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type ServiceInput = {
  name: string
  description?: string | null
  service_group_id: string
  time_requirement_minutes: number
  is_active: boolean
}

export async function createService(data: ServiceInput): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('services').insert({
    name: data.name.trim(),
    description: data.description?.trim() || null,
    service_group_id: data.service_group_id,
    time_requirement_minutes: data.time_requirement_minutes,
    is_active: data.is_active,
  })
  if (error) return error.message
  revalidatePath('/admin/services')
}

export async function updateService(id: string, data: ServiceInput): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('services').update({
    name: data.name.trim(),
    description: data.description?.trim() || null,
    service_group_id: data.service_group_id,
    time_requirement_minutes: data.time_requirement_minutes,
    is_active: data.is_active,
  }).eq('id', id)
  if (error) return error.message
  revalidatePath('/admin/services')
  revalidatePath(`/admin/services/${id}`)
}
