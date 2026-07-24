import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SectionSkeleton } from '../section-form'
import { ParticipationForm, type ParticipationSettings } from './participation-form'

const DEFAULTS: ParticipationSettings = {
  max_participants_per_booking: 2,
  pair_discount_percent: 0,
}

async function Content() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_settings')
    .select('max_participants_per_booking, pair_discount_percent')
    .limit(1)
    .maybeSingle()
  if (error) throw error

  const settings: ParticipationSettings = data ? { ...DEFAULTS, ...(data as Partial<ParticipationSettings>) } : DEFAULTS
  return <ParticipationForm settings={settings} />
}

export default function ParticipationSettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Content />
    </Suspense>
  )
}
