import type { SegmentInput } from './types'

/**
 * A3 (revised 2026-08): a booking gets one automatic break appended iff BOTH
 * hold:
 *   1. it contains more than one performance of a requires_all_attendees
 *      service (performances = the attendee count of each flagged service
 *      segment, summed), AND
 *   2. the additional (non-flagged) services chosen total strictly more than
 *      BREAK_ADDITIONAL_MINUTES_THRESHOLD minutes — no break when the
 *      remainder of the appointment is an hour or less.
 * Placement is irrelevant — the break only extends the total duration, so it
 * is appended after the service segments. A null/zero break duration disables
 * the rule.
 */
export const BREAK_ADDITIONAL_MINUTES_THRESHOLD = 60

export function withAutoBreak(
  segments: SegmentInput[],
  flaggedServiceIds: ReadonlySet<string>,
  breakMinutes: number | null,
  durationMinutesOf: (serviceId: string, participantCount: number) => number | null,
): SegmentInput[] {
  if (!breakMinutes || breakMinutes <= 0 || flaggedServiceIds.size === 0) return segments

  const performances = segments.reduce((total, segment) => (
    segment.kind === 'service' && flaggedServiceIds.has(segment.service_id)
      ? total + segment.participants.length
      : total
  ), 0)
  if (performances <= 1) return segments

  const additionalMinutes = segments.reduce((total, segment) => (
    segment.kind === 'service' && !flaggedServiceIds.has(segment.service_id)
      ? total + (durationMinutesOf(segment.service_id, segment.participants.length) ?? 0)
      : total
  ), 0)
  if (additionalMinutes <= BREAK_ADDITIONAL_MINUTES_THRESHOLD) return segments

  return [...segments, { kind: 'break', duration_minutes: breakMinutes, label: 'Break' }]
}
