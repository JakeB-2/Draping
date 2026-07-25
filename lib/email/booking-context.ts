import { createAdminClient } from '@/lib/supabase/admin'
import { formatInTimeZone, safeTimeZone } from '@/lib/time-zone'

type BookingEmailRow = {
  id: string
  starts_at: string
  ends_at: string
  duration_minutes: number
  subtotal_amount: number
  tax_rate_percent: number
  tax_amount: number
  total_amount: number
  notes: string | null
  offerings: {
    name: string
    description: string | null
  } | null
  booking_participants: {
    participant_number: number
    display_name: string
    role: string
    clients: {
      first_name: string
      last_name: string
      email: string | null
      phone_number: string | null
    } | null
  }[]
  booking_segments: {
    sort_order: number
    kind: string
    service_name_snapshot: string | null
    duration_minutes: number
  }[]
}

export async function getBookingEmailContext(bookingId: string) {
  const supabase = createAdminClient()
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, starts_at, ends_at, duration_minutes, subtotal_amount, tax_rate_percent, tax_amount, total_amount, notes,
        offerings ( name, description ),
        booking_participants (
          participant_number, display_name, role,
          clients ( first_name, last_name, email, phone_number )
        ),
        booking_segments ( sort_order, kind, service_name_snapshot, duration_minutes )
      `)
      .eq('id', bookingId)
      .maybeSingle(),
    supabase
      .from('booking_settings')
      .select('business_name, address, contact_email, phone, timezone, currency_code, currency_locale')
      .limit(1)
      .maybeSingle(),
  ])

  if (error || !data) throw new Error(error?.message ?? 'Booking not found')

  const booking = data as unknown as BookingEmailRow
  const participants = [...booking.booking_participants]
    .sort((left, right) => left.participant_number - right.participant_number)
  const primaryParticipant = participants.find((participant) => participant.role === 'primary')
    ?? participants[0]
  const primary = primaryParticipant?.clients

  if (!primary?.email) throw new Error('The primary client has no email address')

  const timeZone = safeTimeZone(settings?.timezone)
  const segments = [...booking.booking_segments]
    .sort((left, right) => left.sort_order - right.sort_order)
  const serviceNames = segments
    .filter((segment) => segment.kind === 'service')
    .map((segment) => segment.service_name_snapshot)
    .filter((name): name is string => Boolean(name))
  const breakMinutes = segments
    .filter((segment) => segment.kind === 'break')
    .reduce((total, segment) => total + Number(segment.duration_minutes), 0)
  const additionalNames = participants
    .filter((participant) => participant !== primaryParticipant)
    .map((participant) => participant.display_name)
  const currencyLocale = settings?.currency_locale?.trim() || 'en-CA'
  const currencyCode = settings?.currency_code?.trim() || 'CAD'
  const currency = new Intl.NumberFormat(currencyLocale, { style: 'currency', currency: currencyCode })

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
      booking_price: currency.format(Number(booking.total_amount ?? 0)),
      booking_subtotal: currency.format(Number(booking.subtotal_amount ?? 0)),
      booking_tax_rate: Number(booking.tax_rate_percent ?? 0).toLocaleString('en-CA', { maximumFractionDigits: 2 }),
      booking_tax: currency.format(Number(booking.tax_amount ?? 0)),
      booking_total: currency.format(Number(booking.total_amount ?? 0)),
      booking_notes: booking.notes ?? '',
      booking_includes_break: breakMinutes > 0 ? 'Yes' : 'No',
      booking_break_minutes: breakMinutes,
      client_first_name: primary.first_name,
      client_last_name: primary.last_name,
      client_full_name: `${primary.first_name} ${primary.last_name}`,
      client_email: primary.email,
      client_phone: primary.phone_number ?? '',
      client_count: participants.length,
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
