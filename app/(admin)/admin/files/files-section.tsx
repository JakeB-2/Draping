'use client'

import { useEffect, useState, useTransition } from 'react'
import { useActionState } from 'react'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Textarea } from '@/components/ui/textarea'
import { Download, FileText, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { uploadDocument, deleteDocument, getDownloadUrl, type UploadActionState } from './actions'

export type DocumentRow = {
  id: string
  storage_path: string
  file_name: string
  content_type: string | null
  file_size: number | null
  title: string | null
  description: string | null
  created_at: string
}

const initial: UploadActionState = { ok: false, error: null }

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function FilesSection({ documents }: { documents: DocumentRow[] }) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<DocumentRow | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function handleDownload(doc: DocumentRow) {
    setDownloadingId(doc.id)
    try {
      const url = await getDownloadUrl(doc.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate download link')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">
          Reusable file library — prep PDFs, palette guides, anything you might want to attach later.
        </p>
        <Button onClick={() => setOpen(true)} size="sm">
          <Upload className="size-4 mr-2" />
          Upload file
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center border rounded-md">
          No files yet.
        </p>
      ) : (
        <ul className="border rounded-md divide-y">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="size-5 shrink-0 text-muted-foreground mt-0.5" />
                <div className="min-w-0">
                  <p className="font-medium">{doc.title || doc.file_name}</p>
                  {doc.title && <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>}
                  {doc.description && (
                    <p className="text-sm text-muted-foreground mt-1">{doc.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatBytes(doc.file_size)} · {formatDate(doc.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDownload(doc)}
                  disabled={downloadingId === doc.id}
                  aria-label="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirmDelete(doc)}
                  aria-label="Delete"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <UploadSheet open={open} onOpenChange={setOpen} />
      <ConfirmDelete
        doc={confirmDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  )
}

function UploadSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [state, formAction, pending] = useActionState(uploadDocument, initial)

  useEffect(() => {
    if (state.ok) {
      toast.success('File uploaded')
      onOpenChange(false)
    }
  }, [state, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Upload file</SheetTitle>
          <SheetDescription>Stored privately in the documents bucket.</SheetDescription>
        </SheetHeader>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4 pb-2">
            <div className="space-y-2">
              <Label htmlFor="file">File<RequiredMark /></Label>
              <Input id="file" name="file" type="file" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input id="title" name="title" maxLength={120} placeholder="Pre-session prep guide" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea id="description" name="description" maxLength={500} rows={3} placeholder="What's inside" />
            </div>
            {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>{pending ? 'Uploading…' : 'Upload'}</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ConfirmDelete({ doc, onClose }: { doc: DocumentRow | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  return (
    <AlertDialog open={!!doc} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this file?</AlertDialogTitle>
          <AlertDialogDescription>
            {doc?.file_name} will be removed from storage. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() => {
              if (!doc) return
              startTransition(async () => {
                try {
                  await deleteDocument(doc.id)
                  toast.success('File deleted')
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
