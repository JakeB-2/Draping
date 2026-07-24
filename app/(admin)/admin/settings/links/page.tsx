import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SectionSkeleton } from '../section-form'
import { LinksForm, type LinkSettings } from './links-form'

const DEFAULTS: LinkSettings = {
  about_url: null,
  facebook_url: null,
  experience_url: null,
}

async function Content() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('booking_settings')
    .select('about_url, facebook_url, experience_url')
    .limit(1)
    .maybeSingle()
  if (error) throw error

  const settings: LinkSettings = data ? { ...DEFAULTS, ...(data as Partial<LinkSettings>) } : DEFAULTS
  return <LinksForm settings={settings} />
}

export default function LinksSettingsPage() {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Content />
    </Suspense>
  )
}
