'use client'

import { useState, useEffect, useTransition } from 'react'
import { useActionState } from 'react'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createRecurring, deleteRecurring, type RecurringActionState } from './recurring-actions'

export type Recurring = { id: string; label: string | null; weekdays: number[]; start_time: string; end_time: string; valid_from: string | null; valid_until: string | null }

const initial: RecurringActionState = { ok: false, error: null }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const asHM = (t: string) => (t.length >= 5 ? t.slice(0, 5) : t)

export function RecurringSection({ items }: { items: Recurring[] }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Recurring | null>(null)

  const summary = (r: Recurring) => {
    const dayList = r.weekdays.slice().sort().map((d) => WEEKDAYS[d]).join(', ')
    return `${dayList} · ${asHM(r.start_time)}–${asHM(r.end_time)}`
  }
  const validity = (r: Recurring) =>
    r.valid_from || r.valid_until
      ? `${r.valid_from ?? '—'} → ${r.valid_until ?? '—'}`
      : 'Always'

  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">
          Repeating windows blocked from booking — lunch breaks, recurring commitments.
        </p>
        <Button onClick={() => setOpen(true)} size="sm">New recurring block</Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">No recurring blocks yet.</p>
      ) : (
        <ul className="border rounded-md divide-y">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{r.label ?? summary(r)}</p>
                {r.label && <p className="text-sm text-muted-foreground">{summary(r)}</p>}
                <p className="text-xs text-muted-foreground">{validity(r)}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(r)} aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <RecurringSheet open={open} onOpenChange={setOpen} />
      <ConfirmDelete
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => { if (confirmDelete) await deleteRecurring(confirmDelete.id) }}
      />
    </>
  )
}

function RecurringSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [state, formAction, pending] = useActionState(createRecurring, initial)

  useEffect(() => {
    if (state.ok) {
      toast.success('Recurring block created')
      onOpenChange(false)
    }
  }, [state, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New recurring block</SheetTitle>
          <SheetDescription>Repeats on the chosen weekdays during the time window.</SheetDescription>
        </SheetHeader>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4 pb-2">
            <div className="space-y-2">
              <Label htmlFor="label">Label (optional)</Label>
              <Input id="label" name="label" maxLength={100} placeholder="Lunch break" />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Repeats on<RequiredMark /></legend>
              <div className="grid grid-cols-7 gap-2">
                {WEEKDAYS.map((d, i) => (
                  <label key={d} className="flex flex-col items-center gap-1 text-xs">
                    <Checkbox name="weekdays" value={String(i)} />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_time">Start<RequiredMark /></Label>
                <Input id="start_time" name="start_time" type="time" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">End<RequiredMark /></Label>
                <Input id="end_time" name="end_time" type="time" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valid_from">Valid from (optional)</Label>
                <Input id="valid_from" name="valid_from" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valid_until">Valid until (optional)</Label>
                <Input id="valid_until" name="valid_until" type="date" />
              </div>
            </div>
            {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
          </SheetBody>
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
          <AlertDialogTitle>Delete this recurring block?</AlertDialogTitle>
          <AlertDialogDescription>
            Slots covered by this window will become bookable again.
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
