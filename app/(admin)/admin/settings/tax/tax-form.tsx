'use client'

import { useEffect } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { saveTax, type SettingsActionState } from '../actions'
import { Section, Field } from '../section-form'

const initial: SettingsActionState = { ok: false, error: null }

export function TaxForm({
  taxRatePercent,
  currencyCode,
  currencyLocale,
}: {
  taxRatePercent: number
  currencyCode: string
  currencyLocale: string
}) {
  const [state, formAction, pending] = useActionState(saveTax, initial)

  useEffect(() => {
    if (state.ok) toast.success('Tax rate saved')
  }, [state])

  return (
    <form action={formAction} className="space-y-8">
      <Section title="Checkout tax" description="Added at checkout without changing offering prices. Each booking keeps the rate used when it was submitted.">
        <Field label="Tax rate (%)" htmlFor="tax_rate_percent" colSpan={2} required hint="Enter 16 for 16%. Use 0 to disable tax.">
          <Input
            id="tax_rate_percent"
            name="tax_rate_percent"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={taxRatePercent}
            required
          />
        </Field>
      </Section>

      <Section title="Money display" description="Only affects how amounts are shown on the public site and in emails. Prices themselves never change.">
        <Field label="Currency code" htmlFor="currency_code" required hint="ISO code shown next to totals, e.g. CAD.">
          <Input
            id="currency_code"
            name="currency_code"
            defaultValue={currencyCode}
            minLength={2}
            maxLength={8}
            required
          />
        </Field>
        <Field label="Currency locale" htmlFor="currency_locale" required hint="Number formatting locale, e.g. en-CA.">
          <Input
            id="currency_locale"
            name="currency_locale"
            defaultValue={currencyLocale}
            maxLength={20}
            required
          />
        </Field>
      </Section>

      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save tax rate'}
        </Button>
      </div>
    </form>
  )
}
