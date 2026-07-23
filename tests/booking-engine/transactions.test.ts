// Plan §10 transaction scenarios: atomic create/revise, concurrency,
// buffer collisions, invariant triggers, and migration-state checks.

import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  bookingRow, brk, childRows, configureCatalog, createBooking, expectEngineError,
  loadIds, participant, pool, q, quote, reviseBooking, resetBookings, svc, torontoIso,
  type CatalogIds,
} from './helpers.ts'

let ids: CatalogIds
let alice: ReturnType<typeof participant>
let bob: ReturnType<typeof participant>
let CA: string, DS: string, solo: string

before(async () => {
  await configureCatalog()
  ids = await loadIds()
  CA = ids.services['Colour Analysis']
  DS = ids.services['Draping Session']
  solo = ids.offerings['Solo Experience']
  alice = participant('primary', 'Alice', ids.clients['alice@example.com'])
  bob = participant('additional', 'Bob')
})

beforeEach(resetBookings)

after(async () => {
  await pool.end()
})

function soloPayload(startsAt: string, extra: Record<string, unknown> = {}) {
  return {
    offering_id: solo,
    starts_at: startsAt,
    participants: [alice],
    segments: [svc(CA, [0]), svc(DS, [0])],
    ...extra,
  }
}

test('atomic create writes booking + participants + segments + adjustments together', async () => {
  const startsAt = torontoIso(14, '10:00')
  const result = await createBooking(soloPayload(startsAt, { notes: 'hello' }))
  assert.ok(result.booking_id)

  const booking = await bookingRow(result.booking_id)
  assert.equal(booking.status, 'pending')
  assert.equal(booking.duration_minutes, 150)
  assert.equal(booking.buffer_minutes, 15)
  assert.equal(Number(booking.base_package_amount), 250)
  assert.equal(Number(booking.subtotal_amount), 250)
  assert.equal(Number(booking.tax_amount), 32.5)
  assert.equal(Number(booking.total_amount), 282.5)
  assert.equal(booking.offering_name_snapshot, 'Solo Experience')
  assert.equal(booking.billing_client_id, ids.clients['alice@example.com'])
  // ends_at = starts + 150m, occupied_until = ends + 15m buffer
  assert.equal(booking.ends_at.getTime() - booking.starts_at.getTime(), 150 * 60_000)
  assert.equal(booking.occupied_until.getTime() - booking.ends_at.getTime(), 15 * 60_000)

  const children = await childRows(result.booking_id)
  assert.equal(children.participants.length, 1)
  assert.equal(children.participants[0].role, 'primary')
  assert.equal(children.segments.length, 2)
  assert.deepEqual(children.segments.map((s: any) => s.sort_order), [1, 2])
  assert.equal(children.segmentParticipants.length, 2)
  assert.equal(children.adjustments.length, 0)
})

test('pair booking with a manual break: segments, add-on, discount', async () => {
  const result = await createBooking({
    offering_id: solo,
    starts_at: torontoIso(15, '10:00'),
    participants: [alice, bob],
    segments: [svc(CA, [0, 1]), brk(30, 'Lunch break'), svc(DS, [0])],
  })
  const booking = await bookingRow(result.booking_id)
  assert.equal(booking.duration_minutes, 240) // 120 + 30 + 90
  assert.equal(Number(booking.subtotal_amount), 325) // 250 + 100 addon − 25 discount

  const children = await childRows(result.booking_id)
  assert.deepEqual(children.segments.map((s: any) => s.kind), ['service', 'break', 'service'])
  const breakSeg = children.segments[1]
  assert.equal(breakSeg.service_id, null)
  assert.equal(breakSeg.seat_price_amount, null)
  assert.equal(Number(breakSeg.addon_amount), 0)
  assert.equal(breakSeg.label, 'Lunch break')
  const discount = children.adjustments.find((a: any) => a.kind === 'pair_discount')
  assert.ok(discount)
  assert.equal(Number(discount.amount), -25)
  assert.equal(Number(discount.percent_snapshot), 10)
})

