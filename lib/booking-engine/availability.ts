// Server-only availability queries (plan §9.2): windows, fits, starts.
// quote() lives in engine.ts. Browsing queries are advisory — the
// atomic submission (booking_engine_create) re-validates everything,
// so a stale answer here can only ever cost a clean re-offer.

import { createAdminClient } from '../supabase/admin.ts'
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  daysBetween,
  safeTimeZone,
} from '../time-zone.ts'
import {
  computeDayContexts,
  computeOpenWindows,
  candidateStarts,
  earliestStartInWindow,
  isValidStart,
  validStartsForDay,
  type AvailabilityData,
  type DayContext,
} from './availability-core.ts'
import { getQuote } from './engine.ts'
import type {
  DayWindows,
  EngineResult,
  OfferingFit,
  ParticipantInput,
  SegmentInput,
  StartsResult,
  WindowsResult,
} from './types.ts'

const MAX_RANGE_DAYS = 92
// Covers the consecutive-days / week caps when judging edge days.
const LOOKAROUND_DAYS = 40

type Supabase = ReturnType<typeof createAdminClient>

async function loadAvailabilityData(
  supabase: Supabase,
  from: string,
  to: string,
): Promise<{ ok: true; data: AvailabilityData } | { ok: false; error: string }> {
  const [settingsRes, scheduleRes, blocksRes, recurringRes] = await Promise.all([
    supabase.from('booking_settings').select('*').limit(1).maybeSingle(),
    supabase.from('weekly_schedule').select('weekday_number, is_open, start_time, end_time'),
    supabase.from('blocked_periods').select('start_at, end_at'),
    supabase.from('recurring_blocks').select('weekdays, start_time, end_time, valid_from, valid_until'),
  ])
  const firstError = settingsRes.error ?? scheduleRes.error ?? blocksRes.error ?? recurringRes.error
  if (firstError) return { ok: false, error: firstError.message }

  const settings = settingsRes.data ?? {}
  const tz = safeTimeZone(settings.timezone)
  const queryFrom = new Date(`${addDaysToDateKey(from, -LOOKAROUND_DAYS)}T00:00:00Z`)
  const queryTo = new Date(`${addDaysToDateKey(to, LOOKAROUND_DAYS + 2)}T00:00:00Z`)
  const bookingsRes = await supabase
    .from('bookings')
    .select('id, starts_at, ends_at, occupied_until, buffer_minutes, duration_minutes, status, is_waitlist')
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', queryTo.toISOString())
    .gt('ends_at', queryFrom.toISOString())
  if (bookingsRes.error) return { ok: false, error: bookingsRes.error.message }

  return {
    ok: true,
    data: {
      settings: {
        timezone: tz,
        min_lead_hours: settings.min_lead_hours ?? 0,
        max_advance_days: settings.max_advance_days ?? 60,
        max_booked_minutes_per_day: settings.max_booked_minutes_per_day ?? null,
        max_booking_days_per_week: settings.max_booking_days_per_week ?? null,
        max_consecutive_booking_days: settings.max_consecutive_booking_days ?? null,
      },
      schedule: scheduleRes.data ?? [],
      blocked: blocksRes.data ?? [],
      recurring: recurringRes.data ?? [],
      bookings: bookingsRes.data ?? [],
    },
  }
}

function clipRange(data: AvailabilityData, from: string, to: string, now: Date) {
  const tz = safeTimeZone(data.settings.timezone)
  const today = dateKeyInTimeZone(now, tz)
  const maxAdvanceDate = addDaysToDateKey(today, Math.max(1, data.settings.max_advance_days ?? 60))
  return {
    from: from < today ? today : from,
    to: to > maxAdvanceDate ? maxAdvanceDate : to,
    maxAdvanceDate,
    timezone: tz,
  }
}

/**
 * Open windows per day (plan §9.1): the truthful calendar primitive.
 * Contiguous free time regardless of what the visitor eventually picks.
 */
