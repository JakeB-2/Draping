import { cacheTag } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'

export const SNAPSHOT_CACHE_TAG = 'public-snapshot'

export type PublicService = {
  id: string
  name: string
  description: string | null
  service_group_id: string
  time_requirement_minutes: number
}

export type PublicServiceGroup = {
  id: string
  name: string
  description: string | null
}

export type PublicOffering = {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price_amount: number
  break_required: boolean
  break_minutes: number
  people_count: number
  service_ids: string[]
  image_urls: string[]
}

export type PublicSnapshot = {
  service_groups: PublicServiceGroup[]
  services: PublicService[]
  offerings: PublicOffering[]
  generated_at: string
}

/**
 * Public read path for the booking page. Cached at module level via
 * `'use cache' + cacheTag(SNAPSHOT_CACHE_TAG)`. Invalidated by publishOfferingSnapshot()
 * via revalidateTag(SNAPSHOT_CACHE_TAG).
 */
export async function getActiveSnapshot(): Promise<PublicSnapshot | null> {
  'use cache'
  cacheTag(SNAPSHOT_CACHE_TAG)

  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('published_snapshots')
    .select('payload')
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return data.payload as PublicSnapshot
}

// publishOfferingSnapshot() lives in admin server actions — added in Phase 3.
