import { createAdminClient } from '@/lib/supabase/admin'
import { safeTimeZone } from '@/lib/time-zone'

export type PublicStudioSettings = {
  business_name: string
  address: string | null
  contact_email: string | null
  phone: string | null
  timezone: string
  tax_rate_percent: number
  about_url: string | null
  facebook_url: string | null
  experience_url: string | null
  owner_name: string
  city: string
  region: string
  credential_label: string
  seo_description: string | null
  currency_code: string
  currency_locale: string
}

export async function getPublicStudioSettings(): Promise<PublicStudioSettings> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('booking_settings')
    .select('business_name, address, contact_email, phone, timezone, tax_rate_percent, about_url, facebook_url, experience_url, owner_name, city, region, credential_label, seo_description, currency_code, currency_locale')
    .limit(1)
    .maybeSingle()

  return {
    business_name: data?.business_name?.trim() || 'DNA My Colours',
    address: data?.address ?? null,
    contact_email: data?.contact_email ?? null,
    phone: data?.phone ?? null,
    timezone: safeTimeZone(data?.timezone),
    tax_rate_percent: Math.min(100, Math.max(0, Number(data?.tax_rate_percent ?? 0))),
    about_url: data?.about_url?.trim() || null,
    facebook_url: data?.facebook_url?.trim() || null,
    experience_url: data?.experience_url?.trim() || null,
    owner_name: data?.owner_name?.trim() || 'Lisa Kelly',
    city: data?.city?.trim() || 'Ottawa',
    region: data?.region?.trim() || 'Ontario',
    credential_label: data?.credential_label?.trim() || 'Chrysalis Colour analyst',
    seo_description: data?.seo_description?.trim() || null,
    currency_code: data?.currency_code?.trim() || 'CAD',
    currency_locale: data?.currency_locale?.trim() || 'en-CA',
  }
}