test('slot validation: schedule, grid, overlap', async () => {
  await expectEngineError(
    () => createBooking(soloPayload(torontoIso(16, '08:00'))),
    'outside_schedule',
  )
  await expectEngineError(
    () => createBooking(soloPayload(torontoIso(16, '10:15'))),
    'invalid_start_time',
  )
  await createBooking(soloPayload(torontoIso(16, '10:00')))
  await expectEngineError(
    () => createBooking(soloPayload(torontoIso(16, '11:00'))),
    'slot_taken',
  )
})

test('buffer collision: customer windows apart, occupied ranges overlap', async () => {
  // First booking 10:00–12:30 (+15 buffer → occupied until 12:45).
  await createBooking(soloPayload(torontoIso(17, '10:00')))
  // Second session starts exactly when the first ends: sessions do not
  // overlap, but the buffer does — must be rejected.
  await expectEngineError(
    () => createBooking(soloPayload(torontoIso(17, '12:30'))),
    'slot_taken',
  )
  // Clear of the buffer: fine.
  const ok = await createBooking(soloPayload(torontoIso(17, '13:00')))
  assert.ok(ok.booking_id)
})

test('concurrent submissions for one slot: exactly one wins', async () => {
  const startsAt = torontoIso(18, '10:00')
  const clientA = await pool.connect()
  const clientB = await pool.connect()
  try {
    const race = await Promise.allSettled([
      clientA.query('select booking_engine_create($1) as result', [JSON.stringify(soloPayload(startsAt))]),
      clientB.query('select booking_engine_create($1) as result', [JSON.stringify(soloPayload(startsAt))]),
    ])
    const wins = race.filter((r) => r.status === 'fulfilled')
    const losses = race.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
    assert.equal(wins.length, 1, 'exactly one submission must win')
    assert.equal((losses[0].reason as { hint?: string }).hint, 'slot_taken')
  } finally {
    clientA.release()
    clientB.release()
  }
  const rows = await q(`select count(*)::int as n from bookings where starts_at = $1`, [new Date(startsAt)])
  assert.equal((rows[0] as any).n, 1)
})

test('waitlist bookings may point at occupied time and do not block it', async () => {
  const startsAt = torontoIso(19, '10:00')
  await createBooking(soloPayload(startsAt))
  const waitlisted = await createBooking(soloPayload(startsAt, { is_waitlist: true }))
  assert.ok(waitlisted.booking_id)
})

test('pair discount lifecycle across revisions; catalog changes use current terms', async () => {
  const created = await createBooking(soloPayload(torontoIso(20, '10:00')))
  const id = created.booking_id

  // Add Bob to the analysis: add-on + discount appear.
  const revised = await reviseBooking(id, {
    participants: [alice, bob],
    segments: [svc(CA, [0, 1]), svc(DS, [0])],
  })
  assert.equal(revised.quote.subtotal_amount, '325.00')
  let children = await childRows(id)
  assert.equal(children.participants.length, 2)
  assert.ok(children.adjustments.some((a: any) => a.kind === 'pair_discount'))

  // Catalog changes, then another revision: *current* terms are used (§7).
  await q(`update services set price_amount = 110.00 where name = 'Colour Analysis'`)
  try {
    const repriced = await reviseBooking(id, {
      participants: [alice, bob],
      segments: [svc(CA, [0, 1]), svc(DS, [0])],
    })
    // base 260 derived, addon 110, discount −26 → 344
    assert.equal(repriced.quote.subtotal_amount, '344.00')
  } finally {
    await q(`update services set price_amount = 100.00 where name = 'Colour Analysis'`)
  }

  // Remove Bob: discount and add-on disappear, totals return to solo.
  const solo2 = await reviseBooking(id, {
    participants: [alice],
    segments: [svc(CA, [0]), svc(DS, [0])],
  })
  assert.equal(solo2.quote.subtotal_amount, '250.00')
  children = await childRows(id)
  assert.equal(children.participants.length, 1)
  assert.equal(children.adjustments.length, 0)
})

