// /admin/bookings — single-route split workspace. DataTable list on the left,
// booking detail pane on the right driven by ?selected=<id>. The old
// /admin/bookings/[id] route redirects here (emails and old links still work).

import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Settings2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { SplitView } from '@/components/screens/split-view'
import { SplitEmptyState } from '@/components/screens/split-empty-state'
import { createClient } from '@/lib/supabase/server'
import { getPublicStudioSettings } from '@/lib/public-settings'
import { OneOffSection, type OneOff } from './one-off-section'
import { BookingsTable, type BookingListRow } from './bookings-table'
import { BookingDetailPanel } from './booking-detail-panel'

type BookingQueryRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  duration_minutes: number
  notes: string | null
  offering_name_snapshot: string | null
  offerings: { name: string } | null
}

type BookingsSearchParams = Promise<{ selected?: string }>

async function BookingsBody({ searchParams }: { searchParams: BookingsSearchParams }) {
  const { selected } = await searchParams

  const supabase = await createClient()
  const query = supabase
    .from('bookings')
    .select(`
      id, starts_at, ends_at, status, duration_minutes, notes, offering_name_snapshot,
      offerings ( name )
    `)
    .order('starts_at', { ascending: false })
    .limit(100)

  const [bookingsRes, oneOffsRes, settings, selectedRes] = await Promise.all([
    query,
    supabase.from('blocked_periods').select('id, start_at, end_at, reason').gte('end_at', new Date().toISOString()).order('start_at'),
    getPublicStudioSettings(),
    // Cheap existence probe for ?selected= — the panel itself streams the full
    // graph behind Suspense. A malformed id resolves to "nothing selected"
    // instead of throwing (stale links, hand-edited URLs).
    selected
      ? supabase.from('bookings').select('id').eq('id', selected).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (bookingsRes.error) throw bookingsRes.error
  if (oneOffsRes.error) throw oneOffsRes.error

  const bookingIds = (bookingsRes.data ?? []).map((booking) => booking.id)
  const participantsRes = bookingIds.length
    ? await supabase
        .from('booking_participants')
        .select('booking_id, participant_number, display_name')
        .in('booking_id', bookingIds)
        .order('participant_number')
    : { data: [], error: null }
  if (participantsRes.error) throw participantsRes.error
  const participantsByBooking = new Map<string, { display_name: string }[]>()
  for (const participant of participantsRes.data ?? []) {
    const list = participantsByBooking.get(participant.booking_id) ?? []
    list.push(participant)
    participantsByBooking.set(participant.booking_id, list)
  }

  const rows: BookingListRow[] = ((bookingsRes.data ?? []) as unknown as BookingQueryRow[]).map((b) => ({
    id: b.id,
    starts_at: b.starts_at,
    status: b.status,
    participant_count: participantsByBooking.get(b.id)?.length ?? 0,
    duration_minutes: b.duration_minutes,
    offering_name: b.offering_name_snapshot ?? b.offerings?.name ?? null,
    client_label: (participantsByBooking.get(b.id) ?? [])
      .map((participant) => participant.display_name)
      .join(' & '),
  }))
  const oneOffs = (oneOffsRes.data ?? []) as OneOff[]
  const selectedId = selectedRes.data?.id ?? null

  return (
    <div className="space-y-10">
      <SplitView
        list={<BookingsTable data={rows} selectedId={selectedId} timezone={settings.timezone} />}
        detail={selectedId ? (
          <Suspense fallback={<DetailSkeleton />}>
            <BookingDetailPanel id={selectedId} timezone={settings.timezone} />
          </Suspense>
        ) : (
          <SplitEmptyState description="Select a booking to see its details." />
        )}
        selected={!!selectedId}
        detailWidthClassName="lg:w-2/5"
      />

      <OneOffSection items={oneOffs} timezone={settings.timezone} />
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  )
}

function BodySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="border rounded-md divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="px-4 py-3 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BookingsPage({ searchParams }: { searchParams: BookingsSearchParams }) {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admin</p>
          <h1 className="text-2xl font-light mt-1">Bookings</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href="/admin/bookings/new"><Plus className="h-3.5 w-3.5 mr-1.5" /> New booking</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings/availability">
              <Settings2 className="h-3.5 w-3.5 mr-1.5" /> More options
            </Link>
          </Button>
        </div>
      </header>
      <Suspense fallback={<BodySkeleton />}>
        <BookingsBody searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
