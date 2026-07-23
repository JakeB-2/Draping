'use server'

import { revalidatePath } from 'next/cache'
import { getBookingEmailContext } from '@/lib/email/booking-context'
import { runTrigger } from '@/lib/email/triggers'
import { requireAdmin } from '../auth'

export type BookingActionState = { ok: boolean; error: string | null }

async function transition(id: string, patch: Record<string, unknown>): Promise<BookingActionState> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('bookings').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/bookings')
  revalidatePath(`/admin/bookings/${id}`)
  return { ok: true, error: null }
}

export async function confirmBooking(id: string): Promise<BookingActionState> {
  const result = await transition(id, { status: 'confirmed', confirmed_at: new Date().toISOString() })
  if (!result.ok) return result

  try {
    const context = await getBookingEmailContext(id)
    await runTrigger('booking.confirmed', context.variables, context.recipient)
  } catch (error) {
    console.error('Booking was confirmed, but its confirmation email failed:', error)
  }
  return result
}

export async function cancelBooking(id: string): Promise<BookingActionState> {
  return transition(id, { status: 'cancelled', cancelled_at: new Date().toISOString() })
  // TODO Phase 5: fire `booking.cancelled` email trigger here.
}

export async function completeBooking(id: string): Promise<BookingActionState> {
  return transition(id, { status: 'completed' })
}

export async function reopenBooking(id: string): Promise<BookingActionState> {
  // Used when an admin un-cancels back to pending.
  return transition(id, { status: 'pending', cancelled_at: null })
}