test('revision that lengthens into a conflict leaves the original untouched', async () => {
  await createBooking(soloPayload(torontoIso(21, '10:00')))
  const target = await createBooking(soloPayload(torontoIso(21, '13:00')))
  await createBooking(soloPayload(torontoIso(21, '16:00')))

  const beforeBooking = await bookingRow(target.booking_id)
  const beforeChildren = await childRows(target.booking_id)

  // Both services shared → 120 + 120 = 240 min → 13:00–17:00, colliding
  // with the 16:00 booking.
  await expectEngineError(
    () => reviseBooking(target.booking_id, {
      participants: [alice, bob],
      segments: [svc(CA, [0, 1]), svc(DS, [0, 1])],
    }),
    'slot_taken',
  )

  assert.deepEqual(await bookingRow(target.booking_id), beforeBooking)
  assert.deepEqual(await childRows(target.booking_id), beforeChildren)
})

test('segment reorder and break moves persist with unique sort order', async () => {
  const created = await createBooking(soloPayload(torontoIso(22, '10:00')))
  await reviseBooking(created.booking_id, {
    participants: [alice],
    segments: [svc(DS, [0]), brk(20, 'Stretch'), svc(CA, [0])],
  })
  const children = await childRows(created.booking_id)
  assert.deepEqual(
    children.segments.map((s: any) => [s.sort_order, s.kind, s.service_name_snapshot]),
    [[1, 'service', 'Draping Session'], [2, 'break', null], [3, 'service', 'Colour Analysis']],
  )
  const booking = await bookingRow(created.booking_id)
  assert.equal(booking.duration_minutes, 170)
})

test('participant cap and status are enforced on the atomic create', async () => {
  await expectEngineError(
    () => createBooking(soloPayload(torontoIso(23, '10:00'), {
      participants: [alice, bob, participant('additional', 'Carol')],
      segments: [svc(CA, [0, 1, 2]), svc(DS, [0])],
    })),
    'participant_cap',
  )
  await expectEngineError(
    () => createBooking(soloPayload(torontoIso(23, '10:00'), { status: 'completed' })),
    'status_invalid',
  )
  await expectEngineError(
    () => createBooking(soloPayload(torontoIso(23, '10:00'), {
      participants: [participant('primary', 'Walk In', null)],
    })),
    'billing_client_required',
  )
})

test('database invariants hold against direct writes', async () => {
  const created = await createBooking(soloPayload(torontoIso(24, '10:00')))
  const other = await createBooking({
    offering_id: solo,
    starts_at: torontoIso(24, '14:00'),
    participants: [alice],
    segments: [svc(CA, [0]), brk(15), svc(DS, [0])],
  })
  const children = await childRows(created.booking_id)
  const otherChildren = await childRows(other.booking_id)

  // Second primary → partial unique index.
  await assert.rejects(
    q(
      `insert into booking_participants (booking_id, participant_number, display_name, role)
       values ($1, 9, 'Impostor', 'primary')`,
      [created.booking_id],
    ),
    (error: any) => error.code === '23505',
  )

  // Segment participant from a different booking → trigger.
  await expectEngineError(
    () => q(
      `insert into booking_segment_participants (segment_id, participant_id) values ($1, $2)`,
      [children.segments[0].id, otherChildren.participants[0].id],
    ),
    'segment_invalid',
  )

  // Participant on a break segment → trigger.
  await expectEngineError(
    () => q(
      `insert into booking_segment_participants (segment_id, participant_id) values ($1, $2)`,
      [otherChildren.segments[1].id, otherChildren.participants[0].id],
    ),
    'segment_invalid',
  )

  // Duplicate sort order → unique constraint.
  await assert.rejects(
    q(
      `insert into booking_segments (booking_id, sort_order, kind, service_id, service_name_snapshot, duration_minutes, seat_price_amount)
       values ($1, 1, 'service', $2, 'Colour Analysis', 60, 100)`,
      [created.booking_id, CA],
    ),
    (error: any) => error.code === '23505',
  )

  // Service segment left with no participants at commit → deferred trigger.
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `insert into booking_segments (booking_id, sort_order, kind, service_id, service_name_snapshot, duration_minutes, seat_price_amount)
       values ($1, 99, 'service', $2, 'Colour Analysis', 60, 100)`,
      [created.booking_id, CA],
    )
    await expectEngineError(() => client.query('commit'), 'segment_participants_required')
  } finally {
    await client.query('rollback').catch(() => {})
    client.release()
  }

  // Demoting the only primary → deferred exactly-one-primary trigger.
  const pair = await createBooking({
    offering_id: solo,
    starts_at: torontoIso(25, '10:00'),
    participants: [alice, bob],
    segments: [svc(CA, [0]), svc(DS, [0])],
  })
  const pairChildren = await childRows(pair.booking_id)
  await expectEngineError(
    () => q(
      `update booking_participants set role = 'additional' where id = $1`,
      [pairChildren.participants[0].id],
    ),
    'primary_required',
  )
})

