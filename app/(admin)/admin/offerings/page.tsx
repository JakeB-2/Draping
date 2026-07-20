import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/server'
import { CatalogClient, type CatalogGroup, type CatalogService, type CatalogOffering } from './catalog-client'
import { PublishButton } from './publish-button'

async function OfferingsContent() {
  const supabase = await createClient()
  const [groupsRes, servicesRes, offeringsRes, snapshotRes] = await Promise.all([
    supabase.from('service_groups').select('id, name, description').order('name'),
    supabase.from('services').select('id, name, description, time_requirement_minutes, service_group_id, is_active').order('name'),
    supabase
      .from('offerings')
      .select('id, name, description, duration_minutes, price_amount, break_required, break_minutes, buffer_minutes, people_count, time_adjustment_minutes, is_active, offering_services ( service_id )')
      .order('name'),
    supabase.from('published_snapshots').select('published_at').eq('is_active', true).maybeSingle(),
  ])
  if (groupsRes.error) throw groupsRes.error
  if (servicesRes.error) throw servicesRes.error
  if (offeringsRes.error) throw offeringsRes.error

  const groups = (groupsRes.data ?? []) as CatalogGroup[]
  const services = (servicesRes.data ?? []) as CatalogService[]
  const offerings: CatalogOffering[] = (offeringsRes.data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    description: o.description,
    duration_minutes: o.duration_minutes,
    price_amount: Number(o.price_amount),
    break_required: o.break_required,
    break_minutes: o.break_minutes,
    buffer_minutes: o.buffer_minutes,
    people_count: o.people_count,
    time_adjustment_minutes: o.time_adjustment_minutes,
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
        <PublishButton lastPublished={snapshotRes.data?.published_at ?? null} />
      </header>
      <CatalogClient groups={groups} services={services} offerings={offerings} />
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
