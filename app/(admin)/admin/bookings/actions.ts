'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type BookingActionState = { ok: boolean; error: string | null }

async function transition(id: string, patch: Record<string, unknown>): Promise<BookingActionState> {
  const supabase = await createClient()
  const { error } = await supabase.from('bookings').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/bookings')
  revalidatePath(`/admin/bookings/${id}`)
  return { ok: true, error: null }
}

export async function confirmBooking(id: string): Promise<BookingActionState> {
  const result = await transition(id, { status: 'confirmed', confirmed_at: new Date().toISOString() })
  // TODO Phase 5: fire `booking.confirmed` email trigger here.
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

const notesSchema = z.object({ notes: z.string().max(2000).nullable().or(z.literal('').transform(() => null)) })

export async function updateBookingNotes(id: string, _prev: BookingActionState, formData: FormData): Promise<BookingActionState> {
  const parsed = notesSchema.safeParse({ notes: formData.get('notes') || null })
  if (!parsed.success) return { ok: false, error: 'Invalid notes' }
  return transition(id, { notes: parsed.data.notes })
}
