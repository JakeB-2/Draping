import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { getPublicStudioSettings } from '@/lib/public-settings'
import type { BookingScheduleWindow } from '@/lib/booking-time'
import { CatalogClient, type CatalogGroup, type CatalogService, type CatalogOffering } from './catalog-client'
import { PublishButton } from './publish-button'

async function OfferingsContent() {
  const supabase = await createClient()
  const { timezone } = await getPublicStudioSettings()
  const [groupsRes, servicesRes, termsRes, offeringsRes, scheduleRes, snapshotRes] = await Promise.all([
    supabase.from('service_groups').select('id, name, description').order('name'),
    supabase.from('services').select('id, name, description, price_amount, service_group_id, is_active, requires_all_attendees').order('name'),
    supabase.from('service_duration_terms').select('service_id, participant_count, duration_minutes').order('participant_count'),
    supabase
      .from('offerings')
      .select('id, name, description, price_override, buffer_minutes, allowed_start_times, is_active, offering_services ( service_id )')
      .order('name'),
    supabase.from('weekly_schedule').select('is_open, start_time, end_time'),
    supabase.from('published_snapshots').select('published_at').eq('is_active', true).maybeSingle(),
  ])
  if (groupsRes.error) throw groupsRes.error
  if (servicesRes.error) throw servicesRes.error
  if (termsRes.error) throw termsRes.error
  if (offeringsRes.error) throw offeringsRes.error
  if (scheduleRes.error) throw scheduleRes.error

  const groups = (groupsRes.data ?? []) as CatalogGroup[]
  const services: CatalogService[] = (servicesRes.data ?? []).map((service) => ({
    ...service,
    price_amount: String(service.price_amount),
    duration_terms: (termsRes.data ?? [])
      .filter((term) => term.service_id === service.id)
      .map((term) => ({ participant_count: Number(term.participant_count), duration_minutes: Number(term.duration_minutes) })),
  }))
  const offerings: CatalogOffering[] = (offeringsRes.data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    price_override: o.price_override === null ? null : String(o.price_override),
    buffer_minutes: o.buffer_minutes,
    allowed_start_times: (o.allowed_start_times ?? []).map((time: string) => time.slice(0, 5)),
    is_active: o.is_active,
    service_ids: (o.offering_services as unknown as { service_id: string }[]).map((os) => os.service_id),
  }))

  return (
    <>
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
          <h1 className="text-2xl font-light mt-1">Offerings</h1>
        </div>
        <PublishButton lastPublished={snapshotRes.data?.published_at ?? null} timezone={timezone} />
      </header>
      <CatalogClient
        groups={groups}
        services={services}
        offerings={offerings}
        bookingSchedule={(scheduleRes.data ?? []) as BookingScheduleWindow[]}
      />
    </>
  )
}

function CatalogSkeleton() {
  return (
    <div className="space-y-10">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-full" />
          <div className="border rounded-md divide-y">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between gap-4 px-4 py-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-7 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function OfferingsPage() {
  return (
    <div className="space-y-4">
      <Suspense fallback={<CatalogSkeleton />}>
        <OfferingsContent />
      </Suspense>
    </div>
  )
}
