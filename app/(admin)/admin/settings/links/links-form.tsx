'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { saveLinks, type SettingsActionState } from '../actions'
import { Section, Field } from '../section-form'

export type LinkSettings = {
  about_url: string | null
  facebook_url: string | null
  experience_url: string | null
}

const initial: SettingsActionState = { ok: false, error: null }

export function LinksForm({ settings }: { settings: LinkSettings }) {
  const [state, formAction, pending] = useActionState(saveLinks, initial)

  useEffect(() => {
    if (state.ok) toast.success('Links saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-8">
      <Section title="Links" description="Optional links surfaced on the public site. Leave a field blank to hide that link.">
        <Field label="About page URL" htmlFor="about_url" colSpan={2} hint="Blank = hidden on the public site.">
          <Input id="about_url" name="about_url" type="url" defaultValue={settings.about_url ?? ''} placeholder="https://example.com/about" />
        </Field>
        <Field label="Facebook URL" htmlFor="facebook_url" colSpan={2} hint="Blank = hidden on the public site.">
          <Input id="facebook_url" name="facebook_url" type="url" defaultValue={settings.facebook_url ?? ''} placeholder="https://facebook.com/yourpage" />
        </Field>
        <Field label="Experience page URL" htmlFor="experience_url" colSpan={2} hint="Blank = hidden on the public site.">
          <Input id="experience_url" name="experience_url" type="url" defaultValue={settings.experience_url ?? ''} placeholder="https://example.com/experience" />
        </Field>
      </Section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save links'}
        </Button>
      </div>
    </form>
  )
}
