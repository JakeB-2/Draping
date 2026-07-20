'use client'

import { useState, useEffect, useTransition } from 'react'
import { useActionState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Trash2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createOneOff, deleteOneOff, type OneOffActionState } from './one-off-actions'

export type OneOff = { id: string; start_at: string; end_at: string; reason: string | null }

const initial: OneOffActionState = { ok: false, error: null }

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

export function OneOffSection({ items }: { items: OneOff[] }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<OneOff | null>(null)

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 border-b pb-1.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Time off</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
        </div>
        <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New block
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Specific date ranges where bookings cannot land — vacations, holidays, manual blocks.
      </p>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center border rounded-md">No time-off blocks.</p>
      ) : (
        <ul className="border rounded-md divide-y text-sm">
          {items.map((o) => (
            <li key={o.id} className="group flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{fmtDateTime(o.start_at)} → {fmtDateTime(o.end_at)}</p>
                {o.reason && <p className="text-xs text-muted-foreground truncate">{o.reason}</p>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                onClick={() => setConfirmDelete(o)}
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <OneOffSheet open={open} onOpenChange={setOpen} />
      <ConfirmDelete
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => { if (confirmDelete) await deleteOneOff(confirmDelete.id) }}
      />
    </section>
  )
}

function OneOffSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [state, formAction, pending] = useActionState(createOneOff, initial)

  useEffect(() => {
    if (state.ok) {
      toast.success('Block created')
      onOpenChange(false)
    }
  }, [state, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New time-off block</SheetTitle>
          <SheetDescription>Bookings cannot land in this window.</SheetDescription>
        </SheetHeader>
        <form action={formAction} className="px-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_at">Start<RequiredMark /></Label>
              <Input id="start_at" name="start_at" type="datetime-local" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_at">End<RequiredMark /></Label>
              <Input id="end_at" name="end_at" type="datetime-local" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input id="reason" name="reason" maxLength={200} placeholder="Vacation, conference, etc." />
          </div>
          {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
          <SheetFooter>
            <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Create'}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ConfirmDelete({ open, onClose, onConfirm }: {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [pending, startTransition] = useTransition()
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this block?</AlertDialogTitle>
          <AlertDialogDescription>
            The blocked period will be removed and slots inside it will become bookable.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                try {
                  await onConfirm()
                  toast.success('Deleted')
                  onClose()
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Could not delete')
                }
              })
            }}
          >
            {pending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
