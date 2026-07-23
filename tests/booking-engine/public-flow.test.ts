import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chooseWindow,
  createInitialFlowState,
  offeringIdsVisibleForWindow,
  selectOffering,
  setParticipantCount,
  setServiceAttendance,
  toMatrixInput,
} from '../../app/book/flow-state.ts'
import type { PublicBookingOffering } from '../../app/book/types.ts'

const offering: PublicBookingOffering = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Colour experience',
  description: null,
  image_url: null,
  services: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      name: 'Analysis',
      description: null,
      sort_order: 0,
      supported_participant_counts: [1, 2],
    },
    {
      id: '00000000-0000-4000-8000-000000000012',
      name: 'Palette',
      description: null,
      sort_order: 1,
      supported_participant_counts: [1, 2],
    },
  ],
}

describe('public multi-entry flow state', () => {
  it('keeps every selection in one serializable structure', () => {
    const initial = createInitialFlowState('2026-08-01', '2026-08-31')
    const selected = selectOffering(initial, offering)

    assert.equal(selected.offering_id, offering.id)
    assert.deepEqual(selected.attendance, {
      [offering.services[0].id]: [0],
      [offering.services[1].id]: [0],
    })
    assert.doesNotThrow(() => JSON.stringify(selected))
  })

  it('honours the configured cap without implicitly unlocking groups', () => {
    const initial = selectOffering(
      createInitialFlowState('2026-08-01', '2026-08-31'),
      offering,
    )

    assert.equal(setParticipantCount(initial, 2, 1).participant_count, 1)
    assert.equal(setParticipantCount(initial, 3, 5).participant_count, 2)
  })

  it('supports transferable-seat attendance and invalidates a chosen start', () => {
    let state = selectOffering(
      createInitialFlowState('2026-08-01', '2026-08-31'),
      offering,
    )
    state = setParticipantCount(state, 2, 2)
    state = { ...state, selected_start_iso: '2026-08-10T14:00:00.000Z' }
    state = setServiceAttendance(state, offering.services[0].id, [1])

    assert.deepEqual(state.attendance[offering.services[0].id], [1])
    assert.equal(state.selected_start_iso, null)
    assert.deepEqual(toMatrixInput(state)?.attendance, state.attendance)
  })

  it('widens offering choices when the time selection is cleared', () => {
    const second = { ...offering, id: '00000000-0000-4000-8000-000000000002' }
    const all = [offering, second]
    const filtered = new Set([offering.id])
    let state = chooseWindow(
      createInitialFlowState('2026-08-01', '2026-08-31'),
      { start_iso: '2026-08-10T14:00:00.000Z', end_iso: '2026-08-10T18:00:00.000Z' },
    )

    assert.deepEqual(offeringIdsVisibleForWindow(all, filtered), [offering.id])
    state = chooseWindow(state, null)
    assert.equal(state.selected_window, null)
    assert.deepEqual(offeringIdsVisibleForWindow(all, null), [offering.id, second.id])
  })

  it('keeps an exact time preference when an offering is cleared', () => {
    let state = selectOffering(
      createInitialFlowState('2026-08-01', '2026-08-31'),
      offering,
    )
    state = { ...state, selected_start_iso: '2026-08-10T14:00:00.000Z' }
    state = selectOffering(state, null)

    assert.equal(state.offering_id, null)
    assert.equal(state.selected_start_iso, '2026-08-10T14:00:00.000Z')
  })
})
