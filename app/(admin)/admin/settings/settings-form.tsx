'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { RequiredMark } from '@/components/ui/required-mark'
import { saveSettings, type SettingsActionState } from './actions'

export type Settings = {
  business_name: string | null
  address: string | null
  contact_email: string | null
  phone: string | null
  timezone: string
  owner_email: string | null
  tax_rate_percent: number
}

const initial: SettingsActionState = { ok: false, error: null }

const TZ_OPTIONS = [
  'America/Toronto',
  'America/Halifax',
  'America/Winnipeg',
  'America/Edmonton',
  'America/Vancouver',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'UTC',
]

export function SettingsForm({ settings, emailFrom }: { settings: Settings; emailFrom: string | null }) {
  const [state, formAction, pending] = useActionState(saveSettings, initial)

  useEffect(() => {
    if (state.ok) toast.success('Settings saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-10">
      <Section title="Studio" description="Used in confirmation emails, the public site footer, and admin reference.">
        <Field label="Business name" htmlFor="business_name">
          <Input id="business_name" name="business_name" defaultValue={settings.business_name ?? ''} maxLength={100} placeholder="[Owner Name] Colour" />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={settings.phone ?? ''} maxLength={40} placeholder="(613) 555-0101" />
        </Field>
        <Field label="Contact email" htmlFor="contact_email" colSpan={2}>
          <Input id="contact_email" name="contact_email" type="email" defaultValue={settings.contact_email ?? ''} placeholder="hello@example.ca" />
        </Field>
        <Field label="Studio address" htmlFor="address" colSpan={2}>
          <Textarea id="address" name="address" defaultValue={settings.address ?? ''} rows={2} placeholder="Street, suite, city, postal code" />
        </Field>
      </Section>

      <Section title="Timezone" description="Used for slot generation and date display in admin + emails.">
        <Field label="Timezone" htmlFor="timezone" colSpan={2} required>
          <Select name="timezone" defaultValue={settings.timezone || 'America/Toronto'}>
            <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TZ_OPTIONS.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Checkout tax" description="Added at checkout without changing offering prices. Each booking keeps the rate used when it was submitted.">
        <Field label="Tax rate (%)" htmlFor="tax_rate_percent" colSpan={2} required hint="Enter 16 for 16%. Use 0 to disable tax.">
          <Input
            id="tax_rate_percent"
            name="tax_rate_percent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={settings.tax_rate_percent}
            required
          />
        </Field>
      </Section>

      <Section title="Email" description="Resend wires up automatic emails. The from address comes from the EMAIL_FROM env var.">
        <Field label="From address" htmlFor="email_from_display" hint="Read-only — set in environment.">
          <Input id="email_from_display" defaultValue={emailFrom ?? '(EMAIL_FROM not set)'} readOnly className="bg-muted" />
        </Field>
        <Field label="Owner email (test sends)" htmlFor="owner_email" hint="Receives ?test=1 template previews.">
          <Input id="owner_email" name="owner_email" type="email" defaultValue={settings.owner_email ?? ''} placeholder="owner@example.ca" />
        </Field>
      </Section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end sticky bottom-4">
        <Button type="submit" disabled={pending} size="lg">
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t pt-8 first:border-t-0 first:pt-0">
      <div className="md:col-span-1">
        <h2 className="text-base font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, htmlFor, hint, colSpan, required, children }: { label: string; htmlFor: string; hint?: string; colSpan?: number; required?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-2 ${colSpan === 2 ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={htmlFor}>{label}{required && <RequiredMark />}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
