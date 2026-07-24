import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SectionSkeleton } from '../section-form'
import { TimezoneForm } from './timezone-form'

async function Content() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_settings')
    .select('timezone')
    .limit(1)
    .maybeSingle()
  if (error) throw error

  return <TimezoneForm timezone={data?.timezone ?? 'America/Toronto'} />
}

export default function TimezoneSettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Content />
    </Suspense>
  )
}
