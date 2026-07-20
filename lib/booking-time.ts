export const BOOKING_START_INCREMENT_MINUTES = 30

export function roundUpToBookingIncrement(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.ceil(minutes / BOOKING_START_INCREMENT_MINUTES) * BOOKING_START_INCREMENT_MINUTES
}

export function bookingOccupiedEnd(
  startsAt: Date,
  durationMinutes: number,
  bufferMinutes: number,
): Date {
  const occupiedMinutes = roundUpToBookingIncrement(durationMinutes) + Math.max(0, bufferMinutes)
  return new Date(startsAt.getTime() + occupiedMinutes * 60_000)
}
