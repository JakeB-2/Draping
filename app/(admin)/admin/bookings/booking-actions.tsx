'use client'

// Status-transition buttons for a booking (Confirm / Cancel / Complete /
// Reopen). Moved up from [id]/booking-detail-client.tsx when the detail view
// became the SplitView pane; the server actions themselves are unchanged and
// all requireAdmin() internally.

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { confirmBooking, cancelBooking, completeBooking, reopenBooking, type BookingActionState } from './actions'

export type Booking = {
  id: string
  status: string
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
        <Button key={b.label} size="sm" onClick={b.onClick} disabled={pending} variant={b.variant ?? 'default'}>
          {b.label}
        </Button>
      ))}
    </div>
  )
}