export async function windows(
  fromDate: string,
  toDate: string,
): Promise<EngineResult<WindowsResult>> {
  if (toDate < fromDate || daysBetween(fromDate, toDate) > MAX_RANGE_DAYS) {
    return { ok: false, code: 'unknown', error: `Choose a date range of ${MAX_RANGE_DAYS + 1} days or fewer.` }
  }
  const now = new Date()
  const supabase = createAdminClient()
  const loaded = await loadAvailabilityData(supabase, fromDate, toDate)
  if (!loaded.ok) return { ok: false, code: 'unknown', error: loaded.error }

  const { from, to, maxAdvanceDate, timezone } = clipRange(loaded.data, fromDate, toDate, now)
  const days: DayWindows[] = to < from ? [] : computeOpenWindows(loaded.data, from, to, now)
  return { ok: true, data: { timezone, from, to, max_advance_date: maxAdvanceDate, days } }
}

type OfferingMeta = {
  offering_id: string
  name: string
  buffer_minutes: number
  allowed_start_times: string[]
  min_duration_minutes: number | null
  max_duration_minutes: number | null
}

async function loadOfferingMeta(
  supabase: Supabase,
  offeringId?: string,
): Promise<{ ok: true; offerings: OfferingMeta[] } | { ok: false; error: string }> {
  let offeringsQuery = supabase
    .from('offerings')
    .select('id, name, buffer_minutes, allowed_start_times, is_active')
    .eq('is_active', true)
  if (offeringId) offeringsQuery = offeringsQuery.eq('id', offeringId)

  const [offeringsRes, memberRes, termsRes, settingsRes] = await Promise.all([
    offeringsQuery,
    supabase.from('offering_services').select('offering_id, service_id'),
    supabase.from('service_duration_terms').select('service_id, participant_count, duration_minutes'),
    supabase.from('booking_settings').select('max_participants_per_booking').limit(1).maybeSingle(),
  ])
  const firstError = offeringsRes.error ?? memberRes.error ?? termsRes.error ?? settingsRes.error
  if (firstError) return { ok: false, error: firstError.message }

  const cap = Number(settingsRes.data?.max_participants_per_booking ?? 2)
  const termsByService = new Map<string, Map<number, number>>()
  for (const term of termsRes.data ?? []) {
    const perCount = termsByService.get(term.service_id) ?? new Map<number, number>()
    perCount.set(Number(term.participant_count), Number(term.duration_minutes))
    termsByService.set(term.service_id, perCount)
  }
  const membersByOffering = new Map<string, string[]>()
  for (const member of memberRes.data ?? []) {
    const list = membersByOffering.get(member.offering_id) ?? []
    list.push(member.service_id)
    membersByOffering.set(member.offering_id, list)
  }

  const offerings: OfferingMeta[] = (offeringsRes.data ?? []).map((offering) => {
    const members = membersByOffering.get(offering.id) ?? []
    let min: number | null = members.length > 0 ? 0 : null
    let max: number | null = members.length > 0 ? 0 : null
    for (const serviceId of members) {
      const perCount = termsByService.get(serviceId)
      const solo = perCount?.get(1)
      if (solo === undefined) {
        min = null
        max = null
        break
      }
      min = (min ?? 0) + solo
      let best = solo
      for (const [count, duration] of perCount!) {
        if (count <= cap && count > 1) best = Math.max(best, duration)
      }
      max = (max ?? 0) + best
    }
    return {
      offering_id: offering.id,
      name: offering.name,
      buffer_minutes: Number(offering.buffer_minutes ?? 0),
      allowed_start_times: (offering.allowed_start_times ?? []).map((t: string) => t.slice(0, 5)),
      min_duration_minutes: min,
      max_duration_minutes: max,
    }
  })
  return { ok: true, offerings }
}

export type FitsInput =
  | { window: { start_iso: string; end_iso: string } }
  | { start_iso: string }

/**
 * Which offerings fit a chosen window (or exact start) — plan §9.2
 * `fits`. An offering fits when some allowed start leaves room for at
 * least its minimum duration (all member services at attendee count 1).
 */
