import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { EmailTriggerRow } from './email-trigger-row'
import type { EmailTrigger } from './trigger-actions'

type Template = {
  id: string
  name: string
  subject: string
  to_address: string | null
  updated_at: string
}

async function EmailTemplatesContent() {
  const supabase = await createClient()

  const [{ data: triggersData, error: triggersErr }, { data: templatesData, error: templatesErr }] = await Promise.all([
    supabase
      .from('booking_action_triggers')
      .select('id, action, label, template_id, is_active')
      .order('sort_order'),
    supabase
      .from('email_templates')
      .select('id, name, subject, to_address, updated_at')
      .order('name'),
  ])
  if (triggersErr) throw triggersErr
  if (templatesErr) throw templatesErr

  const triggers = (triggersData ?? []) as EmailTrigger[]
  const templates = (templatesData ?? []) as Template[]

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-light">Triggers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose which template is sent for each booking event.
          </p>
        </header>
        <div className="rounded-md border px-4">
          {triggers.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No triggers found.</p>
          ) : (
            triggers.map((trigger) => (
              <EmailTriggerRow key={trigger.id} trigger={trigger} templates={templates} />
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-light">Templates</h2>
            <p className="text-sm text-muted-foreground mt-1">
              HTML email templates with{' '}
              <code className="text-xs bg-muted px-1 rounded">{'{{variable}}'}</code> substitution.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/admin/email-templates/new">New template</Link>
          </Button>
        </header>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
            No templates yet. Create one to start sending automated emails.
          </p>
        ) : (
          <ul className="border rounded-md divide-y">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{t.subject}</p>
                  {t.to_address && (
                    <Badge variant="secondary" className="mt-1 font-mono text-xs">
                      To: {t.to_address}
                    </Badge>
                  )}
                </div>
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <Link href={`/admin/email-templates/${t.id}`}>Edit</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ContentSkeleton() {
  return (
    <div className="space-y-10">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      ))}
    </div>
  )
}

export default function EmailTemplatesPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
        <h1 className="text-2xl font-light mt-1">Email</h1>
      </div>
      <Suspense fallback={<ContentSkeleton />}>
        <EmailTemplatesContent />
      </Suspense>
    </div>
  )
}
