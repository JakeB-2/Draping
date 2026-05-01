'use server'

import { startOfDay, endOfDay } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { BookingInterval, BlockedInterval } from '@/lib/availability'

export type DayAvailability = {
  bookings: (BookingInterval & { status: string; is_waitlist: boolean })[]
  blockedPeriods: BlockedInterval[]
}

export async function getDayAvailability(
  dateStr: string, // "YYYY-MM-DD"
): Promise<DayAvailability | string> {
  const date = new Date(dateStr + 'T12:00:00') // noon avoids DST edge cases
  const dayStart = startOfDay(date).toISOString()
  const dayEnd = endOfDay(date).toISOString()

  const supabase = await createClient()

  const [{ data: bookingsData, error: bErr }, { data: periodsData, error: pErr }] =
    await Promise.all([
      supabase
        .from('bookings')
        .select('starts_at, ends_at, status')
        .in('status', ['pending', 'confirmed'])
        .gte('ends_at', dayStart)
        .lte('starts_at', dayEnd),
      supabase
        .from('blocked_periods')
        .select('start_at, end_at')
        .gte('end_at', dayStart)
        .lte('start_at', dayEnd),
    ])

  if (bErr) return bErr.message
  if (pErr) return pErr.message

  return {
    bookings: (bookingsData ?? []).map((b) => ({ ...b, is_waitlist: false })) as DayAvailability['bookings'],
    blockedPeriods: (periodsData ?? []) as BlockedInterval[],
  }
}
