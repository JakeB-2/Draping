// Plan §10 pricing scenarios, exercised against booking_engine_quote —
// the single monetary authority (migration 011).

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  configureCatalog, expectEngineError, loadIds, participant, pool, q, quote, svc, brk,
  type CatalogIds,
} from './helpers.ts'

let ids: CatalogIds
let alice: ReturnType<typeof participant>
let bob: ReturnType<typeof participant>
let CA: string, DS: string, SC: string

before(async () => {
  await configureCatalog()
  ids = await loadIds()
  CA = ids.services['Colour Analysis']
  DS = ids.services['Draping Session']
  SC = ids.services['Style Consult']
  alice = participant('primary', 'Alice', ids.clients['alice@example.com'])
  bob = participant('additional', 'Bob')
})

after(async () => {
  await pool.end()
})

test('solo booking with derived offering price', async () => {
  const result = await quote(ids.offerings['Solo Experience'], [alice], [svc(CA, [0]), svc(DS, [0])])
  assert.equal(result.base_package_amount, '250.00')
  assert.equal(result.duration_minutes, 150)
  assert.equal(result.buffer_minutes, 15)
  assert.equal(result.adjustments.length, 0)
  assert.equal(result.segments[0].addon_amount, '0.00')
  assert.equal(result.subtotal_amount, '250.00')
  assert.equal(result.tax_rate_percent, '13.00')
  assert.equal(result.tax_amount, '32.50')
  assert.equal(result.total_amount, '282.50')
})

test('solo booking with package override records a package adjustment row', async () => {
  const result = await quote(
    ids.offerings['Override Package'], [alice],
    [svc(CA, [0]), svc(DS, [0]), svc(SC, [0])],
  )
  // base = coalesce(override, derived) = 300 (derived would be 330)
  assert.equal(result.base_package_amount, '300.00')
  assert.equal(result.duration_minutes, 195)
  assert.equal(result.adjustments.length, 1)
  assert.equal(result.adjustments[0].kind, 'package')
  assert.equal(result.adjustments[0].amount, '0.00')
  assert.match(result.adjustments[0].label, /330\.00/)
  assert.equal(result.subtotal_amount, '300.00')
  assert.equal(result.total_amount, '339.00')
})

test('attendee joining one service is charged that seat as an add-on', async () => {
  const result = await quote(
    ids.offerings['Solo Experience'], [alice, bob],
    [svc(CA, [0, 1]), svc(DS, [0])],
  )
  // CA at two attendees: 120-minute term, +100 seat add-on. DS solo: 90.
  assert.equal(result.duration_minutes, 210)
  assert.equal(result.segments[0].addon_amount, '100.00')
  assert.equal(result.segments[1].addon_amount, '0.00')
  const discount = result.adjustments.find((a: any) => a.kind === 'pair_discount')
  assert.ok(discount, 'pair discount expected')
  assert.equal(discount.amount, '-25.00')
  assert.equal(Number(discount.percent_snapshot), 10)
  assert.equal(result.subtotal_amount, '325.00')
  assert.equal(result.tax_amount, '42.25')
  assert.equal(result.total_amount, '367.25')
})

test('shared service uses the non-linear two-person duration term', async () => {
  const result = await quote(
    ids.offerings['Solo Experience'], [alice, bob],
    [svc(CA, [0]), svc(DS, [0, 1])],
  )
  // DS two-person term is 120 (not 2×90).
  assert.equal(result.duration_minutes, 180)
  assert.equal(result.segments[1].addon_amount, '150.00')
  assert.equal(result.subtotal_amount, '375.00')
})

test('transferable seat: attendee-only service in the package costs nothing (DEC-2)', async () => {
  const result = await quote(
    ids.offerings['Solo Experience'], [alice, bob],
    [svc(CA, [1]), svc(DS, [0])],
  )
  assert.equal(result.segments[0].addon_amount, '0.00')
  assert.equal(result.segments[1].addon_amount, '0.00')
  // Discount still applies — the additional participant attends a service.
  assert.equal(result.subtotal_amount, '225.00')
  assert.equal(result.duration_minutes, 150)
})

