import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { SettingsForm, type Settings } from './settings-form'

const DEFAULTS: Settings = {
  business_name: null,
  address: null,
  contact_email: null,
  phone: null,
  timezone: 'America/Toronto',
  owner_email: null,
  tax_rate_percent: 0,
  max_participants_per_booking: 2,
  pair_discount_percent: 0,
}

async function SettingsContent() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_settings')
    .select('business_name, address, contact_email, phone, timezone, owner_email, tax_rate_percent, max_participants_per_booking, pair_discount_percent')
    .limit(1)
    .maybeSingle()
  if (error) throw error

  const settings: Settings = data ? { ...DEFAULTS, ...(data as Partial<Settings>) } : DEFAULTS
  return <SettingsForm settings={settings} emailFrom={process.env.EMAIL_FROM ?? null} />
}

function FormSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
        <h1 className="text-2xl font-light mt-1">Settings</h1>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  )
}
