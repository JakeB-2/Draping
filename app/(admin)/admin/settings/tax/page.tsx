import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SectionSkeleton } from '../section-form'
import { TaxForm } from './tax-form'

async function Content() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_settings')
    .select('tax_rate_percent, currency_code, currency_locale')
    .limit(1)
    .maybeSingle()
  if (error) throw error

  return (
    <TaxForm
      taxRatePercent={data?.tax_rate_percent ?? 0}
      currencyCode={data?.currency_code ?? 'CAD'}
      currencyLocale={data?.currency_locale ?? 'en-CA'}
    />
  )
}

export default function TaxSettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Content />
    </Suspense>
  )
}
