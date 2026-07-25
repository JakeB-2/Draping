'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { saveStudio, type SettingsActionState } from '../actions'
import { Section, Field } from '../section-form'

export type StudioSettings = {
  business_name: string | null
  address: string | null
  contact_email: string | null
  phone: string | null
  owner_name: string | null
  city: string | null
  region: string | null
  credential_label: string | null
  seo_description: string | null
}

const initial: SettingsActionState = { ok: false, error: null }

export function StudioForm({ settings }: { settings: StudioSettings }) {
  const [state, formAction, pending] = useActionState(saveStudio, initial)

  useEffect(() => {
    if (state.ok) toast.success('Studio details saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-8">
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

      <Section title="Identity" description="Names and wording shown on the public landing page and in search results.">
        <Field label="Owner name" htmlFor="owner_name" hint="Shown in the about section and nav links.">
          <Input id="owner_name" name="owner_name" defaultValue={settings.owner_name ?? ''} maxLength={100} placeholder="Lisa Kelly" />
        </Field>
        <Field label="Credential" htmlFor="credential_label" hint="Shown under the hero signature.">
          <Input id="credential_label" name="credential_label" defaultValue={settings.credential_label ?? ''} maxLength={100} placeholder="Chrysalis Colour analyst" />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" defaultValue={settings.city ?? ''} maxLength={100} placeholder="Ottawa" />
        </Field>
        <Field label="Province / region" htmlFor="region">
          <Input id="region" name="region" defaultValue={settings.region ?? ''} maxLength={100} placeholder="Ontario" />
        </Field>
        <Field label="Search description" htmlFor="seo_description" colSpan={2} hint="Used as the page description in search results and link previews.">
          <Textarea id="seo_description" name="seo_description" defaultValue={settings.seo_description ?? ''} rows={3} maxLength={300} placeholder="Discover the colours that bring you into focus…" />
        </Field>
      </Section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save studio details'}
        </Button>
      </div>
    </form>
  )
}
