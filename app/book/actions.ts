'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSlotAvailable, type BookingInterval, type BlockedInterval } from '@/lib/availability'
import { getBookingEmailContext } from '@/lib/email/booking-context'
import { runTrigger } from '@/lib/email/triggers'
import {
  addDaysToDateKey,
  dateKeyInTimeZone,
  daysBetween,
  mondayForDateKey,
  safeTimeZone,
  weekdayForDateKey,
  zonedDateTimeToUtc,
} from '@/lib/time-zone'

export type DayAvailability = {
  date: string
  weekday: number
  slot_isos: string[]
}

export type AvailabilityResult =
  | {
      ok: true
      days: DayAvailability[]
      timezone: string
      from: string
      to: string
      max_advance_date: string
    }
  | { ok: false; error: string }

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

function isDateKey(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function dateWithin(value: string, from: string, to: string) {
  return value >= from && value <= to
}

function hasTooManyConsecutiveDays(
  date: string,
  bookedDates: Set<string>,
  maximum: number | null,
) {
  if (maximum === null || bookedDates.has(date)) return false
  if (maximum === 0) return true

  let before = 0
  for (let cursor = addDaysToDateKey(date, -1); bookedDates.has(cursor); cursor = addDaysToDateKey(cursor, -1)) {
    before += 1
  }

  let after = 0
  for (let cursor = addDaysToDateKey(date, 1); bookedDates.has(cursor); cursor = addDaysToDateKey(cursor, 1)) {
    after += 1
  }

  return before + 1 + after > maximum
}

export async function getAvailableSlots(
  offeringId: string,
  requestedFrom: string,
  requestedTo: string,
): Promise<AvailabilityResult> {
  const parsed = z.object({
    offeringId: z.string().uuid(),
    from: dateKeySchema.refine(isDateKey),
    to: dateKeySchema.refine(isDateKey),
  }).safeParse({ offeringId, from: requestedFrom, to: requestedTo })

  if (!parsed.success) return { ok: false, error: 'Choose a valid date range.' }
  if (parsed.data.to < parsed.data.from || daysBetween(parsed.data.from, parsed.data.to) > 92) {
    return { ok: false, error: 'Choose a date range of 93 days or fewer.' }
  }

  const supabase = createAdminClient()
  const [offeringRes, settingsRes, scheduleRes, blocksRes, recurringRes] = await Promise.all([
    supabase.from('offerings').select('id, duration_minutes, is_active').eq('id', parsed.data.offeringId).maybeSingle(),
    supabase.from('booking_settings').select('*').limit(1).maybeSingle(),
    supabase.from('weekly_schedule').select('weekday_number, is_open, start_time, end_time'),
    supabase.from('blocked_periods').select('start_at, end_at'),
    supabase.from('recurring_blocks').select('id, weekdays, start_time, end_time, valid_from, valid_until'),
  ])

  if (offeringRes.error) return { ok: false, error: offeringRes.error.message }
  if (!offeringRes.data || !offeringRes.data.is_active) return { ok: false, error: 'This session is no longer available.' }
  if (settingsRes.error) return { ok: false, error: settingsRes.error.message }
  if (scheduleRes.error) return { ok: false, error: scheduleRes.error.message }
  if (blocksRes.error) return { ok: false, error: blocksRes.error.message }
  if (recurringRes.error) return { ok: false, error: recurringRes.error.message }

  const settings = settingsRes.data ?? {}
  const timeZone = safeTimeZone(settings.timezone)
  const today = dateKeyInTimeZone(new Date(), timeZone)
  const maxAdvanceDays = Math.max(1, Number(settings.max_advance_days ?? 60))
  const maxAdvanceDate = addDaysToDateKey(today, maxAdvanceDays)
  const from = parsed.data.from < today ? today : parsed.data.from
  const to = parsed.data.to > maxAdvanceDate ? maxAdvanceDate : parsed.data.to

  if (to < from) {
    return { ok: true, days: [], timezone: timeZone, from, to, max_advance_date: maxAdvanceDate }
  }

  const offering = offeringRes.data
  const slotIncrement = Math.max(5, Number(settings.slot_increment_minutes ?? 15))
  const bufferMinutes = Math.max(0, Number(settings.buffer_minutes ?? 0))
  const earliestStart = new Date(Date.now() + Math.max(0, Number(settings.min_lead_hours ?? 0)) * 3_600_000)
  const maxMinutesPerDay = settings.max_booked_minutes_per_day === null || settings.max_booked_minutes_per_day === undefined
    ? null
    : Number(settings.max_booked_minutes_per_day)
  const maxBookingDaysPerWeek = settings.max_booking_days_per_week === null || settings.max_booking_days_per_week === undefined
    ? null
    : Number(settings.max_booking_days_per_week)
  const maxConsecutiveDays = settings.max_consecutive_booking_days === null || settings.max_consecutive_booking_days === undefined
    ? null
    : Number(settings.max_consecutive_booking_days)

  const lookAroundDays = Math.max(8, (maxConsecutiveDays ?? 0) + 2)
  const queryFrom = zonedDateTimeToUtc(addDaysToDateKey(from, -lookAroundDays), '00:00:00', timeZone).toISOString()
  const queryTo = zonedDateTimeToUtc(addDaysToDateKey(to, lookAroundDays + 1), '00:00:00', timeZone).toISOString()
  const bookingsRes = await supabase
    .from('bookings')
    .select('starts_at, ends_at')
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', queryTo)
    .gt('ends_at', queryFrom)

  if (bookingsRes.error) return { ok: false, error: bookingsRes.error.message }

  const bookingIntervals: BookingInterval[] = (bookingsRes.data ?? []).map((booking) => ({
    starts_at: new Date(new Date(booking.starts_at).getTime() - bufferMinutes * 60_000).toISOString(),
    ends_at: new Date(new Date(booking.ends_at).getTime() + bufferMinutes * 60_000).toISOString(),
  }))
  const blockedIntervals: BlockedInterval[] = blocksRes.data ?? []
  const bookedMinutesByDay = new Map<string, number>()
  const bookedDates = new Set<string>()

  for (const booking of bookingsRes.data ?? []) {
    const date = dateKeyInTimeZone(new Date(booking.starts_at), timeZone)
    const minutes = (new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60_000
    bookedDates.add(date)
    bookedMinutesByDay.set(date, (bookedMinutesByDay.get(date) ?? 0) + minutes)
  }

  const scheduleByWeekday = new Map((scheduleRes.data ?? []).map((schedule) => [schedule.weekday_number, schedule]))
  const days: DayAvailability[] = []

  for (let date = from; date <= to; date = addDaysToDateKey(date, 1)) {
    const weekday = weekdayForDateKey(date)
    const schedule = scheduleByWeekday.get(weekday)
    if (!schedule?.is_open || !schedule.start_time || !schedule.end_time) continue

    const usedMinutes = bookedMinutesByDay.get(date) ?? 0
    if (maxMinutesPerDay !== null && usedMinutes + offering.duration_minutes > maxMinutesPerDay) continue

    if (maxBookingDaysPerWeek !== null && !bookedDates.has(date)) {
      const weekStart = mondayForDateKey(date)
      const weekEnd = addDaysToDateKey(weekStart, 6)
      const bookingDaysThisWeek = [...bookedDates].filter((bookedDate) => dateWithin(bookedDate, weekStart, weekEnd)).length
      if (bookingDaysThisWeek >= maxBookingDaysPerWeek) continue
    }

    if (hasTooManyConsecutiveDays(date, bookedDates, maxConsecutiveDays)) continue

    const dayStart = zonedDateTimeToUtc(date, schedule.start_time, timeZone)
    const dayEnd = zonedDateTimeToUtc(date, schedule.end_time, timeZone)
    const recurringForDay: BlockedInterval[] = (recurringRes.data ?? [])
      .filter((block) =>
        block.weekdays.includes(weekday)
        && (!block.valid_from || date >= block.valid_from)
        && (!block.valid_until || date <= block.valid_until),
      )
      .map((block) => ({
        start_at: zonedDateTimeToUtc(date, block.start_time, timeZone).toISOString(),
        end_at: zonedDateTimeToUtc(date, block.end_time, timeZone).toISOString(),
      }))
    const slotIsos: string[] = []

    for (
      let slot = new Date(dayStart);
      slot.getTime() + offering.duration_minutes * 60_000 <= dayEnd.getTime();
      slot = new Date(slot.getTime() + slotIncrement * 60_000)
    ) {
      if (slot < earliestStart) continue
      const slotEnd = new Date(slot.getTime() + offering.duration_minutes * 60_000)
      if (isSlotAvailable(slot, slotEnd, bookingIntervals, [...blockedIntervals, ...recurringForDay], [])) {
        slotIsos.push(slot.toISOString())
      }
    }

    if (slotIsos.length > 0) days.push({ date, weekday, slot_isos: slotIsos })
  }

  return { ok: true, days, timezone: timeZone, from, to, max_advance_date: maxAdvanceDate }
}

const clientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(60),
  last_name: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().email('Enter a valid email address').or(z.literal('').transform(() => null)).nullable(),
  phone: z.string().trim().max(40).nullable().or(z.literal('').transform(() => null)),
})

