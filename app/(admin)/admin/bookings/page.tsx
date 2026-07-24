import { Suspense } from 'react'
import Link from 'next/link'
import { Plus, Settings2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { getPublicStudioSettings } from '@/lib/public-settings'
import { type BookingStatus } from './status-badge'
import { OneOffSection, type OneOff } from './one-off-section'
import { BookingRow, type BookingRowData } from './booking-row'

const STATUSES: (BookingStatus | 'all')[] = ['all', 'pending', 'confirmed', 'completed', 'cancelled']

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

async function BookingsBody({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: rawStatus } = await searchParams
  const status = rawStatus && STATUSES.includes(rawStatus as BookingStatus | 'all') ? rawStatus : 'all'

  const supabase = await createClient()
  let query = supabase
    .from('bookings')
    .select(`
      id, starts_at, ends_at, status, duration_minutes, notes, offering_name_snapshot,
      offerings ( name )
    `)
    .order('starts_at', { ascending: false })
    .limit(100)

  if (status !== 'all') query = query.eq('status', status)

  const [bookingsRes, oneOffsRes, settings] = await Promise.all([
    query,
    supabase.from('blocked_periods').select('id, start_at, end_at, reason').gte('end_at', new Date().toISOString()).order('start_at'),
    getPublicStudioSettings(),
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

  const rows: BookingRowData[] = ((bookingsRes.data ?? []) as unknown as BookingQueryRow[]).map((b) => ({
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

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <nav className="flex gap-1.5 flex-wrap" aria-label="Filter by status">
          <span className="text-xs uppercase tracking-wider text-muted-foreground self-center mr-1">Filter</span>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={s === 'all' ? '/admin/bookings' : `/admin/bookings?status=${s}`}
              className={`text-xs px-2.5 py-1 rounded-full border ${status === s ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/40'}`}
            >
              {s}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center border rounded-md">No bookings.</p>
        ) : (
          <ul className="border rounded-md divide-y">
            {rows.map((b) => (
              <BookingRow key={b.id} booking={b} timezone={settings.timezone} />
            ))}
          </ul>
        )}
      </section>

      <OneOffSection items={oneOffs} timezone={settings.timezone} />
    </div>
  )
}

function BodySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-72" />
      <div className="border rounded-md divide-y">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function BookingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
            <Link href="/admin/booking-options">
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
