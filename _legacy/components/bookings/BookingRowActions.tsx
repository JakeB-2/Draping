'use client'

import { useRouter } from 'next/navigation'
import { ConfirmActionButton } from './ConfirmActionButton'
import { updateBookingStatus } from '@/lib/actions/bookings'

type Props = {
  id: string
  status: string
  clientName: string
}

export function BookingRowActions({ id, status, clientName }: Props) {
  const router = useRouter()

  function refresh() { router.refresh() }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === 'pending' && (
        <ConfirmActionButton
          triggerLabel="Confirm"
          triggerVariant="outline"
          triggerClassName="text-xs h-7 px-2"
          title="Confirm booking"
          description={`Confirm the booking for ${clientName}? They will be notified.`}
          confirmLabel="Confirm booking"
          confirmVariant="default"
          onConfirm={() => updateBookingStatus(id, 'confirmed')}
          onSuccess={refresh}
        />
      )}
      {status === 'confirmed' && (
        <ConfirmActionButton
          triggerLabel="Mark complete"
          triggerVariant="outline"
          triggerClassName="text-xs h-7 px-2"
          title="Mark as completed"
          description={`Mark ${clientName}'s booking as completed?`}
          confirmLabel="Mark complete"
          confirmVariant="default"
          onConfirm={() => updateBookingStatus(id, 'completed')}
          onSuccess={refresh}
        />
      )}
      {(status === 'pending' || status === 'confirmed') && (
        <ConfirmActionButton
          triggerLabel="Cancel"
          triggerVariant="ghost"
          triggerClassName="text-xs h-7 px-2 text-destructive hover:text-destructive"
          title="Cancel booking"
          description={`Cancel ${clientName}'s booking? This cannot be undone.`}
          confirmLabel="Cancel booking"
          confirmVariant="destructive"
          onConfirm={() => updateBookingStatus(id, 'cancelled')}
          onSuccess={refresh}
        />
      )}
    </div>
  )
}
