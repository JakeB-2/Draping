// Pure client/server-safe availability helpers.
// No Supabase imports — just date logic.

export type BookingInterval = { starts_at: string; ends_at: string }
export type BlockedInterval = { start_at: string; end_at: string }
export type RecurringBlock = {
  id: string
  weekdays: number[]   // 0=Sun … 6=Sat
  start_time: string   // "HH:MM"
  end_time: string     // "HH:MM"
  valid_from: string | null   // "YYYY-MM-DD"
  valid_until: string | null  // "YYYY-MM-DD"
}

// Returns true if [a, b) overlaps [c, d)
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart
}

// Parses "HH:MM" into { h, m }
function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(':').map(Number)
  return { h, m }
}

// Returns the concrete [start, end] interval for a recurring block on a specific date,
// or null if the block does not apply to that date.
// Uses the JS Date local timezone (consistent since this runs in the same environment
// as the booking display).
export function getRecurringBlockInterval(
  block: RecurringBlock,
  date: Date,
): { start: Date; end: Date } | null {
  const weekday = date.getDay() // 0=Sun … 6=Sat
  if (!block.weekdays.includes(weekday)) return null

  if (block.valid_from) {
    const from = new Date(block.valid_from + 'T00:00:00')
    if (date < from) return null
  }
  if (block.valid_until) {
    const until = new Date(block.valid_until + 'T23:59:59')
    if (date > until) return null
  }

  const { h: sh, m: sm } = parseTime(block.start_time)
  const { h: eh, m: em } = parseTime(block.end_time)

  const start = new Date(date)
  start.setHours(sh, sm, 0, 0)

  const end = new Date(date)
  end.setHours(eh, em, 0, 0)

  return { start, end }
}

// Returns whether a proposed slot is free of all conflicts.
export function isSlotAvailable(
  slotStart: Date,
  slotEnd: Date,
  bookings: BookingInterval[],
  blockedPeriods: BlockedInterval[],
  recurringBlocks: RecurringBlock[],
): boolean {
  for (const b of bookings) {
    if (overlaps(slotStart, slotEnd, new Date(b.starts_at), new Date(b.ends_at))) return false
  }
  for (const p of blockedPeriods) {
    if (overlaps(slotStart, slotEnd, new Date(p.start_at), new Date(p.end_at))) return false
  }
  for (const r of recurringBlocks) {
    const interval = getRecurringBlockInterval(r, slotStart)
    if (interval && overlaps(slotStart, slotEnd, interval.start, interval.end)) return false
  }
  return true
}

// Returns whether any PENDING booking (not confirmed) overlaps this slot.
// Used to decide whether to show the waitlist warning.
export function hasPendingOverlap(
  slotStart: Date,
  slotEnd: Date,
  bookings: (BookingInterval & { status: string; is_waitlist: boolean })[],
): boolean {
  return bookings.some(
    (b) =>
      b.status === 'pending' &&
      !b.is_waitlist &&
      overlaps(slotStart, slotEnd, new Date(b.starts_at), new Date(b.ends_at)),
  )
}
