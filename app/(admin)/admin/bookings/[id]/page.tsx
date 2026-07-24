import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { getPublicStudioSettings } from '@/lib/public-settings'
import { formatInTimeZone } from '@/lib/time-zone'
import { StatusBadge } from '../status-badge'
import { BookingActions } from './booking-detail-client'

const fmt = (iso: string, timezone: string) =>
  formatInTimeZone(iso, timezone, { dateStyle: 'medium', timeStyle: 'short' })

const fmtFull = (iso: string, timezone: string) =>
  formatInTimeZone(iso, timezone, { dateStyle: 'full', timeStyle: 'short' })

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '—'
  const raw = String(value)
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [whole, decimals = ''] = unsigned.split('.')
  return `${negative ? '-' : ''}$${whole}.${decimals.padEnd(2, '0').slice(0, 2)}`
}

type ParticipantRow = {
  id: string
  participant_number: number
  client_id: string | null
  display_name: string
  role: 'primary' | 'additional'
}

type SegmentRow = {
  id: string
  sort_order: number
  kind: 'service' | 'break'
  service_name_snapshot: string | null
  duration_minutes: number
  addon_amount: string | number
  label: string | null
}

async function BookingDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { timezone } = await getPublicStudioSettings()
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, offering_id, offering_name_snapshot, billing_client_id, starts_at, ends_at, occupied_until,
      status, base_package_amount,
      subtotal_amount, tax_rate_percent, tax_amount, total_amount, duration_minutes,
      buffer_minutes, notes, is_waitlist, created_at, updated_at, confirmed_at, cancelled_at,
      offerings ( id, name, description )
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) notFound()

  const [participantsRes, segmentsRes, adjustmentsRes] = await Promise.all([
    supabase
      .from('booking_participants')
      .select('id, participant_number, client_id, display_name, role')
      .eq('booking_id', id)
      .order('participant_number'),
    supabase
      .from('booking_segments')
      .select('id, sort_order, kind, service_name_snapshot, duration_minutes, addon_amount, label')
      .eq('booking_id', id)
      .order('sort_order'),
    supabase
      .from('booking_adjustments')
      .select('id, kind, label, amount, percent_snapshot')
      .eq('booking_id', id)
      .order('created_at'),
  ])
  const childError = participantsRes.error ?? segmentsRes.error ?? adjustmentsRes.error
  if (childError) throw childError

  const participants = (participantsRes.data ?? []) as ParticipantRow[]
  const segments = (segmentsRes.data ?? []) as SegmentRow[]
  const hasParticipationData = participants.length > 0 && segments.length > 0
  const participantIds = participants.map((participant) => participant.id)
  const segmentIds = segments.map((segment) => segment.id)
  const [linksRes, linkedClientsRes] = await Promise.all([
    segmentIds.length
      ? supabase.from('booking_segment_participants').select('segment_id, participant_id').in('segment_id', segmentIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? supabase.from('clients').select('id, first_name, last_name, email, phone_number').in(
          'id',
          participants.map((participant) => participant.client_id).filter((clientId): clientId is string => Boolean(clientId)),
        )
      : Promise.resolve({ data: [], error: null }),
  ])
  if (linksRes.error) throw linksRes.error
  if (linkedClientsRes.error) throw linkedClientsRes.error

  const participantById = new Map(participants.map((participant) => [participant.id, participant]))
  const clientById = new Map((linkedClientsRes.data ?? []).map((client) => [client.id, client]))
  const attendeesBySegment = new Map<string, string[]>()
  for (const link of linksRes.data ?? []) {
    const participant = participantById.get(link.participant_id)
    if (!participant) continue
    const names = attendeesBySegment.get(link.segment_id) ?? []
    names.push(participant.display_name)
    attendeesBySegment.set(link.segment_id, names)
  }

  const offering = data.offerings as unknown as { id: string; name: string; description: string | null } | null
  const headline = participants.length > 0
    ? participants.map((participant) => participant.display_name).join(' & ')
    : 'Unknown client'

  const bookingStartMs = new Date(data.starts_at).getTime()
  const timeline = segments.map((segment, index) => {
    const elapsedBefore = segments
      .slice(0, index)
      .reduce((total, previous) => total + Number(previous.duration_minutes) * 60_000, 0)
    const start = bookingStartMs + elapsedBefore
    const end = start + Number(segment.duration_minutes) * 60_000
    return { segment, start: new Date(start).toISOString(), end: new Date(end).toISOString() }
  })

  return (
    <div className="space-y-6">
      <Link href="/admin/bookings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        ← Bookings
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{data.id.slice(0, 8)}</p>
            <StatusBadge status={data.status} />
            {participants.length > 1 && <span className="text-sm text-muted-foreground">· {participants.length} participants</span>}
            {data.is_waitlist && <span className="text-sm text-muted-foreground">· Waitlist</span>}
          </div>
          <h1 className="text-2xl font-light">{headline}</h1>
          <p className="text-sm text-muted-foreground">{data.offering_name_snapshot ?? offering?.name ?? 'Unknown offering'}</p>
        </div>
        {hasParticipationData && (
          <Button asChild><Link href={`/admin/bookings/${id}/edit`}><Pencil className="mr-1.5 h-4 w-4" /> Revise booking</Link></Button>
        )}
      </div>

      {!hasParticipationData && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          This booking could not be migrated to the participation model automatically (see the migration anomaly report). Booking-level totals remain available; revision is disabled until it is resolved.
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">When</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="font-medium">{fmtFull(data.starts_at, timezone)}</p>
          <p className="text-sm text-muted-foreground">
            until {fmt(data.ends_at, timezone)} · {data.duration_minutes} min
            {data.buffer_minutes > 0 && ` · ${data.buffer_minutes} min buffer`}
          </p>
        </CardContent>
      </Card>

      {hasParticipationData && (
        <Card>
          <CardHeader><CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Timeline</CardTitle></CardHeader>
          <CardContent>
            <ol className="divide-y">
              {timeline.map(({ segment, start, end }) => (
                <li key={segment.id} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr_auto] sm:gap-4">
                  <p className="text-sm text-muted-foreground">{fmt(start, timezone)}–{formatInTimeZone(end, timezone, { timeStyle: 'short' })}</p>
                  <div>
                    <p className="font-medium">{segment.kind === 'service' ? segment.service_name_snapshot : segment.label || 'Break'}</p>
                    {segment.kind === 'service' && <p className="text-xs text-muted-foreground">{(attendeesBySegment.get(segment.id) ?? []).join(', ')}</p>}
                  </div>
                  <p className="text-sm tabular-nums">{segment.duration_minutes} min</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Participants</CardTitle></CardHeader>
        <CardContent>
          {hasParticipationData ? (
            <ul className="divide-y">
              {participants.map((participant) => {
                const client = participant.client_id ? clientById.get(participant.client_id) : null
                return (
                  <li key={participant.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-medium">{participant.display_name}</p>
                    {client?.email && <p className="text-sm text-muted-foreground">{client.email}</p>}
                    {client?.phone_number && <p className="text-sm text-muted-foreground">{client.phone_number}</p>}
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{participant.role}</p>
                  </li>
                )
              })}
            </ul>
          ) : participants.length ? (
            <ul className="divide-y">
              {participants.map((participant) => (
                <li key={participant.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-medium">{participant.display_name}</p>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{participant.role}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No clients attached.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Price breakdown</CardTitle></CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            {data.base_package_amount !== null && <MoneyRow label="Base package" value={data.base_package_amount} />}
            {segments.filter((segment) => segment.kind === 'service').map((segment) => (
              <MoneyRow key={segment.id} label={`${segment.service_name_snapshot} add-on`} value={segment.addon_amount} />
            ))}
            {(adjustmentsRes.data ?? []).map((adjustment) => (
              <MoneyRow key={adjustment.id} label={adjustment.label} value={adjustment.amount} />
            ))}
            <div className="border-t pt-2"><MoneyRow label="Subtotal" value={data.subtotal_amount} /></div>
            <MoneyRow label={`Tax (${data.tax_rate_percent}%)`} value={data.tax_amount} />
            <div className="border-t pt-2 font-semibold"><MoneyRow label="Total" value={data.total_amount} /></div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Owner notes</CardTitle></CardHeader>
        <CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes || 'No notes.'}</p></CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardHeader><CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Audit</CardTitle></CardHeader>
        <CardContent>
          <dl className="text-xs font-mono space-y-1 text-muted-foreground">
            <AuditRow label="created_at" value={fmt(data.created_at, timezone)} />
            <AuditRow label="updated_at" value={fmt(data.updated_at, timezone)} />
            <AuditRow label="confirmed_at" value={data.confirmed_at ? fmt(data.confirmed_at, timezone) : '—'} />
            <AuditRow label="cancelled_at" value={data.cancelled_at ? fmt(data.cancelled_at, timezone) : '—'} />
          </dl>
        </CardContent>
      </Card>

      <BookingActions booking={{ id: data.id, status: data.status }} />
    </div>
  )
}

function MoneyRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd>{money(value)}</dd></div>
}

function AuditRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd className="text-foreground">{value}</dd></div>
}

function DetailSkeleton() {
  return <div className="space-y-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}</div>
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="max-w-3xl mx-auto">
      <Suspense fallback={<DetailSkeleton />}><BookingDetailContent params={params} /></Suspense>
    </div>
  )
}
