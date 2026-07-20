'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const recurringSchema = z.object({
  label: z.string().trim().max(100).nullable().or(z.literal('').transform(() => null)),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'Pick at least one day'),
  start_time: z.string().regex(timeRegex, 'Use HH:MM'),
  end_time: z.string().regex(timeRegex, 'Use HH:MM'),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().or(z.literal('').transform(() => null)),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().or(z.literal('').transform(() => null)),
}).refine((d) => d.start_time < d.end_time, { message: 'End time must be after start time', path: ['end_time'] })
  .refine((d) => !d.valid_from || !d.valid_until || d.valid_from <= d.valid_until, { message: 'Valid until must be on or after valid from', path: ['valid_until'] })

export type RecurringActionState = { ok: boolean; error: string | null }

export async function createRecurring(_prev: RecurringActionState, formData: FormData): Promise<RecurringActionState> {
  const weekdays = formData.getAll('weekdays').map((v) => Number(v))
  const parsed = recurringSchema.safeParse({
    label: formData.get('label') || null,
    weekdays,
    start_time: formData.get('start_time'),
    end_time: formData.get('end_time'),
    valid_from: formData.get('valid_from') || null,
    valid_until: formData.get('valid_until') || null,
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = await createClient()
  const { error } = await supabase.from('recurring_blocks').insert(parsed.data)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/booking-options')
  revalidatePath('/admin/bookings/options')
  return { ok: true, error: null }
}

export async function deleteRecurring(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('recurring_blocks').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/booking-options')
  revalidatePath('/admin/bookings/options')
}