export async function fits(
  input: FitsInput,
  offeringId?: string,
): Promise<EngineResult<OfferingFit[]>> {
  const now = new Date()
  const supabase = createAdminClient()

  const anchorIso = 'window' in input ? input.window.start_iso : input.start_iso
  const anchor = new Date(anchorIso)
  if (Number.isNaN(anchor.getTime())) {
    return { ok: false, code: 'invalid_start_time', error: 'Invalid time' }
  }

  const meta = await loadOfferingMeta(supabase, offeringId)
  if (!meta.ok) return { ok: false, code: 'unknown', error: meta.error }

  const settingsRes = await supabase.from('booking_settings').select('timezone').limit(1).maybeSingle()
  if (settingsRes.error) return { ok: false, code: 'unknown', error: settingsRes.error.message }
  const tz = safeTimeZone(settingsRes.data?.timezone)
  const date = dateKeyInTimeZone(anchor, tz)
  const loaded = await loadAvailabilityData(supabase, date, date)
  if (!loaded.ok) return { ok: false, code: 'unknown', error: loaded.error }

  const { from, to } = clipRange(loaded.data, date, date, now)
  const contexts = to < from ? [] : computeDayContexts(loaded.data, from, to)
  const ctx: DayContext | undefined = contexts.find((c) => c.date === date)

  const results: OfferingFit[] = meta.offerings.map((offering) => {
    let earliest: number | null = null
    if (ctx && offering.min_duration_minutes !== null) {
      if ('window' in input) {
        earliest = earliestStartInWindow(
          ctx,
          loaded.data,
          { s: Date.parse(input.window.start_iso), e: Date.parse(input.window.end_iso) },
          offering.min_duration_minutes,
          offering.buffer_minutes,
          offering.allowed_start_times,
          now,
        )
      } else {
        const tick = anchor.getTime()
        const isCandidate = candidateStarts(ctx, tz, offering.allowed_start_times).includes(tick)
        if (
          isCandidate
          && isValidStart(ctx, loaded.data, tick, offering.min_duration_minutes, offering.buffer_minutes, now)
        ) {
          earliest = tick
        }
      }
    }
    return {
      offering_id: offering.offering_id,
      name: offering.name,
      min_duration_minutes: offering.min_duration_minutes ?? 0,
      max_duration_minutes: offering.max_duration_minutes ?? 0,
      fits: earliest !== null,
      earliest_start_iso: earliest === null ? null : new Date(earliest).toISOString(),
    }
  })
  return { ok: true, data: results }
}

/**
 * Valid start times for the exact configured duration (plan §9.2
 * `starts`). Duration and buffer come from the authoritative quote —
 * the client never supplies them.
 */
export async function starts(
  offeringId: string,
  participants: ParticipantInput[],
  segments: SegmentInput[],
  fromDate: string,
  toDate: string,
  options?: { skipLeadChecks?: boolean; excludeBookingId?: string },
): Promise<EngineResult<StartsResult>> {
  if (toDate < fromDate || daysBetween(fromDate, toDate) > MAX_RANGE_DAYS) {
    return { ok: false, code: 'unknown', error: `Choose a date range of ${MAX_RANGE_DAYS + 1} days or fewer.` }
  }
  const quote = await getQuote(offeringId, participants, segments)
  if (!quote.ok) return quote

  const now = new Date()
  const supabase = createAdminClient()
  const loaded = await loadAvailabilityData(supabase, fromDate, toDate)
  if (!loaded.ok) return { ok: false, code: 'unknown', error: loaded.error }
  if (options?.excludeBookingId) {
    loaded.data.bookings = loaded.data.bookings.filter((b) => b.id !== options.excludeBookingId)
  }

  const offeringRes = await supabase
    .from('offerings')
    .select('allowed_start_times')
    .eq('id', offeringId)
    .maybeSingle()
  if (offeringRes.error) return { ok: false, code: 'unknown', error: offeringRes.error.message }
  const allowed = (offeringRes.data?.allowed_start_times ?? []).map((t: string) => t.slice(0, 5))

  const { from, to, timezone } = clipRange(loaded.data, fromDate, toDate, now)
  const contexts = to < from ? [] : computeDayContexts(loaded.data, from, to)

  const days = contexts
    .map((ctx) => ({
      date: ctx.date,
      start_isos: validStartsForDay(
        ctx,
        loaded.data,
        quote.data.duration_minutes,
        quote.data.buffer_minutes,
        allowed,
        now,
        options,
      ).map((t) => new Date(t).toISOString()),
    }))
    .filter((day) => day.start_isos.length > 0)

  return {
    ok: true,
    data: {
      timezone,
      duration_minutes: quote.data.duration_minutes,
      buffer_minutes: quote.data.buffer_minutes,
      days,
    },
  }
}
