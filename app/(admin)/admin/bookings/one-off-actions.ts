'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const isoLikeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

const oneOffSchema = z.object({
  start_at: z.string().regex(isoLikeRegex, 'Invalid date'),
  end_at: z.string().regex(isoLikeRegex, 'Invalid date'),
  reason: z.string().trim().max(200).nullable().or(z.literal('').transform(() => null)),
}).refine((d) => d.start_at < d.end_at, { message: 'End must be after start', path: ['end_at'] })

export type OneOffActionState = { ok: boolean; error: string | null }

export async function createOneOff(_prev: OneOffActionState, formData: FormData): Promise<OneOffActionState> {
  const parsed = oneOffSchema.safeParse({
    start_at: formData.get('start_at'),
    end_at: formData.get('end_at'),
    reason: formData.get('reason') || null,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createClient()
  const { error } = await supabase.from('blocked_periods').insert(parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/bookings')
  return { ok: true, error: null }
}

export async function deleteOneOff(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('blocked_periods').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/bookings')
}
