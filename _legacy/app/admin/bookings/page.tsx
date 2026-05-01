import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookingStatusBadge } from '@/components/bookings/BookingStatusBadge'
import { BookingRowActions } from '@/components/bookings/BookingRowActions'
import { Alert, AlertDescription } from '@/components/ui/alert'

type BookingRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  booked_as_pair: boolean
  is_waitlist?: boolean
  price_amount: number
  duration_minutes: number
  offerings: { name: string } | null
  booking_clients: Array<{
    client_role: string | null
    clients: { first_name: string; last_name: string; email: string | null } | null
  }>
}

export default async function BookingsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, starts_at, ends_at, status, booked_as_pair, price_amount, duration_minutes,
      offerings ( name ),
      booking_clients (
        client_role,
        clients ( first_name, last_name, email )
      )
    `)
    .order('starts_at', { ascending: false })

  const bookings = (data ?? []) as unknown as BookingRow[]

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Failed to load bookings: {error.message}</AlertDescription>
        </Alert>
      )}

      {!error && !bookings.length ? (
        <p className="text-muted-foreground text-sm">No bookings yet.</p>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => {
            const primaryClient = b.booking_clients?.find((bc) => bc.client_role === 'primary')
            const client = primaryClient?.clients

            return (
              <div key={b.id} className="rounded-lg border bg-card">
                {/* Clickable main area */}
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="block px-4 pt-4 pb-3 hover:bg-muted/40 transition-colors rounded-t-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {client ? `${client.first_name} ${client.last_name}` : 'Unknown client'}
                        {b.booked_as_pair && (
                          <span className="text-muted-foreground text-xs ml-2">(pair)</span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {b.offerings?.name ?? 'Unknown offering'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {format(new Date(b.starts_at), 'EEE d MMM yyyy, h:mm a')}
                        {' · '}
                        {b.duration_minutes} min
                        {' · '}
                        ${Number(b.price_amount).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {b.is_waitlist && (
                        <Badge variant="outline" className="text-xs">Waitlist</Badge>
                      )}
                      <BookingStatusBadge status={b.status} />
                    </div>
                  </div>
                </Link>

                {/* Inline action buttons */}
                <div className="px-4 pb-3 flex items-center gap-2 border-t pt-2">
                  <BookingRowActions
                    id={b.id}
                    status={b.status}
                    clientName={client ? `${client.first_name} ${client.last_name}` : 'this booking'}
                  />
                  <Button asChild variant="ghost" size="sm" className="ml-auto text-xs">
                    <Link href={`/admin/bookings/${b.id}`}>View details →</Link>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
