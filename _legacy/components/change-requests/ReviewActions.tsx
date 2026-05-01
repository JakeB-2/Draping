'use client'

/**
 * ReviewActions — Approve / Reject buttons for a change_request.
 *
 * Usable in two contexts:
 *   1. Table row — compact, no modal needed for approve; reject opens a small
 *      dialog to capture an optional rejection note.
 *   2. Detail page — same component, same behaviour, just larger placement.
 *
 * Calls the reviewChangeRequest server action directly (no redirect on
 * success — the parent page data is revalidated server-side).
 */

import { useState, useTransition } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { reviewChangeRequest } from '@/lib/actions/change-request'

type Props = {
  requestId: string
  /** Optional callback fired after a successful review (e.g. to close a sheet). */
  onReviewed?: () => void
  size?: 'sm' | 'default'
}

export function ReviewActions({ requestId, onReviewed, size = 'sm' }: Props) {
  const [pending, startTransition] = useTransition()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionNote, setRejectionNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleApprove() {
    setError(null)
    startTransition(async () => {
      const err = await reviewChangeRequest(requestId, 'approved')
      if (err) setError(err)
      else onReviewed?.()
    })
  }

  function handleRejectConfirm() {
    setError(null)
    startTransition(async () => {
      const err = await reviewChangeRequest(requestId, 'rejected', rejectionNote || undefined)
      if (err) {
        setError(err)
      } else {
        setRejectOpen(false)
        setRejectionNote('')
        onReviewed?.()
      }
    })
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button
          size={size}
          variant="outline"
          className="text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
          onClick={(e) => { e.stopPropagation(); handleApprove() }}
          disabled={pending}
        >
          <CheckCircle className="size-3.5" />
          Approve
        </Button>
        <Button
          size={size}
          variant="outline"
          className="text-destructive border-destructive/20 hover:bg-destructive/5"
          onClick={(e) => { e.stopPropagation(); setRejectOpen(true) }}
          disabled={pending}
        >
          <XCircle className="size-3.5" />
          Reject
        </Button>
      </div>

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}

      {/* Rejection note dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>
              Optionally add a note explaining why this request was rejected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="rejection-note" className="text-sm">Rejection note (optional)</Label>
            <Textarea
              id="rejection-note"
              rows={3}
              placeholder="e.g. Dates conflict with another booking…"
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRejectConfirm}
              disabled={pending}
            >
              {pending ? 'Rejecting…' : 'Confirm reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