test('non-finite or oversized manual adjustments are rejected', async () => {
  for (const amount of ['NaN', 'Infinity', '-Infinity', '1e300', 'abc', '']) {
    await expectEngineError(
      () => quote(solo, [alice], [svc(CA, [0])], [{ label: 'evil', amount }]),
      'adjustment_invalid',
    )
  }
})

test('booking_id is immutable on participants and segments', async () => {
  const a = await createBooking(soloPayload(torontoIso(26, '10:00')))
  const b = await createBooking(soloPayload(torontoIso(26, '14:00')))
  const aChildren = await childRows(a.booking_id)
  await expectEngineError(
    () => q(`update booking_participants set booking_id = $1 where id = $2`,
      [b.booking_id, aChildren.participants[0].id]),
    'segment_invalid',
  )
  await expectEngineError(
    () => q(`update booking_segments set booking_id = $1, sort_order = 99 where id = $2`,
      [b.booking_id, aChildren.segments[0].id]),
    'segment_invalid',
  )
})

test('direct inserts bypassing the engine still get overlap protection', async () => {
  // Any insert without occupied_until — the fill trigger must derive
  // it so the exclusion constraint applies.
  const startsAt = torontoIso(27, '10:00')
  const endsAt = torontoIso(27, '12:30')
  const legacyInsert = (starts: string, ends: string) => q(
    `insert into bookings (offering_id, starts_at, ends_at, status, buffer_minutes,
       subtotal_amount, total_amount, duration_minutes)
     values ($1, $2, $3, 'pending', 15, 250, 250, 150) returning id, occupied_until`,
    [solo, starts, ends],
  )
  const first = await legacyInsert(startsAt, endsAt)
  assert.ok((first[0] as any).occupied_until, 'occupied_until derived on insert')
  // Overlapping active insert → exclusion constraint (23P01).
  await assert.rejects(
    legacyInsert(torontoIso(27, '12:30'), torontoIso(27, '15:00')),
    (error: any) => error.code === '23P01',
  )
  // Reversed time order → check constraint (23514).
  await assert.rejects(
    legacyInsert(torontoIso(27, '18:00'), torontoIso(27, '16:00')),
    (error: any) => error.code === '23514',
  )
})

test('expected-quote fingerprint is verified inside the atomic create', async () => {
  const startsAt = torontoIso(28, '10:00')
  const fresh = await quote(solo, [alice], [svc(CA, [0]), svc(DS, [0])])

  // A stale fingerprint (e.g. price changed while reviewing) fails the
  // create with quote_changed and writes nothing.
  await expectEngineError(
    () => createBooking(soloPayload(startsAt, {
      expected_quote: { ...pickFingerprint(fresh), subtotal_amount: '199.00' },
    })),
    'quote_changed',
  )
  const none = await q(`select count(*)::int as n from bookings where starts_at = $1`, [new Date(startsAt)])
  assert.equal((none[0] as any).n, 0)

  // Garbage fingerprints are treated as mismatches, not server errors.
  await expectEngineError(
    () => createBooking(soloPayload(startsAt, {
      expected_quote: { duration_minutes: 'abc', subtotal_amount: {}, tax_amount: null, total_amount: [] },
    })),
    'quote_changed',
  )

  // A matching fingerprint books normally.
  const ok = await createBooking(soloPayload(startsAt, { expected_quote: pickFingerprint(fresh) }))
  assert.ok(ok.booking_id)
})

