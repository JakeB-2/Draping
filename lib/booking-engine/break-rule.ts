import type { SegmentInput } from './types'

/**
 * A3: a booking gets one automatic break appended iff it contains more than
 * one performance of a requires_all_attendees service (performances = the
 * attendee count of each flagged service segment, summed). Placement is
 * irrelevant — the break only extends the total duration, so it is appended
 * after the service segments. A null/zero break duration disables the rule.
 */
export function withAutoBreak(
  segments: SegmentInput[],
  flaggedServiceIds: ReadonlySet<string>,
  breakMinutes: number | null,
): SegmentInput[] {
  if (!breakMinutes || breakMinutes <= 0 || flaggedServiceIds.size === 0) return segments

  const performances = segments.reduce((total, segment) => (
    segment.kind === 'service' && flaggedServiceIds.has(segment.service_id)
      ? total + segment.participants.length
      : total
  ), 0)
  if (performances <= 1) return segments

  return [...segments, { kind: 'break', duration_minutes: breakMinutes, label: 'Break' }]
}
