export const BOOKING_START_INCREMENT_MINUTES = 30

export type BookingScheduleWindow = {
  is_open: boolean
  start_time: string | null
  end_time: string | null
}

export function roundUpToBookingIncrement(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.ceil(minutes / BOOKING_START_INCREMENT_MINUTES) * BOOKING_START_INCREMENT_MINUTES
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * Returns the union of start times that can fit this offering into at least
 * one open weekly schedule window. This mirrors the public booking grid:
 * starts land on half-hour boundaries and duration rounds up to that grid.
 */
export function availableStartTimesForDuration(
  schedule: BookingScheduleWindow[],
  durationMinutes: number,
): string[] {
  const roundedDuration = roundUpToBookingIncrement(durationMinutes)
  if (roundedDuration === 0) return []

  const available = new Set<string>()
  for (const window of schedule) {
    if (!window.is_open || !window.start_time || !window.end_time) continue

    const start = timeToMinutes(window.start_time)
    const end = timeToMinutes(window.end_time)
    const firstStart = Math.ceil(start / BOOKING_START_INCREMENT_MINUTES) * BOOKING_START_INCREMENT_MINUTES

    for (
      let candidate = firstStart;
      candidate + roundedDuration <= end;
      candidate += BOOKING_START_INCREMENT_MINUTES
    ) {
      available.add(minutesToTime(candidate))
    }
  }

  return [...available].sort()
}

export function bookingOccupiedEnd(
  startsAt: Date,
  durationMinutes: number,
  bufferMinutes: number,
): Date {
  const occupiedMinutes = roundUpToBookingIncrement(durationMinutes) + Math.max(0, bufferMinutes)
  return new Date(startsAt.getTime() + occupiedMinutes * 60_000)
}
