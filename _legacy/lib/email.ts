import { Resend } from 'resend'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)

type BookingVars = {
  client_first_name: string
  client_last_name: string
  client_email: string
  booking_date: string
  booking_time: string
  offering_name: string
  price_amount: string
  booking_id: string
}

function substitute(template: string, vars: BookingVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key as keyof BookingVars] ?? '')
}

export async function sendBookingActionEmail(
  action: string,
  bookingId: string,
): Promise<void> {
  const supabase = await createClient()

  const { data: trigger } = await supabase
    .from('booking_action_triggers')
    .select(`
      is_active, template_id,
      email_templates (
        subject, to_address, cc_address, bcc_address, body
      )
    `)
    .eq('action', action)
    .eq('is_active', true)
    .maybeSingle()

  if (!trigger?.template_id || !trigger.email_templates) return

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, starts_at, ends_at, price_amount,
      offerings ( name ),
      booking_clients (
        client_role,
        clients ( first_name, last_name, email )
      )
    `)
    .eq('id', bookingId)
    .maybeSingle()

  if (!booking) return

  type ClientRow = { client_role: string | null; clients: { first_name: string; last_name: string; email: string | null } | null }
  type OfferingRow = { name: string }
  type TemplateRow = { subject: string; to_address: string | null; cc_address: string | null; bcc_address: string | null; body: string }

  const primary = (booking.booking_clients as unknown as ClientRow[])
    ?.find((bc) => bc.client_role === 'primary')?.clients

  if (!primary) return

  const vars: BookingVars = {
    client_first_name: primary.first_name,
    client_last_name: primary.last_name,
    client_email: primary.email ?? '',
    booking_date: format(new Date(booking.starts_at as string), 'EEEE, d MMMM yyyy'),
    booking_time: `${format(new Date(booking.starts_at as string), 'h:mm a')} – ${format(new Date(booking.ends_at as string), 'h:mm a')}`,
    offering_name: (booking.offerings as unknown as OfferingRow | null)?.name ?? '',
    price_amount: `$${Number(booking.price_amount).toFixed(2)}`,
    booking_id: booking.id as string,
  }

  const t = trigger.email_templates as unknown as TemplateRow

  const to = substitute(t.to_address ?? vars.client_email, vars)
  if (!to) return

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to,
    cc: t.cc_address ? substitute(t.cc_address, vars) : undefined,
    bcc: t.bcc_address ? substitute(t.bcc_address, vars) : undefined,
    subject: substitute(t.subject, vars),
    html: substitute(t.body, vars),
  })
}
