'use server'

import { addMinutes, startOfDay, endOfDay } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import { isSlotAvailable, hasPendingOverlap, type RecurringBlock } from '@/lib/availability'
import { sendBookingActionEmail } from '@/lib/email'

export type CreateBookingInput = {
  offeringId: string
  startsAt: string       // ISO string
  durationMinutes: number
  priceAmount: number
  breakRequired: boolean
  isWaitlist: boolean
  client: {
    first_name: string
    last_name: string
    email: string
    phone_number: string
    date_of_birth: string | null
  }
}

export type CreateBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string }
  // Returned when the slot has a pending (unconfirmed) booking and client has not yet
  // acknowledged the waitlist — caller should show the waitlist dialog then retry
  // with isWaitlist: true.
  | { ok: false; pendingConflict: true }

export async function createBooking(
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const supabase = await createClient()
  const slotStart = new Date(input.startsAt)
  const slotEnd = addMinutes(slotStart, input.durationMinutes)

  const dayStart = startOfDay(slotStart).toISOString()
  const dayEnd = endOfDay(slotStart).toISOString()

  // Re-fetch current state server-side (stale UI is not trusted)
  const [
    { data: bookingsData },
    { data: periodsData },
    { data: recurringData },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('starts_at, ends_at, status')
      .in('status', ['pending', 'confirmed'])
      .gte('ends_at', dayStart)
      .lte('starts_at', dayEnd),
    supabase
      .from('blocked_periods')
      .select('start_at, end_at')
      .gte('end_at', dayStart)
      .lte('start_at', dayEnd),
    supabase.from('recurring_blocks').select('*'),
  ])

  type BookingRow = { starts_at: string; ends_at: string; status: string; is_waitlist: boolean }
  const bookings = (bookingsData ?? []).map((b) => ({ ...b, is_waitlist: false })) as BookingRow[]

  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed')

  // Hard block: overlaps a confirmed booking or a blocked period
  if (
    !isSlotAvailable(
      slotStart,
      slotEnd,
      confirmedBookings,
      periodsData ?? [],
      (recurringData ?? []) as RecurringBlock[],
    )
  ) {
    return { ok: false, error: 'This time slot is no longer available. Please choose another.' }
  }

  // Soft block: overlaps a pending booking — client must acknowledge waitlist first
  if (!input.isWaitlist && hasPendingOverlap(slotStart, slotEnd, bookings)) {
    return { ok: false, pendingConflict: true }
  }

  // Upsert client by email
  let clientId: string
  const { data: existing } = await supabase
    .from('clients')
    .select('id')
    .eq('email', input.client.email.trim())
    .maybeSingle()

  if (existing) {
    clientId = existing.id as string
  } else {
    const { data: newClient, error: clientErr } = await supabase
      .from('clients')
      .insert({
        first_name: input.client.first_name.trim(),
        last_name: input.client.last_name.trim(),
        email: input.client.email.trim(),
        phone_number: input.client.phone_number.trim(),
        date_of_birth: input.client.date_of_birth || null,
      })
      .select('id')
      .single()

    if (clientErr || !newClient) {
      return { ok: false, error: clientErr?.message ?? 'Failed to save your details. Please try again.' }
    }
    clientId = newClient.id as string
  }

  // Insert booking
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      offering_id: input.offeringId,
      starts_at: slotStart.toISOString(),
      ends_at: slotEnd.toISOString(),
      status: 'pending',
      is_waitlist: input.isWaitlist,
      booked_as_pair: false,
      includes_break: input.breakRequired,
      price_amount: input.priceAmount,
      duration_minutes: input.durationMinutes,
    })
    .select('id')
    .single()

  if (bookingErr || !booking) {
    return { ok: false, error: bookingErr?.message ?? 'Failed to create booking. Please try again.' }
  }

  await supabase.from('booking_clients').insert({
    booking_id: booking.id,
    client_id: clientId,
    client_role: 'primary',
  })

  sendBookingActionEmail('booking.pending', booking.id as string).catch(() => {})

  return { ok: true, bookingId: booking.id as string }
}