function pickFingerprint(fromQuote: any) {
  return {
    duration_minutes: fromQuote.duration_minutes,
    subtotal_amount: fromQuote.subtotal_amount,
    tax_amount: fromQuote.tax_amount,
    total_amount: fromQuote.total_amount,
  }
}

test('migration 011 preserved legacy data and backfilled occupied_until', async () => {
  const legacy = (await q(`select * from bookings where notes = 'Legacy booking'`))[0] as any
  assert.ok(legacy, 'legacy seed booking must exist')
  assert.equal(Number(legacy.total_amount), 282.5)
  assert.ok(legacy.occupied_until, 'occupied_until backfilled')
  // 150 min session + 15 buffer → occupied 165 min after start.
  assert.equal(legacy.occupied_until.getTime() - legacy.starts_at.getTime(), 165 * 60_000)

  const override = (await q(`select price_override from offerings where name = 'Override Package'`))[0] as any
  assert.equal(Number(override.price_override), 300)

  const terms = await q(`
    select s.name, t.participant_count, t.duration_minutes
    from service_duration_terms t join services s on s.id = t.service_id
    order by s.name, t.participant_count
  `)
  assert.ok(terms.length >= 6, 'duration terms seeded for every service at counts 1 and 2')
})

test('migration 012 backfilled the legacy booking into the participation model', async () => {
  const legacy = (await q(`select * from bookings where notes = 'Legacy booking'`))[0] as any
  const children = await childRows(legacy.id)

  // Participants from booking_clients: roles honoured, ALL client
  // links preserved (including the historic secondary contact).
  assert.equal(children.participants.length, 2)
  assert.equal(children.participants[0].role, 'primary')
  assert.equal(children.participants[0].client_id, ids.clients['alice@example.com'])
  assert.equal(children.participants[0].display_name, 'Alice Nguyen')
  assert.equal(children.participants[1].role, 'additional')
  assert.equal(children.participants[1].client_id, ids.clients['bob@example.com'])
  assert.equal(legacy.billing_client_id, ids.clients['alice@example.com'])

  // Segments in offering order, proportioned exactly from the frozen
  // duration (150 → 60 + 90); every participant on every service.
  assert.deepEqual(
    children.segments.map((s: any) => [s.kind, s.service_name_snapshot, s.duration_minutes]),
    [['service', 'Colour Analysis', 60], ['service', 'Draping Session', 90]],
  )
  assert.equal(children.segmentParticipants.length, 4)

  // Totals preserved verbatim: base + Σ addons + Σ adjustments = subtotal.
  assert.equal(Number(legacy.base_package_amount), 250)
  const addons = children.segments.reduce((total: number, s: any) => total + Number(s.addon_amount), 0)
  const adjustments = children.adjustments.reduce((total: number, a: any) => total + Number(a.amount), 0)
  assert.equal(Number(legacy.base_package_amount) + addons + adjustments, Number(legacy.subtotal_amount))
  const segMinutes = children.segments.reduce((total: number, s: any) => total + Number(s.duration_minutes), 0)
  assert.equal(segMinutes, legacy.duration_minutes)

  // Nothing needed manual resolution in the seed data.
  const anomalies = await q(`select * from legacy_backfill_anomalies`)
  assert.equal(anomalies.length, 0)
})

test('migration 013 retired the legacy columns and booking_clients', async () => {
  const tables = await q<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_name = 'booking_clients'`,
  )
  assert.equal(tables.length, 0, 'booking_clients must be dropped')

  const retired = await q<{ table_name: string; column_name: string }>(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and (
      (table_name = 'bookings' and column_name in ('booked_as_pair', 'includes_break', 'price_amount'))
      or (table_name = 'offerings' and column_name in
        ('duration_minutes', 'price_amount', 'break_required', 'break_minutes', 'people_count', 'time_adjustment_minutes'))
      or (table_name = 'services' and column_name = 'time_requirement_minutes')
      or (table_name = 'booking_settings' and column_name = 'pair_extra_minutes')
    )
  `)
  assert.deepEqual(retired, [], 'no retired column may remain')
})
