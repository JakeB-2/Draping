import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'
import BlockedPeriodsSection from './BlockedPeriodsSection'
import RecurringBlocksSection from './RecurringBlocksSection'
import type { BookingSettings, WeeklyScheduleRow } from './SettingsForm'
import type { RecurringBlock } from '@/lib/availability'

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type BlockedPeriod = { id: string; start_at: string; end_at: string; reason: string | null }

export default async function SettingsPage() {
  const supabase = await createClient()

  const [
    { data: settingsData },
    { data: scheduleData },
    { data: periodsData },
    { data: recurringData },
  ] = await Promise.all([
    supabase.from('booking_settings').select('*').limit(1).maybeSingle(),
    supabase.from('weekly_schedule').select('*').order('weekday_number'),
    supabase.from('blocked_periods').select('*').order('start_at'),
    supabase.from('recurring_blocks').select('*').order('created_at'),
  ])

  const settings = settingsData as unknown as BookingSettings | null
  const schedule = (scheduleData ?? []) as unknown as WeeklyScheduleRow[]
  const periods = (periodsData ?? []) as unknown as BlockedPeriod[]
  const recurringBlocks = (recurringData ?? []) as unknown as RecurringBlock[]

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <SettingsForm
        settings={settings}
        schedule={schedule}
        weekdayLabels={WEEKDAY_LABELS}
      />
      <BlockedPeriodsSection initialPeriods={periods} />
      <RecurringBlocksSection initialBlocks={recurringBlocks} />
    </div>
  )
}
