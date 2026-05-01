import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmailTriggerRow } from './EmailTriggerRow'
import type { EmailTrigger } from '@/lib/actions/email-triggers'

type Template = {
  id: string
  name: string
  subject: string
  to_address: string | null
  updated_at: string
}

export default async function EmailPage() {
  const supabase = await createClient()

  const [{ data: triggersData }, { data: templatesData }] = await Promise.all([
    supabase
      .from('booking_action_triggers')
      .select('id, action, label, template_id, is_active')
      .order('sort_order'),
    supabase
      .from('email_templates')
      .select('id, name, subject, to_address, updated_at')
      .order('name'),
  ])

  const triggers = (triggersData ?? []) as EmailTrigger[]
  const templates = (templatesData ?? []) as Template[]

  return (
    <div className="max-w-3xl space-y-10">
      <h1 className="text-2xl font-bold tracking-tight">Email</h1>

      {/* Triggers */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Triggers</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Choose which template is sent for each booking event.
          </p>
        </div>
        <div className="rounded-lg border px-4">
          {triggers.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No triggers found.</p>
          ) : (
            triggers.map((trigger) => (
              <EmailTriggerRow
                key={trigger.id}
                trigger={trigger}
                templates={templates}
              />
            ))
          )}
        </div>
      </section>

      {/* Templates */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Templates</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              HTML email templates with{' '}
              <code className="text-xs bg-muted px-1 rounded">{'{{variable}}'}</code> substitution.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/admin/email-templates/new">New Template</Link>
          </Button>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates yet. Create one to start sending automated emails.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border p-4 flex items-center justify-between gap-4"
              >
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
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
