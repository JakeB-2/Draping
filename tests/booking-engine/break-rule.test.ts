// A3/A4: automatic break insertion and attendance locking. Pure logic —
// the same code paths loadMatrix uses before quoting/creating.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { withAutoBreak } from '../../lib/booking-engine/break-rule.ts'
import type { SegmentInput } from '../../lib/booking-engine/types.ts'
import { lockedServiceIdsFor, selectOffering, setParticipantCount, createInitialFlowState } from '../../app/book/flow-state.ts'
import type { PublicBookingOffering } from '../../app/book/types.ts'

const CORE = '00000000-0000-4000-8000-0000000000c1'
const FAN = '00000000-0000-4000-8000-0000000000f1'
const flagged = new Set([CORE])

function serviceSegment(serviceId: string, participants: number[]): SegmentInput {
  return { kind: 'service', service_id: serviceId, participants }
}

describe('withAutoBreak (A3)', () => {
  it('one attendee on a flagged service, however long, gets no break', () => {
    const segments = [serviceSegment(CORE, [0]), serviceSegment(FAN, [0])]
    assert.deepEqual(withAutoBreak(segments, flagged, 30), segments)
  })

  it('two attendees on a flagged service appends one break of the configured length', () => {
    const segments = [serviceSegment(CORE, [0, 1]), serviceSegment(FAN, [0])]
    const result = withAutoBreak(segments, flagged, 45)
    assert.equal(result.length, 3)
    assert.deepEqual(result.at(-1), { kind: 'break', duration_minutes: 45, label: 'Break' })
  })

  it('two attendees without any flagged service get no break', () => {
    const segments = [serviceSegment(FAN, [0, 1])]
    assert.deepEqual(withAutoBreak(segments, flagged, 45), segments)
  })

  it('break_minutes null or zero disables the rule entirely', () => {
    const segments = [serviceSegment(CORE, [0, 1])]
    assert.deepEqual(withAutoBreak(segments, flagged, null), segments)
    assert.deepEqual(withAutoBreak(segments, flagged, 0), segments)
  })

  it('two single-attendee performances of flagged services also count', () => {
    const other = '00000000-0000-4000-8000-0000000000c2'
    const segments = [serviceSegment(CORE, [0]), serviceSegment(other, [0])]
    const result = withAutoBreak(segments, new Set([CORE, other]), 20)
    assert.equal(result.length, 3)
  })
})

const offering: PublicBookingOffering = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Core + fan',
  description: null,
  image_url: null,
  services: [
    { id: CORE, name: 'Core Analysis', description: null, sort_order: 0, supported_participant_counts: [1, 2], requires_all_attendees: true },
    { id: FAN, name: 'Learn with Fan', description: null, sort_order: 1, supported_participant_counts: [1, 2], requires_all_attendees: false },
  ],
}

describe('requires_all_attendees locking (A4)', () => {
  it('exposes the flagged service ids', () => {
    assert.deepEqual(lockedServiceIdsFor(offering), [CORE])
    assert.deepEqual(lockedServiceIdsFor(null), [])
  })

  it('adding a second attendee locks flagged services to everyone', () => {
    const initial = selectOffering(createInitialFlowState('2026-08-01', '2026-08-31'), offering)
    const grown = setParticipantCount(initial, 2, 2, lockedServiceIdsFor(offering))
    assert.deepEqual(grown.attendance[CORE], [0, 1])
    assert.deepEqual(grown.attendance[FAN], [0])
  })

  it('dropping back to one attendee shrinks the locked row too', () => {
    const initial = selectOffering(createInitialFlowState('2026-08-01', '2026-08-31'), offering)
    const grown = setParticipantCount(initial, 2, 2, lockedServiceIdsFor(offering))
    const shrunk = setParticipantCount(grown, 1, 2, lockedServiceIdsFor(offering))
    assert.deepEqual(shrunk.attendance[CORE], [0])
  })
})
