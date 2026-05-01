'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { saveRules, type RulesActionState } from './rules-actions'

export type Rules = {
  slot_increment_minutes: number
  buffer_minutes: number
  min_lead_hours: number
  max_advance_days: number
  break_threshold_minutes: number
  break_duration_minutes: number
  max_bookings_per_day: number | null
  max_bookings_per_week: number | null
  max_consecutive_booking_days: number | null
}

const initial: RulesActionState = { ok: false, error: null }

export function RulesForm({ rules }: { rules: Rules }) {
  const [state, formAction, pending] = useActionState(saveRules, initial)

  useEffect(() => {
    if (state.ok) toast.success('Rules saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-8">
      <Section title="Booking rules" description="Padding around bookings + how far in advance the public can book.">
        <Field label="Slot increment (min)" htmlFor="slot_increment_minutes" hint="Granularity of bookable slots.">
          <Input id="slot_increment_minutes" name="slot_increment_minutes" type="number" min={5} max={120} step={5} defaultValue={rules.slot_increment_minutes} required />
        </Field>
        <Field label="Buffer between bookings (min)" htmlFor="buffer_minutes" hint="Tear-down + reset time after each session.">
          <Input id="buffer_minutes" name="buffer_minutes" type="number" min={0} max={240} defaultValue={rules.buffer_minutes} required />
        </Field>
        <Field label="Min lead time (hrs)" htmlFor="min_lead_hours" hint="Minimum notice before a slot becomes bookable.">
          <Input id="min_lead_hours" name="min_lead_hours" type="number" min={0} max={8760} defaultValue={rules.min_lead_hours} required />
        </Field>
        <Field label="Booking window (days)" htmlFor="max_advance_days" hint="How far ahead clients can see slots.">
          <Input id="max_advance_days" name="max_advance_days" type="number" min={1} max={365} defaultValue={rules.max_advance_days} required />
        </Field>
      </Section>

      <Section title="Break rules" description="Bookings longer than the threshold automatically include a break of the configured duration.">
        <Field label="Break threshold (min)" htmlFor="break_threshold_minutes">
          <Input id="break_threshold_minutes" name="break_threshold_minutes" type="number" min={0} max={1440} defaultValue={rules.break_threshold_minutes} required />
        </Field>
        <Field label="Break duration (min)" htmlFor="break_duration_minutes">
          <Input id="break_duration_minutes" name="break_duration_minutes" type="number" min={0} max={240} defaultValue={rules.break_duration_minutes} required />
        </Field>
      </Section>

      <Section title="Limits" description="Optional caps. Leave blank for no limit.">
        <Field label="Max bookings / day" htmlFor="max_bookings_per_day">
          <Input id="max_bookings_per_day" name="max_bookings_per_day" type="number" min={0} defaultValue={rules.max_bookings_per_day ?? ''} placeholder="No limit" />
        </Field>
        <Field label="Max bookings / week" htmlFor="max_bookings_per_week">
          <Input id="max_bookings_per_week" name="max_bookings_per_week" type="number" min={0} defaultValue={rules.max_bookings_per_week ?? ''} placeholder="No limit" />
        </Field>
        <Field label="Max consecutive booking days" htmlFor="max_consecutive_booking_days">
          <Input id="max_consecutive_booking_days" name="max_consecutive_booking_days" type="number" min={0} defaultValue={rules.max_consecutive_booking_days ?? ''} placeholder="No limit" />
        </Field>
      </Section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? 'Saving…' : 'Save rules'}
        </Button>
      </div>
    </form>
  )
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t pt-6 first:border-t-0 first:pt-0">
      <div className="md:col-span-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
