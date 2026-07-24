import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { ScheduleForm, type Day } from './schedule-form'
import { RecurringSection, type Recurring } from './recurring-section'

async function Content() {
  const supabase = await createClient()
  const [scheduleRes, recurringRes] = await Promise.all([
    supabase.from('weekly_schedule').select('weekday_number, is_open, start_time, end_time').order('weekday_number'),
    supabase.from('recurring_blocks').select('id, label, weekdays, start_time, end_time, valid_from, valid_until').order('created_at', { ascending: false }),
  ])
  if (scheduleRes.error) throw scheduleRes.error
  if (recurringRes.error) throw recurringRes.error

  const days = (scheduleRes.data ?? []) as Day[]
  const recurring = (recurringRes.data ?? []) as Recurring[]

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
    </div>
  )
}

function ContentSkeleton() {
  return (
    <div className="space-y-10">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      ))}
    </div>
  )
}

export default function AvailabilitySettingsPage() {
  return (
    <Suspense fallback={<ContentSkeleton />}>
      <Content />
    </Suspense>
  )
}
