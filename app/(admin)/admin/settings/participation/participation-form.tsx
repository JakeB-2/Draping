'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { saveParticipation, type SettingsActionState } from '../actions'
import { Section, Field } from '../section-form'

export type ParticipationSettings = {
  max_participants_per_booking: number
  pair_discount_percent: number
}

const initial: SettingsActionState = { ok: false, error: null }

export function ParticipationForm({ settings }: { settings: ParticipationSettings }) {
  const [state, formAction, pending] = useActionState(saveParticipation, initial)

  useEffect(() => {
    if (state.ok) toast.success('Participation settings saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-8">
      <Section title="Participation" description="Booking-wide attendance policy and the discount applied when an additional attendee joins at least one service.">
        <Field label="Maximum participants" htmlFor="max_participants_per_booking" required hint="The tables support larger groups; this setting is the enforced policy cap.">
          <Input
            id="max_participants_per_booking"
            name="max_participants_per_booking"
            type="number"
            min={1}
            max={100}
            step={1}
            defaultValue={settings.max_participants_per_booking}
            required
          />
        </Field>
        <Field label="Pair discount (%)" htmlFor="pair_discount_percent" required hint="Applied to the base package only. Use 0 to disable.">
          <Input
            id="pair_discount_percent"
            name="pair_discount_percent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={settings.pair_discount_percent}
            required
          />
        </Field>
      </Section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save participation'}
        </Button>
      </div>
    </form>
  )
}
