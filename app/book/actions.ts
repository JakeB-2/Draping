'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSlotAvailable, type BookingInterval, type BlockedInterval, type RecurringBlock } from '@/lib/availability'

// Date helpers ------------------------------------------------
// NOTE: these use the server's local timezone via JS Date setHours/etc.
// In dev (likely matching the owner's TZ) this works. On Vercel (UTC) the
// resulting Date objects will misalign with the owner's wall clock.
// Phase 7 / TZ pass: switch to TZ-aware date math (date-fns-tz / @date-fns/tz).
function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}
function ymd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function parseHM(t: string): { h: number; m: number } {
  const [h, m] = t.split(':').map(Number)
  return { h, m }
}
function dateAtHM(date: Date, hm: string): Date {
  const { h, m } = parseHM(hm)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d
}

// Public types ------------------------------------------------
export type DayAvailability = {
  date: string         // YYYY-MM-DD
  weekday: number      // 0=Sun … 6=Sat
  is_open: boolean     // false for closed weekdays
  slot_isos: string[]  // ISO strings of valid slot starts
}

// getAvailableSlots --------------------------------------------
export async function getAvailableSlots(
  offeringId: string,
  fromYmd: string,
  toYmd: string,
): Promise<{ ok: true; days: DayAvailability[] } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const [offeringRes, settingsRes, scheduleRes, blocksRes, recurringRes] = await Promise.all([
    supabase.from('offerings').select('id, duration_minutes, is_active').eq('id', offeringId).maybeSingle(),
    supabase.from('booking_settings').select('*').limit(1).maybeSingle(),
    supabase.from('weekly_schedule').select('weekday_number, is_open, start_time, end_time'),
    supabase.from('blocked_periods').select('start_at, end_at'),
    supabase.from('recurring_blocks').select('id, weekdays, start_time, end_time, valid_from, valid_until'),
  ])

  if (offeringRes.error) return { ok: false, error: offeringRes.error.message }
  if (!offeringRes.data || !offeringRes.data.is_active) return { ok: false, error: 'Offering not available' }
  if (settingsRes.error) return { ok: false, error: settingsRes.error.message }
  if (scheduleRes.error) return { ok: false, error: scheduleRes.error.message }
  if (blocksRes.error) return { ok: false, error: blocksRes.error.message }
  if (recurringRes.error) return { ok: false, error: recurringRes.error.message }

  const offering = offeringRes.data
  const settings = settingsRes.data ?? {
    slot_increment_minutes: 15,
    buffer_minutes: 0,
    min_lead_hours: 0,
    max_bookings_per_day: null,
  }
  const slotIncrement = settings.slot_increment_minutes
  const bufferMin = settings.buffer_minutes ?? 0
  const minLeadMs = (settings.min_lead_hours ?? 0) * 60 * 60 * 1000
  const earliestStart = new Date(Date.now() + minLeadMs)
  const maxPerDay: number | null = settings.max_bookings_per_day ?? null

  const fromDate = ymdToLocalDate(fromYmd)
  const toDate = ymdToLocalDate(toYmd)

  // Existing bookings overlapping the range — only ones that block slots.
  const rangeStart = fromDate.toISOString()
  const rangeEnd = new Date(toDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const bookingsRes = await supabase
    .from('bookings')
    .select('starts_at, ends_at')
    .in('status', ['pending', 'confirmed'])
    .lt('starts_at', rangeEnd)
    .gt('ends_at', rangeStart)
  if (bookingsRes.error) return { ok: false, error: bookingsRes.error.message }

  // Inflate booking footprints by buffer_minutes on each side.
  const bookingIntervals: BookingInterval[] = (bookingsRes.data ?? []).map((b) => {
    const s = new Date(b.starts_at)
    const e = new Date(b.ends_at)
    if (bufferMin > 0) {
      s.setMinutes(s.getMinutes() - bufferMin)
      e.setMinutes(e.getMinutes() + bufferMin)
    }
    return { starts_at: s.toISOString(), ends_at: e.toISOString() }
  })

  // Count active bookings per local-day for the daily cap. Uses raw starts_at
  // (not buffer-inflated) so the count reflects actual bookings, not footprints.
  const bookingsByDay = new Map<string, number>()
  for (const b of bookingsRes.data ?? []) {
    const key = ymd(new Date(b.starts_at))
    bookingsByDay.set(key, (bookingsByDay.get(key) ?? 0) + 1)
  }
  const blockedIntervals: BlockedInterval[] = blocksRes.data ?? []
  const recurringBlocks: RecurringBlock[] = (recurringRes.data ?? []).map((r) => ({
    id: r.id,
    weekdays: r.weekdays,
    start_time: r.start_time,
    end_time: r.end_time,
    valid_from: r.valid_from,
    valid_until: r.valid_until,
  }))

  const scheduleByWeekday = new Map((scheduleRes.data ?? []).map((s) => [s.weekday_number, s]))
  const days: DayAvailability[] = []

  for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
    const weekday = d.getDay()
    const sched = scheduleByWeekday.get(weekday)
    const dayDate = new Date(d)

    if (!sched || !sched.is_open || !sched.start_time || !sched.end_time) {
      days.push({ date: ymd(dayDate), weekday, is_open: false, slot_isos: [] })
      continue
    }

    if (maxPerDay !== null && (bookingsByDay.get(ymd(dayDate)) ?? 0) >= maxPerDay) {
      days.push({ date: ymd(dayDate), weekday, is_open: true, slot_isos: [] })
      continue
    }

    const dayStart = dateAtHM(dayDate, sched.start_time)
    const dayEnd = dateAtHM(dayDate, sched.end_time)
    const slotStarts: string[] = []

    for (
      let slot = new Date(dayStart);
      slot.getTime() + offering.duration_minutes * 60 * 1000 <= dayEnd.getTime();
      slot.setMinutes(slot.getMinutes() + slotIncrement)
    ) {
      if (slot < earliestStart) continue
      const slotEnd = new Date(slot.getTime() + offering.duration_minutes * 60 * 1000)
      if (isSlotAvailable(slot, slotEnd, bookingIntervals, blockedIntervals, recurringBlocks)) {
        slotStarts.push(slot.toISOString())
      }
    }
    days.push({ date: ymd(dayDate), weekday, is_open: true, slot_isos: slotStarts })
  }

  return { ok: true, days }
}

