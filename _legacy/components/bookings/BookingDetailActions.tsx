'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmActionButton } from './ConfirmActionButton'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { updateBookingStatus, addBookingNote } from '@/lib/actions/bookings'

type Props = {
  id: string
  status: string
  clientName: string
  currentNotes: string
}

function NotesPopover({ id, currentNotes }: { id: string; currentNotes: string }) {
  const router = useRouter()
  const [notes, setNotes] = useState(currentNotes)
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await addBookingNote(id, notes)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">Edit notes</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-2" align="end">
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes…"
          rows={4}
          className="text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function BookingDetailActions({ id, status, clientName, currentNotes }: Props) {
  const router = useRouter()
  function refresh() { router.refresh() }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <NotesPopover id={id} currentNotes={currentNotes} />

      {status === 'pending' && (
        <ConfirmActionButton
          triggerLabel="Confirm"
          triggerVariant="outline"
          title="Confirm booking"
          description={`Confirm the booking for ${clientName}?`}
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
          triggerLabel="Cancel booking"
          triggerVariant="outline"
          triggerClassName="text-destructive hover:text-destructive"
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
