'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '../auth'

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().or(z.literal('').transform(() => null))

const optionalEmail = z.string().trim().email().nullable().or(z.literal('').transform(() => null))

const settingsSchema = z.object({
  business_name: optionalText(100),
  address:       optionalText(500),
  contact_email: optionalEmail,
  phone:         optionalText(40),
  timezone:      z.string().min(1),
  owner_email:   optionalEmail,
  tax_rate_percent: z.coerce.number().min(0).max(100),
  max_participants_per_booking: z.coerce.number().int().min(1).max(100),
  pair_discount_percent: z.coerce.number().min(0).max(100),
})

export type SettingsActionState = { ok: boolean; error: string | null }

export async function saveSettings(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const raw = {
    business_name: formData.get('business_name') ?? '',
    address: formData.get('address') ?? '',
    contact_email: formData.get('contact_email') ?? '',
    phone: formData.get('phone') ?? '',
    timezone: formData.get('timezone'),
    owner_email: formData.get('owner_email') ?? '',
    tax_rate_percent: formData.get('tax_rate_percent'),
    max_participants_per_booking: formData.get('max_participants_per_booking'),
    pair_discount_percent: formData.get('pair_discount_percent'),
  }

  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { supabase } = await requireAdmin()
  const { data: existing } = await supabase.from('booking_settings').select('id').limit(1).maybeSingle()

  const { error } = existing
    ? await supabase.from('booking_settings').update(parsed.data).eq('id', existing.id)
    : await supabase.from('booking_settings').insert(parsed.data)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/settings')
  return { ok: true, error: null }
}
