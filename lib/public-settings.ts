import { createAdminClient } from '@/lib/supabase/admin'
import { safeTimeZone } from '@/lib/time-zone'

export type PublicStudioSettings = {
  business_name: string
  address: string | null
  contact_email: string | null
  phone: string | null
  timezone: string
}

export async function getPublicStudioSettings(): Promise<PublicStudioSettings> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('booking_settings')
    .select('business_name, address, contact_email, phone, timezone')
    .limit(1)
    .maybeSingle()

  return {
    business_name: data?.business_name?.trim() || 'DNA My Colours',
    address: data?.address ?? null,
    contact_email: data?.contact_email ?? null,
    phone: data?.phone ?? null,
    timezone: safeTimeZone(data?.timezone),
  }
}

