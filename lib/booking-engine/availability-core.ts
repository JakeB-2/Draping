// Pure availability math for the booking engine (plan §9.1/§9.2).
// No I/O — callers load data, these functions compute. Mirrors the
// semantics of booking_engine_validate_slot() in migration 011; if you
// change a rule here, change it there too (the SQL side is the
// authority at submission time, so drift only ever costs a clean
// re-offer, never a wrong booking).

import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  mondayForDateKey,
  safeTimeZone,
  weekdayForDateKey,
  zonedDateTimeToUtc,
} from '../time-zone.ts'
import { BOOKING_START_INCREMENT_MINUTES, roundUpToBookingIncrement } from '../booking-time.ts'

export type ScheduleDayRow = {
  weekday_number: number
  is_open: boolean
  start_time: string | null
  end_time: string | null
}

export type BlockedPeriodRow = { start_at: string; end_at: string }

export type RecurringBlockRow = {
  weekdays: number[]
  start_time: string
  end_time: string
  valid_from: string | null
  valid_until: string | null
}

export type BookingOccupancyRow = {
  id: string
  starts_at: string
  ends_at: string
  occupied_until: string | null
  buffer_minutes: number | null
  duration_minutes: number | null
  status: string
  is_waitlist: boolean
}

export type AvailabilitySettings = {
  timezone: string | null
  min_lead_hours: number | null
  max_advance_days: number | null
  max_booked_minutes_per_day: number | null
  max_booking_days_per_week: number | null
  max_consecutive_booking_days: number | null
}

export type AvailabilityData = {
  settings: AvailabilitySettings
  schedule: ScheduleDayRow[]
  blocked: BlockedPeriodRow[]
  recurring: RecurringBlockRow[]
  bookings: BookingOccupancyRow[]
}

/** Half-open interval in epoch milliseconds. */
export type Interval = { s: number; e: number }

export type DayContext = {
  date: string
  weekday: number
  /** Schedule window for the day (UTC ms). */
  dayStart: number
  dayEnd: number
  /** Free stretches: schedule − blocks − occupied booking ranges. */
  sessionFree: Interval[]
  /** Minutes already booked on this local day (active, non-waitlist). */
  usedMinutes: number
  /** False when week-days / consecutive-days caps exclude the day. */
  dayAllowed: boolean
}

const MINUTE = 60_000

function overlaps(a: Interval, b: Interval): boolean {
  return a.s < b.e && a.e > b.s
}

function subtract(base: Interval, cuts: Interval[]): Interval[] {
  let result: Interval[] = [base]
  for (const cut of cuts) {
    const next: Interval[] = []
    for (const part of result) {
      if (!overlaps(part, cut)) {
        next.push(part)
        continue
      }
      if (cut.s > part.s) next.push({ s: part.s, e: Math.min(cut.s, part.e) })
      if (cut.e < part.e) next.push({ s: Math.max(cut.e, part.s), e: part.e })
    }
    result = next
  }
  return result.filter((part) => part.e > part.s)
}

/** Conflict window of an existing booking: [starts_at, occupied_until). */
export function occupiedInterval(booking: BookingOccupancyRow): Interval {
  const start = Date.parse(booking.starts_at)
  if (booking.occupied_until) return { s: start, e: Date.parse(booking.occupied_until) }
  // Legacy rows without occupied_until: mirror the pre-011 derivation
  // (duration rounded up to the 30-minute grid, plus buffer).
  const end = Date.parse(booking.ends_at)
  const duration = booking.duration_minutes && booking.duration_minutes > 0
    ? booking.duration_minutes
    : Math.round((end - start) / MINUTE)
  const occupied = start
    + roundUpToBookingIncrement(duration) * MINUTE
    + Math.max(0, booking.buffer_minutes ?? 0) * MINUTE
  return { s: start, e: Math.max(end, occupied) }
}

export function activeOccupancies(bookings: BookingOccupancyRow[]): Interval[] {
  return bookings
    .filter((b) => (b.status === 'pending' || b.status === 'confirmed') && !b.is_waitlist)
    .map(occupiedInterval)
}

function activeRows(bookings: BookingOccupancyRow[]): BookingOccupancyRow[] {
  return bookings.filter(
    (b) => (b.status === 'pending' || b.status === 'confirmed') && !b.is_waitlist,
  )
}

