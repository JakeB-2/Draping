'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { saveEmailSettings, type SettingsActionState } from '../actions'
import { Section, Field } from '../section-form'

const initial: SettingsActionState = { ok: false, error: null }

export function EmailForm({ ownerEmail, emailFrom }: { ownerEmail: string | null; emailFrom: string | null }) {
  const [state, formAction, pending] = useActionState(saveEmailSettings, initial)

  useEffect(() => {
    if (state.ok) toast.success('Email settings saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-8">
      <Section title="Email" description="Resend wires up automatic emails. The from address comes from the EMAIL_FROM env var.">
        <Field label="From address" htmlFor="email_from_display" hint="Read-only — set in environment.">
          <Input id="email_from_display" defaultValue={emailFrom ?? '(EMAIL_FROM not set)'} readOnly className="bg-muted" />
        </Field>
        <Field label="Owner email (test sends)" htmlFor="owner_email" hint="Receives ?test=1 template previews.">
          <Input id="owner_email" name="owner_email" type="email" defaultValue={ownerEmail ?? ''} placeholder="owner@example.ca" />
        </Field>
      </Section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save email settings'}
        </Button>
      </div>
    </form>
  )
}
