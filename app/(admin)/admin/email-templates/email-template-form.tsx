'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Paperclip, Send, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { BodyEditor } from '@/components/ui/body-editor'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { renderTemplate } from '@/lib/email/render'
import { toast } from 'sonner'
import {
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  uploadTemplateAttachment,
  deleteTemplateAttachment,
  sendTestEmail,
  type TemplateInput,
} from './actions'

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
  ownerEmail?: string | null
}

/**
 * Representative sample values for every variable produced by
 * lib/email/booking-context.ts, so the preview never shows a raw placeholder.
 */
const SAMPLE_VARIABLES: Record<string, string | number> = {
  booking_id: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
  booking_reference: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
  booking_date: 'Friday, August 14, 2026',
  booking_start_time: '10:00 AM',
  booking_end_time: '12:30 PM',
  booking_duration_minutes: 150,
  booking_price: '$180.00',
  booking_subtotal: '$160.00',
  booking_tax_rate: '13',
  booking_tax: '$20.80',
  booking_total: '$180.00',
  booking_notes: 'Please arrive 10 minutes early.',
  booking_includes_break: 'Yes',
  booking_break_minutes: 15,
  client_first_name: 'Jane',
  client_last_name: 'Doe',
  client_full_name: 'Jane Doe',
  client_email: 'jane.doe@example.com',
  client_phone: '(555) 123-4567',
  client_count: 2,
  additional_client_names: 'Alex Smith',
  offering_name: 'Full Colour Analysis',
  offering_description: 'A complete seasonal colour analysis session with personalised palette.',
  service_names: 'Colour Draping, Palette Consultation',
  business_name: 'DNA My Colours',
  business_address: '123 Main Street, Toronto, ON',
  business_email: 'hello@dnamycolours.com',
  business_phone: '(555) 987-6543',
  business_timezone: 'America/Toronto',
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function EmailTemplateForm({ id, defaultValues, attachments: initialAttachments = [], ownerEmail }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [testPending, startTestTransition] = useTransition()

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
        toast.success('Template saved')
      } else {
        const result = await createEmailTemplate(buildInput())
        if (typeof result === 'string') { setError(result); return }
        toast.success('Template created')
        router.push(`/admin/email-templates/${result.id}`)
      }
    })
  }

  function handleDelete() {
    if (!id) return
    if (!confirm('Delete this template? Linked triggers will be cleared.')) return
    startTransition(async () => {
      const err = await deleteEmailTemplate(id)
      if (err) { setError(err); return }
      toast.success('Template deleted')
      router.push('/admin/email-templates')
    })
  }

  function handleSendTest() {
    if (!id) return
    startTestTransition(async () => {
      const err = await sendTestEmail(id)
      if (err) {
        toast.error(err)
        return
      }
      toast.success(`Test sent to ${ownerEmail}`)
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
    toast.success('Attachment uploaded')
  }

  function handleDeleteAttachment(attachment: Attachment) {
    startTransition(async () => {
      if (!id) return
      const err = await deleteTemplateAttachment(attachment.id, attachment.storage_path, id)
      if (!err) setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Template info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>
              Name <span className="text-destructive">*</span>
              <span className="ml-1 font-normal text-muted-foreground text-xs">(internal label)</span>
            </Label>
            <Input value={values.name} onChange={set('name')} placeholder="e.g. Booking Confirmation" />
          </div>
          <div className="space-y-1">
            <Label>Subject <span className="text-destructive">*</span></Label>
            <Input value={values.subject} onChange={set('subject')} placeholder="e.g. Your booking is confirmed · {{booking_date}}" />
          </div>
        </CardContent>
      </Card>

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
              <Input value={values.to_address} onChange={set('to_address')} placeholder="{{client_email}}" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">CC</Label>
              <Input value={values.cc_address} onChange={set('cc_address')} placeholder="cc@example.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">BCC</Label>
              <Input value={values.bcc_address} onChange={set('bcc_address')} placeholder="bcc@example.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Body</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <details className="rounded-md border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Available booking variables</summary>
            <p className="mt-2 leading-6">
              {[
                'client_first_name', 'client_last_name', 'client_full_name', 'client_email', 'client_phone',
                'client_count', 'additional_client_names', 'booking_id', 'booking_date', 'booking_start_time',
                'booking_end_time', 'booking_duration_minutes', 'booking_price', 'booking_subtotal',
                'booking_tax_rate', 'booking_tax', 'booking_total', 'booking_notes',
                'booking_includes_break', 'booking_break_minutes', 'offering_name', 'offering_description',
                'service_names', 'business_name', 'business_address', 'business_email', 'business_phone',
              ].map((variable) => (
                <code key={variable} className="mr-2 whitespace-nowrap">{`{{${variable}}}`}</code>
              ))}
            </p>
          </details>
          <Tabs defaultValue="preview" className="w-full">
            <TabsList className="h-8">
              <TabsTrigger value="preview" className="text-xs px-3 h-6">Preview</TabsTrigger>
              <TabsTrigger value="html" className="text-xs px-3 h-6">Edit HTML</TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="mt-2 space-y-2">
              <div className="rounded-md border overflow-hidden">
                <div className="border-b bg-muted/40 px-4 py-2.5">
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="text-sm font-medium">
                    {values.subject.trim()
                      ? renderTemplate(values.subject, SAMPLE_VARIABLES)
                      : <span className="italic text-muted-foreground font-normal">No subject yet</span>}
                  </p>
                </div>
                <div
                  className="min-h-64 bg-white p-6 text-sm prose prose-sm max-w-none dark:bg-muted/10"
                  dangerouslySetInnerHTML={{
                    __html: values.body.trim()
                      ? renderTemplate(values.body, SAMPLE_VARIABLES)
                      : '<p style="font-style:italic;opacity:0.6">Nothing to preview yet — switch to Edit HTML to write the email body.</p>',
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Shown with sample booking data. Variables like <code>{'{{client_first_name}}'}</code>{' '}
                will use the real booking&apos;s values when the email is sent.
              </p>
            </TabsContent>
            <TabsContent value="html" className="mt-2">
              <BodyEditor value={values.body} onChange={(body) => setValues((prev) => ({ ...prev, body }))} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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

      <div className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push('/admin/email-templates')}
              disabled={isPending}
            >
              Cancel
            </Button>
            {id && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
                className="text-muted-foreground hover:text-destructive"
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {id && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendTest}
                disabled={testPending || !ownerEmail}
                title={ownerEmail ? `Send a sample to ${ownerEmail}` : 'Set Owner email under Settings to enable test sends'}
              >
                <Send className="size-4 mr-2" />
                {testPending ? 'Sending…' : 'Send test'}
              </Button>
            )}
            <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving…' : id ? 'Save changes' : 'Create template'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
