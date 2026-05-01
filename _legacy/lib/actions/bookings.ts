'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { BookingStatus } from '@/lib/schemas/booking'
import { sendBookingActionEmail } from '@/lib/email'

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/bookings')
  revalidatePath(`/admin/bookings/${id}`)
  // Fire email trigger non-blocking — status update already succeeded
  sendBookingActionEmail(`booking.${status}`, id).catch(() => {})
  return { error: null }
}

export async function addBookingNote(
  id: string,
  notes: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bookings')
    .update({ notes })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/admin/bookings/${id}`)
  return { error: null }
}
