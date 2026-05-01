import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { EmailTemplateForm } from '../email-template-form'

type TemplateRow = {
  id: string
  name: string
  subject: string
  to_address: string | null
  cc_address: string | null
  bcc_address: string | null
  body: string
}

type AttachmentRow = {
  id: string
  file_name: string
  content_type: string
  file_size: number | null
  storage_path: string
}

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: templateData }, { data: attachmentsData }, { data: settings }] = await Promise.all([
    supabase.from('email_templates').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('email_template_attachments')
      .select('id, file_name, content_type, file_size, storage_path')
      .eq('template_id', id)
      .order('created_at'),
    supabase.from('booking_settings').select('owner_email').limit(1).maybeSingle(),
  ])

  if (!templateData) notFound()

  const template = templateData as TemplateRow
  const attachments = (attachmentsData ?? []) as AttachmentRow[]

  return (
    <EmailTemplateForm
      id={template.id}
      defaultValues={{
        name: template.name,
        subject: template.subject,
        to_address: template.to_address ?? '',
        cc_address: template.cc_address ?? '',
        bcc_address: template.bcc_address ?? '',
        body: template.body,
      }}
      attachments={attachments}
      ownerEmail={settings?.owner_email ?? null}
    />
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  )
}

export default function EditEmailTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/admin/email-templates" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-3.5 w-3.5" /> Back to email
        </Link>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mt-2">Email · Template</p>
        <h1 className="text-2xl font-light mt-1">Edit template</h1>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <EditContent params={params} />
      </Suspense>
    </div>
  )
}
