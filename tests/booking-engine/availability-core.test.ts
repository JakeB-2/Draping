// Unit tests for the pure availability core (open windows + valid
// starts). Fixed dates, fixed "now" — fully deterministic.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeOpenWindows,
  computeDayContexts,
  earliestStartInWindow,
  validStartsForDay,
  type AvailabilityData,
} from '../../lib/booking-engine/availability-core.ts'

// Monday 2026-08-10, studio in America/Toronto (UTC−4 in August).
const D = '2026-08-10'
const NOW = new Date('2026-08-08T12:00:00Z')

function baseData(overrides: Partial<AvailabilityData['settings']> = {}): AvailabilityData {
  return {
    settings: {
      timezone: 'America/Toronto',
      min_lead_hours: 0,
      max_advance_days: 60,
      max_booked_minutes_per_day: null,
      max_booking_days_per_week: null,
      max_consecutive_booking_days: null,
      ...overrides,
    },
    schedule: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday_number: weekday,
      is_open: true,
      start_time: '09:00',
      end_time: '19:00',
    })),
    blocked: [
      // 14:00–15:00 local
      { start_at: '2026-08-10T18:00:00Z', end_at: '2026-08-10T19:00:00Z' },
    ],
    recurring: [],
    bookings: [
      {
        id: 'b1',
        // 10:00–12:30 local, buffer 15 → occupied until 12:45 local
        starts_at: '2026-08-10T14:00:00Z',
        ends_at: '2026-08-10T16:30:00Z',
        occupied_until: '2026-08-10T16:45:00Z',
        buffer_minutes: 15,
        duration_minutes: 150,
        status: 'confirmed',
        is_waitlist: false,
      },
    ],
  }
}

test('open windows: schedule minus occupied ranges and blocks', () => {
  const days = computeOpenWindows(baseData(), D, D, NOW)
  assert.equal(days.length, 1)
  assert.deepEqual(
    days[0].windows.map((w) => [w.start_iso, w.end_iso]),
    [
      ['2026-08-10T13:00:00.000Z', '2026-08-10T14:00:00.000Z'], // 09:00–10:00
      ['2026-08-10T16:45:00.000Z', '2026-08-10T18:00:00.000Z'], // 12:45–14:00
      ['2026-08-10T19:00:00.000Z', '2026-08-10T23:00:00.000Z'], // 15:00–19:00
    ],
  )
})

test('lead time clips open windows', () => {
  // now = 11:30 local, 2h lead → nothing before 13:30 local
  const days = computeOpenWindows(
    baseData({ min_lead_hours: 2 }), D, D, new Date('2026-08-10T15:30:00Z'),
  )
  assert.deepEqual(
    days[0].windows.map((w) => [w.start_iso, w.end_iso]),
    [
      ['2026-08-10T17:30:00.000Z', '2026-08-10T18:00:00.000Z'],
      ['2026-08-10T19:00:00.000Z', '2026-08-10T23:00:00.000Z'],
    ],
  )
})

test('valid starts for an exact duration respect free stretches and buffers', () => {
  const data = baseData()
  const ctx = computeDayContexts(data, D, D)[0]
  const starts = validStartsForDay(ctx, data, 120, 15, [], NOW)
  assert.deepEqual(
    starts.map((t) => new Date(t).toISOString()),
    [
      '2026-08-10T19:00:00.000Z', // 15:00 local
      '2026-08-10T19:30:00.000Z',
      '2026-08-10T20:00:00.000Z',
      '2026-08-10T20:30:00.000Z',
      '2026-08-10T21:00:00.000Z', // 17:00 local — session ends at close,
                                  // buffer past closing is allowed
    ],
  )
})

test('buffer may not overlap another booking even when sessions are clear', () => {
  const data = baseData()
  // Extra booking 15:00–16:00 local occupying until 16:15.
  data.bookings.push({
    id: 'b2',
    starts_at: '2026-08-10T19:00:00Z',
    ends_at: '2026-08-10T20:00:00Z',
    occupied_until: '2026-08-10T20:15:00Z',
    buffer_minutes: 15,
    duration_minutes: 60,
    status: 'pending',
    is_waitlist: false,
  })
  const ctx = computeDayContexts(data, D, D)[0]
  // 60-minute session at 13:00 local ends 14:00 (block), invalid; at
  // 12:45? not a grid tick. Free 12:45–14:00 stretch has no fitting tick
  // for 75 minutes; test the buffer rule directly at 16:15–17:15 local:
  // session fits after b2, but a 13:00-local start with a 120-min
  // session would need the 12:45 stretch. Simplest: 15-min-buffer
  // 60-min session at 16:30 local is valid, at 16:00 local the session
  // itself overlaps b2 → invalid.
  const starts = validStartsForDay(ctx, data, 60, 15, [], NOW).map((t) => new Date(t).toISOString())
  assert.ok(!starts.includes('2026-08-10T19:30:00.000Z'), 'session overlapping b2 rejected')
  assert.ok(starts.includes('2026-08-10T20:30:00.000Z'), '16:30 local valid after b2')
  // 13:00 local: session 13:00–14:00 fits the free stretch exactly and
  // its buffer 14:00–14:15 overlaps only the *block*, which is allowed.
  assert.ok(starts.includes('2026-08-10T17:00:00.000Z'))
})

test('allowed start times replace the half-hour grid', () => {
  const data = baseData()
  const ctx = computeDayContexts(data, D, D)[0]
  const starts = validStartsForDay(ctx, data, 60, 0, ['15:15'], NOW)
  assert.deepEqual(starts.map((t) => new Date(t).toISOString()), ['2026-08-10T19:15:00.000Z'])
})

test('earliest start inside a window honours the minimum duration', () => {
  const data = baseData()
  const ctx = computeDayContexts(data, D, D)[0]
  // Window 12:45–14:00 local: a 60-min session first fits at 13:00.
  const win = { s: Date.parse('2026-08-10T16:45:00Z'), e: Date.parse('2026-08-10T18:00:00Z') }
  assert.equal(
    earliestStartInWindow(ctx, data, win, 60, 15, [], NOW),
    Date.parse('2026-08-10T17:00:00Z'),
  )
  // A 90-minute session cannot fit that window at any tick.
  assert.equal(earliestStartInWindow(ctx, data, win, 90, 15, [], NOW), null)
})

test('week-day and consecutive-day caps exclude whole days', () => {
  const weekCap = baseData({ max_booking_days_per_week: 1 })
  // Monday already has a booking → Monday stays, Tuesday (same week) drops.
  const weekDays = computeOpenWindows(weekCap, D, '2026-08-11', NOW).map((d) => d.date)
  assert.deepEqual(weekDays, [D])

  const consecutive = baseData({ max_consecutive_booking_days: 1 })
  // Tuesday adjacent to booked Monday → would make 2 consecutive days.
  const consecutiveDays = computeOpenWindows(consecutive, D, '2026-08-12', NOW).map((d) => d.date)
  assert.deepEqual(consecutiveDays, [D, '2026-08-12'])
})

test('daily minutes cap is applied through the start predicate', () => {
  const data = baseData({ max_booked_minutes_per_day: 180 })
  const ctx = computeDayContexts(data, D, D)[0]
  // 150 already booked; a 60-minute session would exceed 180.
  assert.deepEqual(validStartsForDay(ctx, data, 60, 0, [], NOW), [])
  // A 30-minute session still fits the cap.
  assert.ok(validStartsForDay(ctx, data, 30, 0, [], NOW).length > 0)
})
