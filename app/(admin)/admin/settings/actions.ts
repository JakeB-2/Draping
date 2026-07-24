'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '../auth'

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().or(z.literal('').transform(() => null))

const optionalEmail = z.string().trim().email().nullable().or(z.literal('').transform(() => null))

// Blank = hidden on the public site = NULL. Non-blank values must be full URLs.
const optionalUrl = z
  .string()
  .trim()
  .url('Enter a full URL, e.g. https://example.com')
  .max(500)
  .nullable()
  .or(z.literal('').transform(() => null))

export type SettingsActionState = { ok: boolean; error: string | null }

// Shared persistence for the per-section actions (booking_settings is a
// single-row table). Not exported — every exported server action below calls
// requireAdmin() via this helper before touching the database.
async function saveToSettings(payload: Record<string, unknown>, path: string): Promise<SettingsActionState> {
  const { supabase } = await requireAdmin()
  const { data: existing } = await supabase.from('booking_settings').select('id').limit(1).maybeSingle()

  const { error } = existing
    ? await supabase.from('booking_settings').update(payload).eq('id', existing.id)
    : await supabase.from('booking_settings').insert(payload)

  if (error) return { ok: false, error: error.message }

  revalidatePath(path)
  return { ok: true, error: null }
}

function firstIssue(error: z.ZodError): SettingsActionState {
  return { ok: false, error: error.issues[0]?.message ?? 'Invalid input' }
}

// --- Studio ----------------------------------------------------------------

const studioSchema = z.object({
  business_name: optionalText(100),
  address:       optionalText(500),
  contact_email: optionalEmail,
  phone:         optionalText(40),
})

export async function saveStudio(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const parsed = studioSchema.safeParse({
    business_name: formData.get('business_name') ?? '',
    address: formData.get('address') ?? '',
    contact_email: formData.get('contact_email') ?? '',
    phone: formData.get('phone') ?? '',
  })
  if (!parsed.success) return firstIssue(parsed.error)
  return saveToSettings(parsed.data, '/admin/settings/studio')
}

// --- Timezone --------------------------------------------------------------

const timezoneSchema = z.object({ timezone: z.string().min(1) })

export async function saveTimezone(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const parsed = timezoneSchema.safeParse({ timezone: formData.get('timezone') })
  if (!parsed.success) return firstIssue(parsed.error)
  return saveToSettings(parsed.data, '/admin/settings/timezone')
}

// --- Checkout tax ----------------------------------------------------------

const taxSchema = z.object({ tax_rate_percent: z.coerce.number().min(0).max(100) })

export async function saveTax(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const parsed = taxSchema.safeParse({ tax_rate_percent: formData.get('tax_rate_percent') })
  if (!parsed.success) return firstIssue(parsed.error)
  return saveToSettings(parsed.data, '/admin/settings/tax')
}

// --- Participation ---------------------------------------------------------

const participationSchema = z.object({
  max_participants_per_booking: z.coerce.number().int().min(1).max(100),
  pair_discount_percent: z.coerce.number().min(0).max(100),
})

export async function saveParticipation(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const parsed = participationSchema.safeParse({
    max_participants_per_booking: formData.get('max_participants_per_booking'),
    pair_discount_percent: formData.get('pair_discount_percent'),
  })
  if (!parsed.success) return firstIssue(parsed.error)
  return saveToSettings(parsed.data, '/admin/settings/participation')
}

// --- Links -----------------------------------------------------------------

const linksSchema = z.object({
  about_url:      optionalUrl,
  facebook_url:   optionalUrl,
  experience_url: optionalUrl,
})

export async function saveLinks(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const parsed = linksSchema.safeParse({
    about_url: formData.get('about_url') ?? '',
    facebook_url: formData.get('facebook_url') ?? '',
    experience_url: formData.get('experience_url') ?? '',
  })
  if (!parsed.success) return firstIssue(parsed.error)
  return saveToSettings(parsed.data, '/admin/settings/links')
}

// --- Email -----------------------------------------------------------------

const emailSchema = z.object({ owner_email: optionalEmail })

export async function saveEmailSettings(_prev: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const parsed = emailSchema.safeParse({ owner_email: formData.get('owner_email') ?? '' })
  if (!parsed.success) return firstIssue(parsed.error)
  return saveToSettings(parsed.data, '/admin/settings/email')
}
