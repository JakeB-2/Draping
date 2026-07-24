'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { saveTimezone, type SettingsActionState } from '../actions'
import { Section, Field } from '../section-form'

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

export function TimezoneForm({ timezone }: { timezone: string }) {
  const [state, formAction, pending] = useActionState(saveTimezone, initial)

  useEffect(() => {
    if (state.ok) toast.success('Timezone saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-8">
      <Section title="Timezone" description="Used for slot generation and date display in admin + emails.">
        <Field label="Timezone" htmlFor="timezone" colSpan={2} required>
          <Select name="timezone" defaultValue={timezone || 'America/Toronto'}>
            <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TZ_OPTIONS.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save timezone'}
        </Button>
      </div>
    </form>
  )
}
