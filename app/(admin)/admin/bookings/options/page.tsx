import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { ScheduleForm, type Day } from './schedule-form'
import { RecurringSection, type Recurring } from './recurring-section'
import { RulesForm, type Rules } from './rules-form'

const RULES_DEFAULTS: Rules = {
  min_lead_hours: 24,
  max_advance_days: 60,
  max_booked_minutes_per_day: null,
  max_booking_days_per_week: null,
  max_consecutive_booking_days: null,
}

async function OptionsContent() {
  const supabase = await createClient()
  const [scheduleRes, recurringRes, settingsRes] = await Promise.all([
    supabase.from('weekly_schedule').select('weekday_number, is_open, start_time, end_time').order('weekday_number'),
    supabase.from('recurring_blocks').select('id, label, weekdays, start_time, end_time, valid_from, valid_until').order('created_at', { ascending: false }),
    supabase.from('booking_settings').select('min_lead_hours, max_advance_days, max_booked_minutes_per_day, max_booking_days_per_week, max_consecutive_booking_days').limit(1).maybeSingle(),
  ])
  if (scheduleRes.error) throw scheduleRes.error
  if (recurringRes.error) throw recurringRes.error
  if (settingsRes.error) throw settingsRes.error

  const days = (scheduleRes.data ?? []) as Day[]
  const recurring = (recurringRes.data ?? []) as Recurring[]
  const rules: Rules = settingsRes.data
    ? { ...RULES_DEFAULTS, ...(settingsRes.data as Partial<Rules>) }
    : RULES_DEFAULTS

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-light">Weekly schedule</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set the hours bookings can land on each weekday. Closed days have no available slots regardless of other rules.
          </p>
        </header>
        <ScheduleForm days={days} />
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-light">Recurring blocks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Repeating windows blocked from booking — e.g. lunch, recurring commitments.
          </p>
        </header>
        <RecurringSection items={recurring} />
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-light">Booking rules</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Lead times, booking windows, and daily + weekly caps. Start times and buffers are configured on each offering.
          </p>
        </header>
        <RulesForm rules={rules} />
      </section>
    </div>
  )
}

function ContentSkeleton() {
  return (
    <div className="space-y-10">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      ))}
    </div>
  )
}

export default function BookingOptionsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin/bookings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to bookings
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-2">Bookings · More options</p>
        <h1 className="text-2xl font-light mt-1">Schedule + rules</h1>
      </div>
      <Suspense fallback={<ContentSkeleton />}>
        <OptionsContent />
      </Suspense>
    </div>
  )
}
