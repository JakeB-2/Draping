import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { RulesForm, type Rules } from './rules-form'

const RULES_DEFAULTS: Rules = {
  min_lead_hours: 24,
  max_advance_days: 60,
  max_booked_minutes_per_day: null,
  max_booking_days_per_week: null,
  max_consecutive_booking_days: null,
  break_minutes: null,
  quote_notice_text: null,
}

async function Content() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_settings')
    .select('min_lead_hours, max_advance_days, max_booked_minutes_per_day, max_booking_days_per_week, max_consecutive_booking_days, break_minutes, quote_notice_text')
    .limit(1)
    .maybeSingle()
  if (error) throw error

  const rules: Rules = data ? { ...RULES_DEFAULTS, ...(data as Partial<Rules>) } : RULES_DEFAULTS
  return <RulesForm rules={rules} />
}

function ContentSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

export default function BookingOptionsSettingsPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Content />
    </Suspense>
  )
}
