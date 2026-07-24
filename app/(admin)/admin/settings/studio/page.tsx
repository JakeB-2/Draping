import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SectionSkeleton } from '../section-form'
import { StudioForm, type StudioSettings } from './studio-form'

const DEFAULTS: StudioSettings = {
  business_name: null,
  address: null,
  contact_email: null,
  phone: null,
}

async function Content() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_settings')
    .select('business_name, address, contact_email, phone')
    .limit(1)
    .maybeSingle()
  if (error) throw error

  const settings: StudioSettings = data ? { ...DEFAULTS, ...(data as Partial<StudioSettings>) } : DEFAULTS
  return <StudioForm settings={settings} />
}

export default function StudioSettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Content />
    </Suspense>
  )
}
