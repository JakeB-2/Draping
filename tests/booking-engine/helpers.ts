// Shared helpers for booking-engine tests. Talks straight to the test
// Postgres (scripts/setup-test-db.mjs) and calls the engine functions
// the same way PostgREST does.

import pg from 'pg'
import assert from 'node:assert/strict'
import { addDaysToDateKey, dateKeyInTimeZone, zonedDateTimeToUtc } from '../../lib/time-zone.ts'

const TZ = 'America/Toronto'

export const pool = new pg.Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/postgres',
  max: 5,
})

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, params)
  return result.rows as T[]
}

export type CatalogIds = {
  services: Record<string, string>
  offerings: Record<string, string>
  clients: Record<string, string>
}

export async function loadIds(): Promise<CatalogIds> {
  const services = await q<{ id: string; name: string }>('select id, name from services')
  const offerings = await q<{ id: string; name: string }>('select id, name from offerings')
  const clients = await q<{ id: string; email: string }>('select id, email from clients')
  return {
    services: Object.fromEntries(services.map((s) => [s.name, s.id])),
    offerings: Object.fromEntries(offerings.map((o) => [o.name, o.id])),
    clients: Object.fromEntries(clients.map((c) => [c.email, c.id])),
  }
}

/**
 * Post-011 catalog configuration (idempotent): seat prices, a non-linear
 * two-person duration term, pair discount, and a derived-price offering.
 */
export async function configureCatalog(): Promise<void> {
  await q(`update services set price_amount = 100.00 where name = 'Colour Analysis'`)
  await q(`update services set price_amount = 150.00 where name = 'Draping Session'`)
  await q(`update services set price_amount = 80.00 where name = 'Style Consult'`)
  // Non-linear shared duration: 90 solo, 120 (not 180) for two.
  await q(`
    update service_duration_terms t set duration_minutes = 120
    from services s
    where s.id = t.service_id and s.name = 'Draping Session' and t.participant_count = 2
  `)
  await q(`
    update booking_settings set
      pair_discount_percent = 10,
      max_participants_per_booking = 2,
      tax_rate_percent = 13,
      min_lead_hours = 0,
      max_advance_days = 60,
      max_booked_minutes_per_day = null,
      max_booking_days_per_week = null,
      max_consecutive_booking_days = null
  `)
  // 'Solo Experience' derives its package price from seat prices
  // (100 + 150 = 250, same as its legacy price); 'Override Package'
  // keeps the migration-preserved override (300 vs 330 derived).
  await q(`update offerings set price_override = null where name = 'Solo Experience'`)
}

/** Remove all bookings created by tests (keeps the legacy seed booking). */
export async function resetBookings(): Promise<void> {
  await q(`delete from bookings where notes is distinct from 'Legacy booking'`)
}

export function participant(role: 'primary' | 'additional', displayName: string, clientId?: string | null) {
  return { role, display_name: displayName, client_id: clientId ?? null }
}

export function svc(serviceId: string, participants: number[], label?: string) {
  return { kind: 'service', service_id: serviceId, participants, label: label ?? null }
}

export function brk(durationMinutes: number, label?: string) {
  return { kind: 'break', duration_minutes: durationMinutes, label: label ?? null }
}

/** ISO UTC instant for a studio-local (America/Toronto) time N days ahead. */
export function torontoIso(daysAhead: number, time: string): string {
  const today = dateKeyInTimeZone(new Date(), TZ)
  return zonedDateTimeToUtc(addDaysToDateKey(today, daysAhead), time, TZ).toISOString()
}

export async function quote(
  offeringId: string,
  participants: unknown[],
  segments: unknown[],
  manualAdjustments: unknown[] = [],
): Promise<any> {
  const rows = await q<{ quote: any }>(
    'select booking_engine_quote($1, $2, $3, $4) as quote',
    [offeringId, JSON.stringify(participants), JSON.stringify(segments), JSON.stringify(manualAdjustments)],
  )
  return rows[0].quote
}

export async function createBooking(payload: Record<string, unknown>): Promise<any> {
  const rows = await q<{ result: any }>(
    'select booking_engine_create($1) as result',
    [JSON.stringify(payload)],
  )
  return rows[0].result
}

export async function reviseBooking(bookingId: string, payload: Record<string, unknown>): Promise<any> {
  const rows = await q<{ result: any }>(
    'select booking_engine_revise($1, $2) as result',
    [bookingId, JSON.stringify(payload)],
  )
  return rows[0].result
}

/** Asserts the engine rejects with the given machine code (error HINT). */
export async function expectEngineError(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run()
  } catch (error) {
    const hint = (error as { hint?: string }).hint
    assert.equal(hint, code, `expected engine code "${code}", got "${hint}": ${(error as Error).message}`)
    return
  }
  assert.fail(`expected engine error "${code}" but the call succeeded`)
}

export async function bookingRow(bookingId: string): Promise<any> {
  const rows = await q('select * from bookings where id = $1', [bookingId])
  return rows[0]
}

export async function childRows(bookingId: string) {
  const [participants, segments, segmentParticipants, adjustments] = await Promise.all([
    q('select * from booking_participants where booking_id = $1 order by participant_number', [bookingId]),
    q('select * from booking_segments where booking_id = $1 order by sort_order', [bookingId]),
    q(
      `select bsp.* from booking_segment_participants bsp
       join booking_segments s on s.id = bsp.segment_id
       where s.booking_id = $1`,
      [bookingId],
    ),
    q('select * from booking_adjustments where booking_id = $1 order by kind, label', [bookingId]),
  ])
  return { participants, segments, segmentParticipants, adjustments }
}