/**
 * Per-day availability contexts over a date range. Day-level caps that
 * are independent of duration (week-days, consecutive-days) are applied
 * here; the duration-dependent daily-minutes cap is exposed as
 * usedMinutes for fits/starts to apply.
 */
export function computeDayContexts(
  data: AvailabilityData,
  from: string,
  to: string,
): DayContext[] {
  const tz = safeTimeZone(data.settings.timezone)
  const scheduleByWeekday = new Map(data.schedule.map((d) => [d.weekday_number, d]))
  const active = activeRows(data.bookings)
  const occupied = active.map(occupiedInterval)

  const bookedDates = new Set<string>()
  const bookedMinutesByDay = new Map<string, number>()
  for (const booking of active) {
    const date = dateKeyInTimeZone(new Date(booking.starts_at), tz)
    const minutes = (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / MINUTE
    bookedDates.add(date)
    bookedMinutesByDay.set(date, (bookedMinutesByDay.get(date) ?? 0) + minutes)
  }

  const maxWeekDays = data.settings.max_booking_days_per_week
  const maxConsecutive = data.settings.max_consecutive_booking_days

  const contexts: DayContext[] = []
  for (let date = from; date <= to; date = addDaysToDateKey(date, 1)) {
    const weekday = weekdayForDateKey(date)
    const schedule = scheduleByWeekday.get(weekday)
    if (!schedule?.is_open || !schedule.start_time || !schedule.end_time) continue

    const dayStart = zonedDateTimeToUtc(date, schedule.start_time, tz).getTime()
    const dayEnd = zonedDateTimeToUtc(date, schedule.end_time, tz).getTime()
    if (dayEnd <= dayStart) continue

    let dayAllowed = true
    if (maxWeekDays !== null && maxWeekDays !== undefined && !bookedDates.has(date)) {
      const weekStart = mondayForDateKey(date)
      const weekEnd = addDaysToDateKey(weekStart, 6)
      const daysThisWeek = [...bookedDates].filter((d) => d >= weekStart && d <= weekEnd).length
      if (daysThisWeek >= maxWeekDays) dayAllowed = false
    }
    if (dayAllowed && maxConsecutive !== null && maxConsecutive !== undefined && !bookedDates.has(date)) {
      if (maxConsecutive === 0) {
        dayAllowed = false
      } else {
        let before = 0
        for (let c = addDaysToDateKey(date, -1); bookedDates.has(c); c = addDaysToDateKey(c, -1)) before += 1
        let after = 0
        for (let c = addDaysToDateKey(date, 1); bookedDates.has(c); c = addDaysToDateKey(c, 1)) after += 1
        if (before + 1 + after > maxConsecutive) dayAllowed = false
      }
    }

    const cuts: Interval[] = [...occupied]
    for (const block of data.blocked) {
      cuts.push({ s: Date.parse(block.start_at), e: Date.parse(block.end_at) })
    }
    for (const block of data.recurring) {
      if (!block.weekdays.includes(weekday)) continue
      if (block.valid_from && date < block.valid_from) continue
      if (block.valid_until && date > block.valid_until) continue
      cuts.push({
        s: zonedDateTimeToUtc(date, block.start_time, tz).getTime(),
        e: zonedDateTimeToUtc(date, block.end_time, tz).getTime(),
      })
    }

    contexts.push({
      date,
      weekday,
      dayStart,
      dayEnd,
      sessionFree: subtract({ s: dayStart, e: dayEnd }, cuts),
      usedMinutes: bookedMinutesByDay.get(date) ?? 0,
      dayAllowed,
    })
  }
  return contexts
}

/**
 * Open windows (plan §9.1): truthful contiguous free time per day,
 * independent of any duration. Clipped to the lead-time horizon.
 */
export function computeOpenWindows(
  data: AvailabilityData,
  from: string,
  to: string,
  now: Date,
): { date: string; windows: { start_iso: string; end_iso: string }[] }[] {
  const earliest = now.getTime()
    + Math.max(0, data.settings.min_lead_hours ?? 0) * 60 * MINUTE
  return computeDayContexts(data, from, to)
    .filter((ctx) => ctx.dayAllowed)
    .map((ctx) => ({
      date: ctx.date,
      windows: ctx.sessionFree
        .map((w) => ({ s: Math.max(w.s, earliest), e: w.e }))
        .filter((w) => w.e > w.s)
        .map((w) => ({
          start_iso: new Date(w.s).toISOString(),
          end_iso: new Date(w.e).toISOString(),
        })),
    }))
    .filter((day) => day.windows.length > 0)
}

/**
 * Candidate start times for a day: the offering's allowed start times
 * when set, otherwise every half-hour tick inside the schedule window.
 * Generated in local wall-clock time (DST-safe), returned as UTC ms.
 */
export function candidateStarts(
  ctx: DayContext,
  timezone: string | null,
  allowedStartTimes: string[],
): number[] {
  const tz = safeTimeZone(timezone)
  const ticks: number[] = []
  if (allowedStartTimes.length > 0) {
    for (const time of allowedStartTimes) {
      const t = zonedDateTimeToUtc(ctx.date, time.slice(0, 5), tz).getTime()
      if (t >= ctx.dayStart && t < ctx.dayEnd) ticks.push(t)
    }
    return ticks.sort((a, b) => a - b)
  }
  // Absolute half-hour grid (…:00 / …:30) inside the schedule window.
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 30]) {
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const t = zonedDateTimeToUtc(ctx.date, time, tz).getTime()
      if (t >= ctx.dayStart && t < ctx.dayEnd) ticks.push(t)
    }
  }
  return ticks.sort((a, b) => a - b)
}

