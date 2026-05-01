'use client'

import { useEffect, useTransition } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { confirmBooking, cancelBooking, completeBooking, reopenBooking, updateBookingNotes, type BookingActionState } from '../actions'

export type Booking = {
  id: string
  offering_id: string | null
  starts_at: string
  ends_at: string
  status: string
  booked_as_pair: boolean
  includes_break: boolean
  price_amount: number
  duration_minutes: number
  notes: string | null
  is_waitlist: boolean
  created_at: string
  updated_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  offerings: { id: string; name: string; description: string | null } | null
  booking_clients: {
    client_role: string | null
    clients: { id: string; first_name: string; last_name: string; email: string | null; phone_number: string | null } | null
  }[]
}

export function BookingActions({ booking }: { booking: Booking }) {
  const [pending, startTransition] = useTransition()

  const run = (fn: (id: string) => Promise<BookingActionState>, successMsg: string) => () => {
    startTransition(async () => {
      const result = await fn(booking.id)
      if (result.ok) toast.success(successMsg)
      else toast.error(result.error ?? 'Failed')
    })
  }

  const buttons: { label: string; onClick: () => void; variant?: 'default' | 'secondary' | 'destructive' | 'outline' }[] = []

  if (booking.status === 'pending') {
    buttons.push({ label: 'Confirm', onClick: run(confirmBooking, 'Booking confirmed') })
    buttons.push({ label: 'Cancel', onClick: run(cancelBooking, 'Booking cancelled'), variant: 'destructive' })
  } else if (booking.status === 'confirmed') {
    buttons.push({ label: 'Mark complete', onClick: run(completeBooking, 'Booking completed') })
    buttons.push({ label: 'Cancel', onClick: run(cancelBooking, 'Booking cancelled'), variant: 'destructive' })
  } else if (booking.status === 'cancelled') {
    buttons.push({ label: 'Re-open as pending', onClick: run(reopenBooking, 'Booking re-opened'), variant: 'outline' })
  }

  if (buttons.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <Button key={b.label} onClick={b.onClick} disabled={pending} variant={b.variant ?? 'default'}>
          {b.label}
        </Button>
      ))}
    </div>
  )
}

const initial: BookingActionState = { ok: false, error: null }

export function NotesForm({ bookingId, initial: initialNotes }: { bookingId: string; initial: string }) {
  const action = updateBookingNotes.bind(null, bookingId)
  const [state, formAction, pending] = useActionState(action, initial)

  useEffect(() => {
    if (state.ok) toast.success('Notes saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-3">
      <Textarea name="notes" defaultValue={initialNotes} rows={4} maxLength={2000} placeholder="Internal notes — not visible to clients." />
      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save notes'}
        </Button>
      </div>
    </form>
  )
}
