'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type OfferingInput = {
  name: string
  description?: string | null
  duration_minutes: number
  price_amount: number
  break_required: boolean
  pair_allowed: boolean
  is_active: boolean
  service_ids?: string[]
}

export async function createOffering(data: OfferingInput): Promise<string | undefined> {
  const supabase = await createClient()

  const { data: offering, error } = await supabase.from('offerings').insert({
    name: data.name.trim(),
    description: data.description?.trim() || null,
    duration_minutes: data.duration_minutes,
    price_amount: data.price_amount,
    break_required: data.break_required,
    pair_allowed: data.pair_allowed,
    is_active: data.is_active,
  }).select('id').single()

  if (error || !offering) return error?.message ?? 'Failed to create offering'

  if (data.service_ids?.length) {
    const joins = data.service_ids.map((sid, i) => ({
      offering_id: offering.id,
      service_id: sid,
      sort_order: i,
    }))
    const { error: joinErr } = await supabase.from('offering_services').insert(joins)
    if (joinErr) return joinErr.message
  }

  revalidatePath('/admin/offerings')
}

export async function updateOffering(id: string, data: OfferingInput): Promise<string | undefined> {
  const supabase = await createClient()

  const { error } = await supabase.from('offerings').update({
    name: data.name.trim(),
    description: data.description?.trim() || null,
    duration_minutes: data.duration_minutes,
    price_amount: data.price_amount,
    break_required: data.break_required,
    pair_allowed: data.pair_allowed,
    is_active: data.is_active,
  }).eq('id', id)

  if (error) return error.message

  // Replace offering_services: delete all then re-insert
  await supabase.from('offering_services').delete().eq('offering_id', id)

  if (data.service_ids?.length) {
    const joins = data.service_ids.map((sid, i) => ({
      offering_id: id,
      service_id: sid,
      sort_order: i,
    }))
    const { error: joinErr } = await supabase.from('offering_services').insert(joins)
    if (joinErr) return joinErr.message
  }

  revalidatePath('/admin/offerings')
  revalidatePath(`/admin/offerings/${id}`)
}
