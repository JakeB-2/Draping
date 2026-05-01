import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import {
  DetailScreen, DetailHeader, DetailSection, DetailField,
} from '@/components/screens/detail'
import { BookingStatusBadge } from '@/components/bookings/BookingStatusBadge'
import { BookingDetailActions } from '@/components/bookings/BookingDetailActions'

type BookingRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  booked_as_pair: boolean
  is_waitlist: boolean
  includes_break: boolean
  price_amount: number
  duration_minutes: number
  notes: string | null
  created_at: string
  offerings: { id: string; name: string; description: string | null } | null
  booking_clients: Array<{
    client_role: string | null
    clients: {
      id: string
      first_name: string
      last_name: string
      email: string | null
      phone_number: string | null
      date_of_birth: string | null
    } | null
  }>
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, starts_at, ends_at, status, booked_as_pair, is_waitlist,
      includes_break, price_amount, duration_minutes, notes, created_at,
      offerings ( id, name, description ),
      booking_clients (
        client_role,
        clients ( id, first_name, last_name, email, phone_number, date_of_birth )
      )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load booking: ${error.message}`)
  }

  if (!data) notFound()

  const booking = data as unknown as BookingRow
  const primaryClient = booking.booking_clients?.find((bc) => bc.client_role === 'primary')?.clients
  const pairClient = booking.booking_clients?.find((bc) => bc.client_role !== 'primary')?.clients

  return (
    <DetailScreen>
      <DetailHeader
        backHref="/admin/bookings"
        backLabel="All Bookings"
        title={primaryClient
          ? `${primaryClient.first_name} ${primaryClient.last_name}`
          : 'Booking'}
        subtitle={booking.offerings?.name ?? undefined}
        badge={
          <div className="flex items-center gap-2">
            <BookingStatusBadge status={booking.status} />
            {booking.is_waitlist && (
              <Badge variant="outline" className="text-xs">Waitlist</Badge>
            )}
          </div>
        }
        actions={
          <BookingDetailActions
            id={booking.id}
            status={booking.status}
            clientName={primaryClient
              ? `${primaryClient.first_name} ${primaryClient.last_name}`
              : 'this booking'}
            currentNotes={booking.notes ?? ''}
          />
        }
      />

      <DetailSection title="Appointment">
        <DetailField
          label="Date"
          value={format(new Date(booking.starts_at), 'EEEE, d MMMM yyyy')}
        />
        <DetailField
          label="Time"
          value={`${format(new Date(booking.starts_at), 'h:mm a')} – ${format(new Date(booking.ends_at), 'h:mm a')}`}
        />
        <DetailField label="Duration" value={`${booking.duration_minutes} min`} />
        <DetailField label="Price" value={`$${Number(booking.price_amount).toFixed(2)}`} />
        {booking.includes_break && (
          <DetailField label="Break" value="Included" />
        )}
        {booking.booked_as_pair && (
          <DetailField label="Pair booking" value="Yes" />
        )}
        {booking.is_waitlist && (
          <DetailField label="Waitlist" value="Yes — pending another booking's confirmation" />
        )}
      </DetailSection>

      {booking.offerings && (
        <DetailSection title="Offering">
          <DetailField label="Name" value={booking.offerings.name} />
          {booking.offerings.description && (
            <DetailField label="Description" value={booking.offerings.description} />
          )}
        </DetailSection>
      )}

      {primaryClient && (
        <DetailSection title="Primary Client">
          <DetailField
            label="Name"
            value={`${primaryClient.first_name} ${primaryClient.last_name}`}
          />
          {primaryClient.email && (
            <DetailField label="Email" value={primaryClient.email} />
          )}
          {primaryClient.phone_number && (
            <DetailField label="Phone" value={primaryClient.phone_number} />
          )}
          {primaryClient.date_of_birth && (
            <DetailField
              label="Date of birth"
              value={format(new Date(primaryClient.date_of_birth), 'd MMM yyyy')}
            />
          )}
        </DetailSection>
      )}

      {pairClient && (
        <DetailSection title="Second Client">
          <DetailField
            label="Name"
            value={`${pairClient.first_name} ${pairClient.last_name}`}
          />
          {pairClient.email && (
            <DetailField label="Email" value={pairClient.email} />
          )}
          {pairClient.phone_number && (
            <DetailField label="Phone" value={pairClient.phone_number} />
          )}
        </DetailSection>
      )}

      <DetailSection title="Admin Notes">
        <DetailField
          label="Notes"
          value={booking.notes || <span className="text-muted-foreground italic">None</span>}
        />
      </DetailSection>

      <DetailSection title="Metadata">
        <DetailField
          label="Requested"
          value={format(new Date(booking.created_at), 'd MMM yyyy, h:mm a')}
        />
        <DetailField label="Booking ID" value={<code className="text-xs">{booking.id}</code>} />
      </DetailSection>
    </DetailScreen>
  )
}
