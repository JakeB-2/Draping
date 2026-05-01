import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createAdminClient } from '@/lib/supabase/admin'

const fmtFull = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso))

type Booking = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  duration_minutes: number
  booked_as_pair: boolean
  offerings: { name: string; description: string | null } | null
  booking_clients: {
    client_role: string | null
    clients: { first_name: string; last_name: string; email: string | null } | null
  }[]
}

async function ConfirmationContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, starts_at, ends_at, status, duration_minutes, booked_as_pair,
      offerings ( name, description ),
      booking_clients ( client_role, clients ( first_name, last_name, email ) )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) notFound()

  const booking = data as unknown as Booking
  const primaryClient = booking.booking_clients.find((bc) => bc.client_role === 'primary')?.clients
    ?? booking.booking_clients[0]?.clients

  return (
    <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">All set</p>
        <h1 className="text-3xl font-light">
          Thank you{primaryClient ? `, ${primaryClient.first_name}` : ''}.
        </h1>
        <p className="text-muted-foreground">
          Your booking request is in. The owner will confirm by email.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Reference
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="font-mono text-sm">{booking.id}</p>
          <Badge variant={booking.status === 'pending' ? 'secondary' : 'default'}>
            {booking.status}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
            Session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="font-medium">{booking.offerings?.name ?? 'Unknown offering'}</p>
          <p className="text-sm">{fmtFull(booking.starts_at)}</p>
          <p className="text-sm text-muted-foreground">
            {booking.duration_minutes} min{booking.booked_as_pair && ' · Pair booking'}
          </p>
        </CardContent>
      </Card>

      {booking.booking_clients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
              Who&rsquo;s coming
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {booking.booking_clients.map((bc, i) => bc.clients && (
                <li key={i}>
                  {bc.clients.first_name} {bc.clients.last_name}
                  {bc.clients.email && <span className="text-muted-foreground"> · {bc.clients.email}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        Save this page or screenshot it for your records. Prep documents will arrive
        with the confirmation email.
      </p>

      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}

function ConfirmationSkeleton() {
  return (
    <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}

export default function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ConfirmationSkeleton />}>
      <ConfirmationContent params={params} />
    </Suspense>
  )
}
