import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CalendarDays, Check, Clock3, Mail, Users } from 'lucide-react'
import { getPublicStudioSettings } from '@/lib/public-settings'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatInTimeZone } from '@/lib/time-zone'

type BookingRow = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  duration_minutes: number
  billing_client_id: string | null
  offering_name_snapshot: string | null
  base_package_amount: string | number | null
  subtotal_amount: string | number
  tax_rate_percent: string | number
  tax_amount: string | number
  total_amount: string | number
}

type ParticipantRow = {
  participant_number: number
  display_name: string
  role: 'primary' | 'additional'
}

export const metadata = { title: 'Booking request received' }

async function ConfirmationContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const [bookingRes, participantsRes, settings] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, starts_at, ends_at, status, duration_minutes, billing_client_id,
        offering_name_snapshot, base_package_amount, subtotal_amount,
        tax_rate_percent, tax_amount, total_amount
      `)
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('booking_participants')
      .select('participant_number, display_name, role')
      .eq('booking_id', id)
      .order('participant_number'),
    getPublicStudioSettings(),
  ])

  if (bookingRes.error) throw bookingRes.error
  if (participantsRes.error) throw participantsRes.error
  if (!bookingRes.data) notFound()

  const booking = bookingRes.data as BookingRow
  const participants = (participantsRes.data ?? []) as ParticipantRow[]
  const clientRes = booking.billing_client_id
    ? await supabase
      .from('clients')
      .select('first_name, last_name, email')
      .eq('id', booking.billing_client_id)
      .maybeSingle()
    : null
  if (clientRes?.error) throw clientRes.error

  const primaryName = participants.find((participant) => participant.role === 'primary')?.display_name
    ?? (clientRes?.data ? `${clientRes.data.first_name} ${clientRes.data.last_name}` : null)
  const primaryFirstName = clientRes?.data?.first_name ?? primaryName?.split(/\s+/)[0] ?? null
  const currency = new Intl.NumberFormat(settings.currency_locale, { style: 'currency', currency: settings.currency_code })
  const subtotal = currency.format(Number(booking.subtotal_amount))
  const tax = currency.format(Number(booking.tax_amount ?? 0))
  const total = currency.format(Number(booking.total_amount))

  return (
    <main className="confirmation-page">
      <div className="confirmation-page__halo" aria-hidden="true" />
      <section className="confirmation-card">
        <div className="confirmation-card__mark"><Check aria-hidden="true" /></div>
        <p className="public-kicker">Request received</p>
        <h1>Thank you{primaryFirstName ? `, ${primaryFirstName}` : ''}.</h1>
        <p className="confirmation-card__intro">
          Your exact time and participation details are saved as a pending request. We will review everything and send a separate confirmation email when it is approved.
        </p>

        <div className="confirmation-details">
          <div>
            <span><CalendarDays aria-hidden="true" /> Date</span>
            <strong>{formatInTimeZone(booking.starts_at, settings.timezone, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong>
          </div>
          <div>
            <span><Clock3 aria-hidden="true" /> Time</span>
            <strong>{formatInTimeZone(booking.starts_at, settings.timezone, { hour: 'numeric', minute: '2-digit' })}–{formatInTimeZone(booking.ends_at, settings.timezone, { hour: 'numeric', minute: '2-digit' })}</strong>
          </div>
          <div>
            <span><Users aria-hidden="true" /> Experience</span>
            <strong>{booking.offering_name_snapshot ?? 'Colour analysis appointment'}</strong>
            <small>
              {booking.duration_minutes} min · {participants.map((participant) => participant.display_name).join(' & ') || 'Primary attendee'}
              <br />Subtotal {subtotal}
              {Number(booking.tax_amount) > 0 && ` · Tax (${Number(booking.tax_rate_percent).toLocaleString('en-CA', { maximumFractionDigits: 2 })}%) ${tax}`}
              {' · '}Total {total} {settings.currency_code}
            </small>
          </div>
          <div>
            <span><Mail aria-hidden="true" /> Receipt</span>
            <strong>{clientRes?.data?.email ?? 'Primary client email'}</strong>
            <small>Check your junk folder if it does not arrive shortly.</small>
          </div>
        </div>

        <div className="confirmation-reference">
          <span>Request reference</span><code>{booking.id}</code>
        </div>

        <Link href="/" className="public-button public-button--ink">Return to DNA My Colours</Link>
      </section>
    </main>
  )
}

function ConfirmationFallback() {
  return (
    <main className="confirmation-page" aria-busy="true">
      <section className="confirmation-card min-h-[36rem] animate-pulse">
        <div className="h-12 w-12 rounded-full bg-black/10" />
        <div className="mt-8 h-16 w-2/3 rounded bg-black/10" />
        <div className="mt-6 h-24 rounded bg-black/5" />
        <div className="mt-10 h-48 rounded bg-black/5" />
      </section>
    </main>
  )
}

export default function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ConfirmationFallback />}>
      <ConfirmationContent params={params} />
    </Suspense>
  )
}
