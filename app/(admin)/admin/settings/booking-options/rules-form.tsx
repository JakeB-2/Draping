'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RequiredMark } from '@/components/ui/required-mark'
import { toast } from 'sonner'
import { saveRules, type RulesActionState } from './rules-actions'

export type Rules = {
  min_lead_hours: number
  max_advance_days: number
  max_booked_minutes_per_day: number | null
  max_booking_days_per_week: number | null
  max_consecutive_booking_days: number | null
  break_minutes: number | null
  quote_notice_text: string | null
}

const initial: RulesActionState = { ok: false, error: null }

export function RulesForm({ rules }: { rules: Rules }) {
  const [state, formAction, pending] = useActionState(saveRules, initial)

  useEffect(() => {
    if (state.ok) toast.success('Rules saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-8">
      <Section title="Booking rules" description="How far in advance the public can book. Start times and buffers are configured on offerings.">
        <Field label="Min lead time (days)" htmlFor="min_lead_days" hint="Minimum notice before a slot becomes bookable. Half days are allowed." required>
          <Input id="min_lead_days" name="min_lead_days" type="number" min={0} max={365} step={0.5} defaultValue={Math.round((rules.min_lead_hours / 24) * 2) / 2} required />
        </Field>
        <Field label="Booking window (days)" htmlFor="max_advance_days" hint="How far ahead clients can see slots." required>
          <Input id="max_advance_days" name="max_advance_days" type="number" min={1} max={365} defaultValue={rules.max_advance_days} required />
        </Field>
      </Section>

      <Section title="Limits" description="Optional caps. Leave blank for no limit.">
        <Field label="Max booked time / day (min)" htmlFor="max_booked_minutes_per_day" hint="Total minutes of bookings allowed in a single day.">
          <Input id="max_booked_minutes_per_day" name="max_booked_minutes_per_day" type="number" min={1} defaultValue={rules.max_booked_minutes_per_day ?? ''} placeholder="No limit" />
        </Field>
        <Field label="Max booking days / week" htmlFor="max_booking_days_per_week" hint="Distinct days per week that may have any bookings.">
          <Input id="max_booking_days_per_week" name="max_booking_days_per_week" type="number" min={1} max={7} defaultValue={rules.max_booking_days_per_week ?? ''} placeholder="No limit" />
        </Field>
        <Field label="Max consecutive booking days" htmlFor="max_consecutive_booking_days">
          <Input id="max_consecutive_booking_days" name="max_consecutive_booking_days" type="number" min={1} defaultValue={rules.max_consecutive_booking_days ?? ''} placeholder="No limit" />
        </Field>
      </Section>

      <Section title="Sessions" description="Automatic breaks and the notice shown alongside the public live quote.">
        <Field label="Break length (minutes)" htmlFor="break_minutes" hint="Inserted automatically when a booking has more than one performance of a service that requires all attendees. Leave blank for no automatic break.">
          <Input id="break_minutes" name="break_minutes" type="number" min={1} defaultValue={rules.break_minutes ?? ''} placeholder="No break" />
        </Field>
        <Field label="Quote card notice" htmlFor="quote_notice_text" hint="Shown inside the public live-quote card. Leave blank to hide.">
          <Textarea id="quote_notice_text" name="quote_notice_text" rows={3} maxLength={1000} defaultValue={rules.quote_notice_text ?? ''} placeholder="e.g. Final total confirmed at the studio." />
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

function Field({ label, htmlFor, hint, required, children }: { label: string; htmlFor: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}{required && <RequiredMark />}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
