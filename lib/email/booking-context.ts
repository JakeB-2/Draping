import { createAdminClient } from '@/lib/supabase/admin'
import { formatInTimeZone, safeTimeZone } from '@/lib/time-zone'

type BookingEmailRow = {
  id: string
  starts_at: string
  ends_at: string
  duration_minutes: number
  price_amount: number
  subtotal_amount: number
  tax_rate_percent: number
  tax_amount: number
  total_amount: number
  notes: string | null
  includes_break: boolean
  offerings: {
    name: string
    description: string | null
    break_minutes: number
    offering_services: { services: { name: string } | null }[]
  } | null
  booking_clients: {
    client_role: string | null
    clients: {
      first_name: string
      last_name: string
      email: string | null
      phone_number: string | null
    } | null
  }[]
}

export async function getBookingEmailContext(bookingId: string) {
  const supabase = createAdminClient()
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, starts_at, ends_at, duration_minutes, price_amount, subtotal_amount, tax_rate_percent, tax_amount, total_amount, notes, includes_break,
        offerings (
          name, description, break_minutes,
          offering_services ( services ( name ) )
        ),
        booking_clients (
          client_role,
          clients ( first_name, last_name, email, phone_number )
        )
      `)
      .eq('id', bookingId)
      .maybeSingle(),
    supabase
      .from('booking_settings')
      .select('business_name, address, contact_email, phone, timezone')
      .limit(1)
      .maybeSingle(),
  ])

  if (error || !data) throw new Error(error?.message ?? 'Booking not found')

  const booking = data as unknown as BookingEmailRow
  const clients = booking.booking_clients
    .map((entry) => entry.clients)
    .filter((client): client is NonNullable<typeof client> => Boolean(client))
  const primary = booking.booking_clients.find((entry) => entry.client_role === 'primary')?.clients
    ?? clients[0]

  if (!primary?.email) throw new Error('The primary client has no email address')

  const timeZone = safeTimeZone(settings?.timezone)
  const serviceNames = booking.offerings?.offering_services
    .map((entry) => entry.services?.name)
    .filter((name): name is string => Boolean(name)) ?? []
  const additionalNames = clients.slice(1).map((client) => `${client.first_name} ${client.last_name}`)
  const currency = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

  return {
    recipient: primary.email,
    variables: {
      booking_id: booking.id,
      booking_reference: booking.id,
      booking_date: formatInTimeZone(booking.starts_at, timeZone, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
      booking_start_time: formatInTimeZone(booking.starts_at, timeZone, {
        hour: 'numeric', minute: '2-digit',
      }),
      booking_end_time: formatInTimeZone(booking.ends_at, timeZone, {
        hour: 'numeric', minute: '2-digit',
      }),
      booking_duration_minutes: booking.duration_minutes,
      booking_price: currency.format(Number(booking.total_amount ?? booking.price_amount)),
      booking_subtotal: currency.format(Number(booking.subtotal_amount ?? booking.price_amount)),
      booking_tax_rate: Number(booking.tax_rate_percent ?? 0).toLocaleString('en-CA', { maximumFractionDigits: 2 }),
      booking_tax: currency.format(Number(booking.tax_amount ?? 0)),
      booking_total: currency.format(Number(booking.total_amount ?? booking.price_amount)),
      booking_notes: booking.notes ?? '',
      booking_includes_break: booking.includes_break ? 'Yes' : 'No',
      booking_break_minutes: booking.offerings?.break_minutes ?? 0,
      client_first_name: primary.first_name,
      client_last_name: primary.last_name,
      client_full_name: `${primary.first_name} ${primary.last_name}`,
      client_email: primary.email,
      client_phone: primary.phone_number ?? '',
      client_count: clients.length,
      additional_client_names: additionalNames.join(', '),
      offering_name: booking.offerings?.name ?? 'Colour analysis appointment',
      offering_description: booking.offerings?.description ?? '',
      service_names: serviceNames.join(', '),
      business_name: settings?.business_name ?? 'DNA My Colours',
      business_address: settings?.address ?? '',
      business_email: settings?.contact_email ?? '',
      business_phone: settings?.phone ?? '',
      business_timezone: timeZone,
    },
  }
}