test('package service dropped entirely: price unchanged, manual adjustment path', async () => {
  const result = await quote(
    ids.offerings['Solo Experience'], [alice],
    [svc(CA, [0])],
    [{ label: 'Goodwill reduction', amount: '-50.00' }],
  )
  assert.equal(result.base_package_amount, '250.00')
  assert.equal(result.duration_minutes, 60)
  assert.equal(result.adjustments.length, 1)
  assert.equal(result.adjustments[0].kind, 'manual')
  assert.equal(result.adjustments[0].amount, '-50.00')
  assert.equal(result.subtotal_amount, '200.00')
  assert.equal(result.total_amount, '226.00')
})

test('a named attendee with no participation does not trigger the pair discount', async () => {
  const result = await quote(
    ids.offerings['Solo Experience'], [alice, bob],
    [svc(CA, [0]), svc(DS, [0])],
  )
  assert.equal(result.adjustments.length, 0)
  assert.equal(result.subtotal_amount, '250.00')
})

test('tax rounds half-up to cents, applied after adjustments (discount before tax)', async () => {
  const result = await quote(
    ids.offerings['Override Package'], [alice],
    [svc(CA, [0]), svc(DS, [0]), svc(SC, [0])],
    [{ label: 'Adjustment', amount: '-11.50' }],
  )
  // 288.50 × 13% = 37.5050 → 37.51 (half-up; banker's would give 37.50)
  assert.equal(result.subtotal_amount, '288.50')
  assert.equal(result.tax_amount, '37.51')
  assert.equal(result.total_amount, '326.01')
})

test('pair discount rounds half-up to cents', async () => {
  await q('update booking_settings set pair_discount_percent = 10.01')
  try {
    const result = await quote(
      ids.offerings['Solo Experience'], [alice, bob],
      [svc(CA, [0, 1]), svc(DS, [0])],
    )
    // 250 × 10.01% = 25.025 → 25.03 (half-up)
    const discount = result.adjustments.find((a: any) => a.kind === 'pair_discount')
    assert.equal(discount.amount, '-25.03')
  } finally {
    await q('update booking_settings set pair_discount_percent = 10')
  }
})

test('participant cap is enforced on direct calls', async () => {
  await expectEngineError(
    () => quote(
      ids.offerings['Solo Experience'],
      [alice, bob, participant('additional', 'Carol')],
      [svc(CA, [0])],
    ),
    'participant_cap',
  )
})

test('missing duration term for a count is a clean failure', async () => {
  await q(`
    delete from service_duration_terms t using services s
    where s.id = t.service_id and s.name = 'Style Consult' and t.participant_count = 2
  `)
  try {
    await expectEngineError(
      () => quote(
        ids.offerings['Override Package'], [alice, bob],
        [svc(CA, [0]), svc(DS, [0]), svc(SC, [0, 1])],
      ),
      'duration_term_missing',
    )
  } finally {
    await q(`
      insert into service_duration_terms (service_id, participant_count, duration_minutes)
      select id, 2, 90 from services where name = 'Style Consult'
    `)
  }
})

test('exactly one primary participant is required', async () => {
  await expectEngineError(
    () => quote(ids.offerings['Solo Experience'], [bob], [svc(CA, [0])]),
    'primary_required',
  )
  await expectEngineError(
    () => quote(
      ids.offerings['Solo Experience'],
      [alice, participant('primary', 'Alice2', ids.clients['bob@example.com'])],
      [svc(CA, [0])],
    ),
    'primary_required',
  )
})

test('segment shape rules are enforced', async () => {
  const offering = ids.offerings['Solo Experience']
  await expectEngineError(
    () => quote(offering, [alice], [{ kind: 'break', duration_minutes: 30, participants: [0] }]),
    'segment_invalid',
  )
  await expectEngineError(
    () => quote(offering, [alice], [svc(CA, [0]), brk(0)]),
    'segment_invalid',
  )
  await expectEngineError(
    () => quote(offering, [alice], [brk(30)]),
    'no_service_segments',
  )
  await expectEngineError(
    () => quote(offering, [alice], [svc(CA, [])]),
    'segment_participants_required',
  )
  await expectEngineError(
    () => quote(offering, [alice], [svc(CA, [0, 5])]),
    'segment_invalid',
  )
})
