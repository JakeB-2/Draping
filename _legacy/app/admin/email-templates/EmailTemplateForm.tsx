'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { BodyEditor } from '@/components/ui/body-editor'
import {
  createEmailTemplate,
  updateEmailTemplate,
  uploadTemplateAttachment,
  deleteTemplateAttachment,
  type TemplateInput,
} from '@/lib/actions/email-templates'

type Attachment = {
  id: string
  file_name: string
  content_type: string
  file_size: number | null
  storage_path: string
}

type FormValues = {
  name: string
  subject: string
  to_address: string
  cc_address: string
  bcc_address: string
  body: string
}

type Props = {
  id?: string
  defaultValues?: Partial<FormValues>
  attachments?: Attachment[]
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function EmailTemplateForm({ id, defaultValues, attachments: initialAttachments = [] }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  const [values, setValues] = useState<FormValues>({
    name: defaultValues?.name ?? '',
    subject: defaultValues?.subject ?? '',
    to_address: defaultValues?.to_address ?? '',
    cc_address: defaultValues?.cc_address ?? '',
    bcc_address: defaultValues?.bcc_address ?? '',
    body: defaultValues?.body ?? '',
  })
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function set(key: keyof FormValues) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [key]: e.target.value }))
  }

  function buildInput(): TemplateInput {
    return {
      name: values.name.trim(),
      subject: values.subject.trim(),
      to_address: values.to_address.trim() || null,
      cc_address: values.cc_address.trim() || null,
      bcc_address: values.bcc_address.trim() || null,
      body: values.body,
    }
  }

  function handleSave() {
    if (!values.name.trim()) { setError('Name is required.'); return }
    if (!values.subject.trim()) { setError('Subject is required.'); return }
    setError(null)

    startTransition(async () => {
      if (id) {
        const err = await updateEmailTemplate(id, buildInput())
        if (err) { setError(err); return }
      } else {
        const result = await createEmailTemplate(buildInput())
        if (typeof result === 'string') { setError(result); return }
        router.push(`/admin/email-templates/${result.id}`)
        return
      }
    })
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return
    e.target.value = ''

    setUploadError(null)
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    const err = await uploadTemplateAttachment(id, formData)
    setUploading(false)

    if (err) {
      setUploadError(err)
      return
    }

    setAttachments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        file_name: file.name,
        content_type: file.type,
        file_size: file.size,
        storage_path: '',
      },
    ])
  }

  function handleDeleteAttachment(attachment: Attachment) {
    startTransition(async () => {
      if (!id) return
      const err = await deleteTemplateAttachment(attachment.id, attachment.storage_path, id)
      if (!err) setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Template info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Template Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>
              Name <span className="text-destructive">*</span>
              <span className="ml-1 font-normal text-muted-foreground text-xs">(internal label)</span>
            </Label>
            <Input
              value={values.name}
              onChange={set('name')}
              placeholder="e.g. Booking Confirmation"
            />
          </div>
          <div className="space-y-1">
            <Label>
              Subject <span className="text-destructive">*</span>
            </Label>
            <Input
              value={values.subject}
              onChange={set('subject')}
              placeholder="e.g. Your booking is confirmed · {{booking_date}}"
            />
          </div>
        </CardContent>
      </Card>

      {/* Recipients */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recipients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Use variables like <code className="text-xs bg-muted px-1 rounded">{'{{client_email}}'}</code> or enter a fixed address.
            Leave blank to supply at send time.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-sm">To</Label>
              <Input
                value={values.to_address}
                onChange={set('to_address')}
                placeholder="{{client_email}}"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">CC</Label>
              <Input
                value={values.cc_address}
                onChange={set('cc_address')}
                placeholder="cc@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">BCC</Label>
              <Input
                value={values.bcc_address}
                onChange={set('bcc_address')}
                placeholder="bcc@example.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Body */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Body</CardTitle>
        </CardHeader>
        <CardContent>
          <BodyEditor
            value={values.body}
            onChange={(body) => setValues((prev) => ({ ...prev, body }))}
          />
        </CardContent>
      </Card>

      {/* Attachments — only available after the template has been saved */}
      {id ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Attachments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attachments yet.</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.file_name}</p>
                        {a.file_size && (
                          <p className="text-xs text-muted-foreground">{formatBytes(a.file_size)}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteAttachment(a)}
                      disabled={isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={handleFileChange}
              accept="*/*"
            />
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="size-4 mr-2" />
                {uploading ? 'Uploading…' : 'Upload file'}
              </Button>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="size-3" />
                Attached files are included in every email sent using this template.
              </div>
            </div>
            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground px-1">
          Save the template first to unlock file attachments.
        </p>
      )}

      {/* Actions */}
      <div className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push('/admin/email-templates')}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? 'Saving…' : id ? 'Save Changes' : 'Create Template'}
          </Button>
        </div>
      </div>
    </div>
  )
}
