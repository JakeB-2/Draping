'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  cancelBooking,
  completeBooking,
  confirmBooking,
  reopenBooking,
  type BookingActionState,
} from './actions'
import { StatusBadge } from './status-badge'

export type BookingRowData = {
  id: string
  starts_at: string
  status: string
  participant_count: number
  duration_minutes: number
  offering_name: string | null
  client_label: string
}

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export function BookingRow({ booking }: { booking: BookingRowData }) {
  const [pending, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)

  const run = (fn: (id: string) => Promise<BookingActionState>, msg: string) =>
    startTransition(async () => {
      const r = await fn(booking.id)
      if (r.ok) toast.success(msg)
      else toast.error(r.error ?? 'Failed')
    })

  const showCancel = booking.status === 'pending' || booking.status === 'confirmed'

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium truncate">{booking.offering_name ?? 'Unknown offering'}</p>
          <StatusBadge status={booking.status} />
          {booking.participant_count > 1 && <span className="text-xs text-muted-foreground">· {booking.participant_count} participants</span>}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {fmtDateTime(booking.starts_at)} · {booking.client_label || '—'} · {booking.duration_minutes} min
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {booking.status === 'pending' && (
          <Button size="sm" disabled={pending} onClick={() => run(confirmBooking, 'Booking confirmed')}>
            Confirm
          </Button>
        )}
        {booking.status === 'confirmed' && (
          <Button size="sm" disabled={pending} onClick={() => run(completeBooking, 'Marked complete')}>
            Mark complete
          </Button>
        )}
        {booking.status === 'cancelled' && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(reopenBooking, 'Re-opened')}>
            Re-open
          </Button>
        )}

        {showCancel && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setCancelOpen(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            Cancel
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/admin/bookings/${booking.id}`}>View details</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CancelConfirm
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        pending={pending}
        onConfirm={() => {
          setCancelOpen(false)
          run(cancelBooking, 'Booking cancelled')
        }}
      />
    </li>
  )
}

function CancelConfirm({
  open,
  onClose,
  onConfirm,
  pending,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  pending: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            The booking will be marked cancelled and the slot will become bookable again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep booking</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            Cancel booking
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
