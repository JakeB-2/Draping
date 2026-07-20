import { Suspense } from 'react'
import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { type BookingStatus } from './status-badge'
import { OneOffSection, type OneOff } from './one-off-section'
import { BookingRow, type BookingRowData } from './booking-row'

const STATUSES: (BookingStatus | 'all')[] = ['all', 'pending', 'confirmed', 'completed', 'cancelled']

type BookingQueryRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  booked_as_pair: boolean
  duration_minutes: number
  notes: string | null
  offerings: { name: string } | null
  booking_clients: { clients: { first_name: string; last_name: string } | null }[]
}

async function BookingsBody({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: rawStatus } = await searchParams
  const status = rawStatus && STATUSES.includes(rawStatus as BookingStatus | 'all') ? rawStatus : 'all'

  const supabase = await createClient()
  let query = supabase
    .from('bookings')
    .select(`
      id, starts_at, ends_at, status, booked_as_pair, duration_minutes, notes,
      offerings ( name ),
      booking_clients ( clients ( first_name, last_name ) )
    `)
    .order('starts_at', { ascending: false })
    .limit(100)

  if (status !== 'all') query = query.eq('status', status)

  const [bookingsRes, oneOffsRes] = await Promise.all([
    query,
    supabase.from('blocked_periods').select('id, start_at, end_at, reason').gte('end_at', new Date().toISOString()).order('start_at'),
  ])
  if (bookingsRes.error) throw bookingsRes.error
  if (oneOffsRes.error) throw oneOffsRes.error

  const rows: BookingRowData[] = ((bookingsRes.data ?? []) as unknown as BookingQueryRow[]).map((b) => ({
    id: b.id,
    starts_at: b.starts_at,
    status: b.status,
    booked_as_pair: b.booked_as_pair,
    duration_minutes: b.duration_minutes,
    notes: b.notes,
    offering_name: b.offerings?.name ?? null,
    client_label: b.booking_clients
      .map((bc) => bc.clients)
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => `${c.first_name} ${c.last_name}`)
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
              <BookingRow key={b.id} booking={b} />
            ))}
          </ul>
        )}
      </section>

      <OneOffSection items={oneOffs} />
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
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/booking-options">
            <Settings2 className="h-3.5 w-3.5 mr-1.5" /> More options
          </Link>
        </Button>
      </header>
      <Suspense fallback={<BodySkeleton />}>
        <BookingsBody searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
