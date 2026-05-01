'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { softDelete } from '@/lib/actions/soft-delete'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

/**
 * Reusable Edit + Delete action buttons for any record's detail page.
 *
 * Renders an Edit link (navigates to the edit route) and a Delete button
 * that opens a confirmation dialog before performing a soft delete.
 *
 * Delete runs via a server action (lib/actions/soft-delete.ts) so auth
 * is handled server-side via cookies — more reliable than the browser client.
 *
 * Usage — pass to DetailHeader's `actions` prop:
 *   <RecordActions
 *     editHref="/clients/123/edit"
 *     deleteConfig={{ table: 'clients', id: '123', name: 'Jane Doe', redirectTo: '/clients' }}
 *   />
 */

type DeleteConfig = {
  /** Supabase table name to soft-delete from */
  table: string
  /** Primary key of the row to delete */
  id: string
  /** Display name shown in the confirmation dialog title */
  name: string
  /** Route to push to after a successful delete */
  redirectTo: string
}

export function RecordActions({
  editHref,
  deleteConfig,
}: {
  editHref?: string
  deleteConfig: DeleteConfig
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    const errorMessage = await softDelete(deleteConfig.table, deleteConfig.id)

    if (errorMessage) {
      setError(errorMessage)
      setDeleting(false)
      return
    }

    router.push(deleteConfig.redirectTo)
  }

  return (
    <>
      {editHref && (
        <Button variant="outline" size="sm" asChild disabled={deleting}>
          <Link href={editHref}>Edit</Link>
        </Button>
      )}
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete {deleteConfig.name}?</DialogTitle>
            <DialogDescription>
              This will permanently remove the record. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
