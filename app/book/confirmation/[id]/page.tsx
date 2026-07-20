import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CalendarDays, Check, Clock3, Mail, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicStudioSettings } from '@/lib/public-settings'
import { formatInTimeZone } from '@/lib/time-zone'

type Booking = {
  id: string
  starts_at: string
  ends_at: string
  status: string
  duration_minutes: number
  price_amount: number
  subtotal_amount: number
  tax_rate_percent: number
  tax_amount: number
  total_amount: number
  booked_as_pair: boolean
  offerings: { name: string; description: string | null } | null
  booking_clients: {
    client_role: string | null
    clients: { first_name: string; last_name: string; email: string | null } | null
  }[]
}

export const metadata = { title: 'Booking request received' }

async function ConfirmationContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const [{ data, error }, settings] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id, starts_at, ends_at, status, duration_minutes, price_amount, subtotal_amount, tax_rate_percent, tax_amount, total_amount, booked_as_pair,
        offerings ( name, description ),
        booking_clients ( client_role, clients ( first_name, last_name, email ) )
      `)
      .eq('id', id)
      .maybeSingle(),
    getPublicStudioSettings(),
  ])

  if (error) throw error
  if (!data) notFound()

  const booking = data as unknown as Booking
  const primary = booking.booking_clients.find((entry) => entry.client_role === 'primary')?.clients
    ?? booking.booking_clients[0]?.clients
  const currency = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })
  const subtotal = currency.format(Number(booking.subtotal_amount ?? booking.price_amount))
  const tax = currency.format(Number(booking.tax_amount ?? 0))
  const total = currency.format(Number(booking.total_amount ?? booking.price_amount))

  return (
    <main className="confirmation-page">
      <div className="confirmation-page__halo" aria-hidden="true" />
      <section className="confirmation-card">
        <div className="confirmation-card__mark"><Check aria-hidden="true" /></div>
        <p className="public-kicker">Request received</p>
        <h1>Thank you{primary ? `, ${primary.first_name}` : ''}.</h1>
        <p className="confirmation-card__intro">
          Your time is being held as a pending request. We will review the details and send a separate confirmation email when it is approved.
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
            <strong>{booking.offerings?.name ?? 'Colour analysis appointment'}</strong>
            <small>
              {booking.duration_minutes} min · Price {subtotal}
              {Number(booking.tax_amount) > 0 && ` · Tax (${Number(booking.tax_rate_percent).toLocaleString('en-CA', { maximumFractionDigits: 2 })}%) ${tax}`}
              {' · '}Total {total} CAD
            </small>
          </div>
          <div>
            <span><Mail aria-hidden="true" /> Receipt</span>
            <strong>{primary?.email ?? 'Primary client email'}</strong>
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

export default function ConfirmationPage({ params }: PageProps<'/book/confirmation/[id]'>) {
  return (
    <Suspense fallback={<ConfirmationFallback />}>
      <ConfirmationContent params={params} />
    </Suspense>
  )
}