// submitBooking -----------------------------------------------
const clientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(60),
  last_name: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().email('Valid email required').or(z.literal('').transform(() => null)).nullable(),
  phone: z.string().trim().max(40).nullable().or(z.literal('').transform(() => null)),
})

const submitSchema = z.object({
  offering_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  notes: z.string().trim().max(2000).nullable().or(z.literal('').transform(() => null)),
  clients: z.array(clientSchema).min(1, 'At least one client').max(10),
}).refine((d) => !!d.clients[0]?.email, { message: 'Primary client email is required', path: ['clients', 0, 'email'] })

export type SubmitPayload = z.infer<typeof submitSchema>
export type SubmitResult = { ok: true; booking_id: string } | { ok: false; error: string }

async function ensureClient(
  supabase: ReturnType<typeof createAdminClient>,
  c: z.infer<typeof clientSchema>,
): Promise<string> {
  if (c.email) {
    const { data: existing } = await supabase.from('clients').select('id').eq('email', c.email).maybeSingle()
    if (existing) return existing.id
  }
  const { data, error } = await supabase
    .from('clients')
    .insert({ first_name: c.first_name, last_name: c.last_name, email: c.email, phone_number: c.phone })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create client')
  return data.id
}

export async function submitBooking(payload: SubmitPayload): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const supabase = createAdminClient()

  // 1. Load offering — frozen values.
  const { data: offering, error: offErr } = await supabase
    .from('offerings')
    .select('id, name, duration_minutes, price_amount, break_required, people_count, is_active')
    .eq('id', parsed.data.offering_id)
    .maybeSingle()
  if (offErr || !offering) return { ok: false, error: 'Offering not found' }
  if (!offering.is_active) return { ok: false, error: 'Offering is no longer available' }
  if (parsed.data.clients.length !== offering.people_count) {
    return { ok: false, error: `This offering is for ${offering.people_count} ${offering.people_count === 1 ? 'person' : 'people'}.` }
  }

  const startsAt = new Date(parsed.data.starts_at)
  const endsAt = new Date(startsAt.getTime() + offering.duration_minutes * 60 * 1000)

  // 2. Re-validate slot availability.
  const fromYmd = `${startsAt.getFullYear()}-${String(startsAt.getMonth() + 1).padStart(2, '0')}-${String(startsAt.getDate()).padStart(2, '0')}`
  const slots = await getAvailableSlots(offering.id, fromYmd, fromYmd)
  if (!slots.ok) return { ok: false, error: slots.error }
  const day = slots.days[0]
  if (!day || !day.is_open || !day.slot_isos.includes(startsAt.toISOString())) {
    return { ok: false, error: 'That time was just taken — pick another slot.' }
  }

  // 3. Upsert clients.
  const clientIds: string[] = []
  try {
    for (const c of parsed.data.clients) {
      clientIds.push(await ensureClient(supabase, c))
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save client' }
  }

  // 4. Insert booking.
  const { data: booking, error: bkErr } = await supabase
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
  if (bkErr || !booking) return { ok: false, error: bkErr?.message ?? 'Could not create booking' }

  // 5. Insert booking_clients rows.
  const links = clientIds.map((client_id, i) => ({
    booking_id: booking.id,
    client_id,
    client_role: i === 0 ? 'primary' : 'additional',
  }))
  const { error: linkErr } = await supabase.from('booking_clients').insert(links)
  if (linkErr) {
    // Best-effort cleanup: delete the booking row so the user can retry.
    await supabase.from('bookings').delete().eq('id', booking.id)
    return { ok: false, error: linkErr.message }
  }

  // TODO Phase 5: fire `booking.created` email trigger here.
  return { ok: true, booking_id: booking.id }
}
