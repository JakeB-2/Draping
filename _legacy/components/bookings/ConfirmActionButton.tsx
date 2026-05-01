'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type Props = {
  triggerLabel: string
  triggerVariant?: 'outline' | 'ghost' | 'destructive'
  triggerClassName?: string
  title: string
  description: string
  confirmLabel: string
  confirmVariant?: 'destructive' | 'default'
  /** Must return { error: string | null }. Called when the user confirms. */
  onConfirm: () => Promise<{ error: string | null }>
  /** Called after a successful confirm, before the dialog closes. */
  onSuccess: () => void
}

export function ConfirmActionButton({
  triggerLabel,
  triggerVariant = 'outline',
  triggerClassName,
  title,
  description,
  confirmLabel,
  confirmVariant = 'destructive',
  onConfirm,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    const { error: err } = await onConfirm()
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    setOpen(false)
    onSuccess()
  }

  function handleOpenChange(next: boolean) {
    if (!loading) {
      setOpen(next)
      if (!next) setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className={triggerClassName}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant={confirmVariant} size="sm" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Please wait…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
