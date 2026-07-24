'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '../../auth'

// Blank = no limit = NULL. Never store 0: the engine reads these caps
// literally (0 booked minutes/day or 0 consecutive days silently blocks
// every booking). z.coerce.number() alone would turn '' into 0, which is
// exactly the bug this guards against.
const optionalNumber = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null
    const text = String(value).trim()
    return text === '' ? null : text
  },
  z.union([
    z.null(),
    z.coerce.number().int().min(1, 'Use a positive number, or leave the field blank for no limit'),
  ]),
)

const rulesSchema = z.object({
  // Surfaced as days in the UI; stored as hours in booking_settings.min_lead_hours.
  min_lead_days:                 z.coerce.number().min(0).max(365),
  max_advance_days:              z.coerce.number().int().min(1).max(365),
  max_booked_minutes_per_day:    optionalNumber,
  max_booking_days_per_week:     optionalNumber,
  max_consecutive_booking_days:  optionalNumber,
})

export type RulesActionState = { ok: boolean; error: string | null }

export async function saveRules(_prev: RulesActionState, formData: FormData): Promise<RulesActionState> {
  const raw = {
    min_lead_days: formData.get('min_lead_days'),
    max_advance_days: formData.get('max_advance_days'),
    max_booked_minutes_per_day: formData.get('max_booked_minutes_per_day') ?? '',
    max_booking_days_per_week: formData.get('max_booking_days_per_week') ?? '',
    max_consecutive_booking_days: formData.get('max_consecutive_booking_days') ?? '',
  }

  const parsed = rulesSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { min_lead_days, ...rest } = parsed.data
  const payload = { ...rest, min_lead_hours: Math.round(min_lead_days * 24) }

  const { supabase } = await requireAdmin()
  const { data: existing } = await supabase.from('booking_settings').select('id').limit(1).maybeSingle()

  const { error } = existing
    ? await supabase.from('booking_settings').update(payload).eq('id', existing.id)
    : await supabase.from('booking_settings').insert(payload)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/booking-options')
  revalidatePath('/admin/bookings/options')
  return { ok: true, error: null }
}
