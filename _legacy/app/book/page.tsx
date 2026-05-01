import { createClient } from '@/lib/supabase/server'
import BookingFlow from './BookingFlow'
import type { RecurringBlock } from '@/lib/availability'

export default async function BookPage() {
  const supabase = await createClient()

  const [
    { data: offeringsData },
    { data: serviceGroupsData },
    { data: settingsData },
    { data: recurringData },
  ] = await Promise.all([
    supabase.from('offerings').select('*').eq('is_active', true).order('name'),
    supabase.from('service_groups').select('*').order('name'),
    supabase.from('booking_settings').select('*').limit(1).maybeSingle(),
    supabase.from('recurring_blocks').select('*'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerings = (offeringsData ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serviceGroups = (serviceGroupsData ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsData as any
  const recurringBlocks = (recurringData ?? []) as RecurringBlock[]

  return (
    <BookingFlow
      offerings={offerings}
      serviceGroups={serviceGroups}
      settings={settings}
      recurringBlocks={recurringBlocks}
    />
  )
}
