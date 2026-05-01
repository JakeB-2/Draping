import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { StatusBadge } from '../status-badge'
import { BookingActions, NotesForm, type Booking } from './booking-detail-client'

const fmt = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

const fmtFull = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso))

async function BookingDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, offering_id, starts_at, ends_at, status, booked_as_pair, includes_break,
      price_amount, duration_minutes, notes, is_waitlist, created_at, updated_at, confirmed_at, cancelled_at,
      offerings ( id, name, description ),
      booking_clients (
        client_role,
        clients ( id, first_name, last_name, email, phone_number )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) notFound()

  const booking = data as unknown as Booking
  const primaryClient = booking.booking_clients[0]?.clients
  const headline = primaryClient
    ? booking.booking_clients.length > 1
      ? `${primaryClient.first_name} ${primaryClient.last_name} +${booking.booking_clients.length - 1}`
      : `${primaryClient.first_name} ${primaryClient.last_name}`
    : 'Unknown client'

  return (
    <div className="space-y-6">
      <Link href="/admin/bookings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        ← Bookings
      </Link>

      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{booking.id.slice(0, 8)}</p>
          <StatusBadge status={booking.status} />
          {booking.booked_as_pair && <span className="text-sm text-muted-foreground">· Pair</span>}
          {booking.is_waitlist && <span className="text-sm text-muted-foreground">· Waitlist</span>}
        </div>
        <h1 className="text-2xl font-light">{headline}</h1>
        <p className="text-sm text-muted-foreground">{booking.offerings?.name ?? 'Unknown offering'}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">When</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-medium">{fmtFull(booking.starts_at)}</p>
          <p className="text-sm text-muted-foreground">
            until {fmt(booking.ends_at)} · {booking.duration_minutes} min · ${Number(booking.price_amount).toFixed(2)}
            {booking.includes_break && ' · includes break'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Clients
          </CardTitle>
        </CardHeader>
        <CardContent>
          {booking.booking_clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clients attached.</p>
          ) : (
            <ul className="divide-y">
              {booking.booking_clients.map((bc, i) => bc.clients && (
                <li key={bc.clients.id} className={`space-y-1 ${i > 0 ? 'pt-3' : ''} ${i < booking.booking_clients.length - 1 ? 'pb-3' : ''}`}>
                  <p className="font-medium">{bc.clients.first_name} {bc.clients.last_name}</p>
                  {bc.clients.email && <p className="text-sm text-muted-foreground">{bc.clients.email}</p>}
                  {bc.clients.phone_number && <p className="text-sm text-muted-foreground">{bc.clients.phone_number}</p>}
                  {bc.client_role && <p className="text-xs text-muted-foreground uppercase tracking-wider">{bc.client_role}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Owner notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NotesForm bookingId={booking.id} initial={booking.notes ?? ''} />
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Audit</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="text-xs font-mono space-y-1 text-muted-foreground">
            <AuditRow label="created_at" value={fmt(booking.created_at)} />
            <AuditRow label="updated_at" value={fmt(booking.updated_at)} />
            <AuditRow label="confirmed_at" value={booking.confirmed_at ? fmt(booking.confirmed_at) : '—'} />
            <AuditRow label="cancelled_at" value={booking.cancelled_at ? fmt(booking.cancelled_at) : '—'} />
          </dl>
        </CardContent>
      </Card>

      <BookingActions booking={booking} />
    </div>
  )
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  )
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="max-w-3xl mx-auto">
      <Suspense fallback={<DetailSkeleton />}>
        <BookingDetailContent params={params} />
      </Suspense>
    </div>
  )
}