/**
 * The one start-validity predicate shared by fits() and starts().
 * Mirrors booking_engine_validate_slot(): session inside a free
 * stretch, buffer clear of occupied bookings (it may overlap blocks
 * and spill past closing), lead time respected, daily-minutes cap.
 */
export function isValidStart(
  ctx: DayContext,
  data: AvailabilityData,
  startMs: number,
  durationMinutes: number,
  bufferMinutes: number,
  now: Date,
  options?: { skipLeadChecks?: boolean },
): boolean {
  if (!ctx.dayAllowed) return false
  const session: Interval = { s: startMs, e: startMs + durationMinutes * MINUTE }
  const occupiedEnd = session.e + Math.max(0, bufferMinutes) * MINUTE

  // skipLeadChecks (admin) waives the lead-time margin, never the past:
  // a start that has already gone by is never offered.
  if (startMs < now.getTime()) return false
  if (!options?.skipLeadChecks) {
    const earliest = now.getTime() + Math.max(0, data.settings.min_lead_hours ?? 0) * 60 * MINUTE
    if (startMs < earliest) return false
  }
  if (!ctx.sessionFree.some((w) => session.s >= w.s && session.e <= w.e)) return false
  if (occupiedEnd > session.e) {
    const buffer: Interval = { s: session.e, e: occupiedEnd }
    if (activeOccupancies(data.bookings).some((o) => overlaps(o, buffer))) return false
  }
  const cap = data.settings.max_booked_minutes_per_day
  if (cap !== null && cap !== undefined && ctx.usedMinutes + durationMinutes > cap) return false
  return true
}

/**
 * Earliest valid start for a duration inside one open window (used by
 * fits()); null when nothing fits.
 */
export function earliestStartInWindow(
  ctx: DayContext,
  data: AvailabilityData,
  window: Interval,
  durationMinutes: number,
  bufferMinutes: number,
  allowedStartTimes: string[],
  now: Date,
  options?: { skipLeadChecks?: boolean },
): number | null {
  for (const tick of candidateStarts(ctx, data.settings.timezone, allowedStartTimes)) {
    if (tick < window.s) continue
    if (tick + durationMinutes * MINUTE > window.e) break
    if (isValidStart(ctx, data, tick, durationMinutes, bufferMinutes, now, options)) return tick
  }
  return null
}

/** All valid starts for an exact duration on one day (plan §9.2 `starts`). */
export function validStartsForDay(
  ctx: DayContext,
  data: AvailabilityData,
  durationMinutes: number,
  bufferMinutes: number,
  allowedStartTimes: string[],
  now: Date,
  options?: { skipLeadChecks?: boolean },
): number[] {
  return candidateStarts(ctx, data.settings.timezone, allowedStartTimes)
    .filter((tick) => isValidStart(ctx, data, tick, durationMinutes, bufferMinutes, now, options))
}

export { BOOKING_START_INCREMENT_MINUTES }
