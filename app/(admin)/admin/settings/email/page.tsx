import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SectionSkeleton } from '../section-form'
import { EmailForm } from './email-form'

async function Content() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_settings')
    .select('owner_email')
    .limit(1)
    .maybeSingle()
  if (error) throw error

  return <EmailForm ownerEmail={data?.owner_email ?? null} emailFrom={process.env.EMAIL_FROM ?? null} />
}

export default function EmailSettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Content />
    </Suspense>
  )
}