const submitSchema = z.object({
  offering_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  notes: z.string().trim().max(2000).nullable().or(z.literal('').transform(() => null)),
  clients: z.array(clientSchema).min(1, 'At least one client is required').max(10),
}).refine((data) => Boolean(data.clients[0]?.email), {
  message: 'Primary client email is required',
  path: ['clients', 0, 'email'],
})

export type SubmitPayload = z.infer<typeof submitSchema>
export type SubmitResult =
  | { ok: true; booking_id: string; email_warning?: string }
  | { ok: false; error: string }

async function ensureClient(
  supabase: ReturnType<typeof createAdminClient>,
  client: z.infer<typeof clientSchema>,
): Promise<string> {
  const email = client.email?.toLowerCase() ?? null
  if (email) {
    const { data: existing } = await supabase.from('clients').select('id').eq('email', email).maybeSingle()
    if (existing) {
      const { error } = await supabase
        .from('clients')
        .update({
          first_name: client.first_name,
          last_name: client.last_name,
          phone_number: client.phone,
        })
        .eq('id', existing.id)
      if (error) throw error
      return existing.id
    }
  }

  const { data, error } = await supabase
    .from('clients')
    .insert({
      first_name: client.first_name,
      last_name: client.last_name,
      email,
      phone_number: client.phone,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Could not save client details')
  return data.id
}

export async function submitBooking(payload: SubmitPayload): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createAdminClient()
  const [{ data: offering, error: offeringError }, { data: settings }] = await Promise.all([
    supabase
      .from('offerings')
      .select('id, name, duration_minutes, price_amount, break_required, people_count, is_active')
      .eq('id', parsed.data.offering_id)
      .maybeSingle(),
    supabase.from('booking_settings').select('timezone').limit(1).maybeSingle(),
  ])

  if (offeringError || !offering) return { ok: false, error: 'Session not found' }
  if (!offering.is_active) return { ok: false, error: 'This session is no longer available.' }
  if (parsed.data.clients.length !== offering.people_count) {
    return { ok: false, error: `This session is for ${offering.people_count} ${offering.people_count === 1 ? 'person' : 'people'}.` }
  }

  const startsAt = new Date(parsed.data.starts_at)
  const endsAt = new Date(startsAt.getTime() + offering.duration_minutes * 60_000)
  const bookingDate = dateKeyInTimeZone(startsAt, safeTimeZone(settings?.timezone))
  const availability = await getAvailableSlots(offering.id, bookingDate, bookingDate)
  const day = availability.ok ? availability.days[0] : null

  if (!availability.ok) return { ok: false, error: availability.error }
  if (!day?.slot_isos.includes(startsAt.toISOString())) {
    return { ok: false, error: 'That time was just taken. Please choose another available time.' }
  }

  const clientIds: string[] = []
  try {
    for (const client of parsed.data.clients) clientIds.push(await ensureClient(supabase, client))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save client details' }
  }

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      offering_id: offering.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: 'pending',
      booked_as_pair: clientIds.length >= 2,
      includes_break: offering.break_required,
      price_amount: offering.price_amount,
      duration_minutes: offering.duration_minutes,
      notes: parsed.data.notes,
      is_waitlist: false,
    })
    .select('id')
    .single()

  if (bookingError || !booking) {
    return { ok: false, error: bookingError?.message ?? 'Could not submit the booking request' }
  }

  const { error: linkError } = await supabase.from('booking_clients').insert(
    clientIds.map((clientId, index) => ({
      booking_id: booking.id,
      client_id: clientId,
      client_role: index === 0 ? 'primary' : 'additional',
    })),
  )

  if (linkError) {
    await supabase.from('bookings').delete().eq('id', booking.id)
    return { ok: false, error: linkError.message }
  }

  try {
    const context = await getBookingEmailContext(booking.id)
    await runTrigger('booking.requested', context.variables, context.recipient)
  } catch (error) {
    console.error('Booking request saved, but its request email failed:', error)
    return {
      ok: true,
      booking_id: booking.id,
      email_warning: 'Your request was saved, but the receipt email could not be sent. It remains available for review.',
    }
  }

  return { ok: true, booking_id: booking.id }
}
