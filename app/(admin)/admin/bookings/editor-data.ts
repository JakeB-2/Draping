import 'server-only'

import { requireAdmin } from '../auth'
import { safeTimeZone } from '@/lib/time-zone'
import type {
  AdminClientOption,
  AdminOfferingOption,
  BookingEditorInitial,
} from './booking-editor-types'

export async function loadEditorOptions(includeOfferingId?: string): Promise<{
  clients: AdminClientOption[]
  offerings: AdminOfferingOption[]
  maxParticipants: number
  timezone: string
}> {
  const { supabase } = await requireAdmin()
  const [clientsRes, offeringsRes, membersRes, servicesRes, termsRes, settingsRes] = await Promise.all([
    supabase.from('clients').select('id, first_name, last_name, email, phone_number').order('last_name').order('first_name'),
    supabase.from('offerings').select('id, name, is_active').order('name'),
    supabase.from('offering_services').select('offering_id, service_id, sort_order').order('sort_order'),
    supabase.from('services').select('id, name'),
    supabase.from('service_duration_terms').select('service_id, participant_count, duration_minutes').order('participant_count'),
    supabase.from('booking_settings').select('max_participants_per_booking, timezone').limit(1).maybeSingle(),
  ])
  const error = clientsRes.error ?? offeringsRes.error ?? membersRes.error ?? servicesRes.error ?? termsRes.error ?? settingsRes.error
  if (error) throw error

  const serviceById = new Map((servicesRes.data ?? []).map((service) => [service.id, service]))
  const termsByService = new Map<string, { participant_count: number; duration_minutes: number }[]>()
  for (const term of termsRes.data ?? []) {
    const terms = termsByService.get(term.service_id) ?? []
    terms.push({
      participant_count: Number(term.participant_count),
      duration_minutes: Number(term.duration_minutes),
    })
    termsByService.set(term.service_id, terms)
  }

  const offerings: AdminOfferingOption[] = (offeringsRes.data ?? [])
    .filter((offering) => offering.is_active || offering.id === includeOfferingId)
    .map((offering) => ({
      id: offering.id,
      name: offering.name,
      is_active: offering.is_active,
      services: (membersRes.data ?? [])
        .filter((member) => member.offering_id === offering.id)
        .map((member, index) => {
          const service = serviceById.get(member.service_id)
          return service
            ? {
                id: service.id,
                name: service.name,
                sort_order: Number(member.sort_order ?? index),
                duration_terms: termsByService.get(service.id) ?? [],
              }
            : null
        })
        .filter((service): service is NonNullable<typeof service> => service !== null)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))

  return {
    clients: (clientsRes.data ?? []).map((client) => ({
      id: client.id,
      display_name: `${client.first_name} ${client.last_name}`.trim(),
      email: client.email,
      phone_number: client.phone_number,
    })),
    offerings,
    maxParticipants: Number(settingsRes.data?.max_participants_per_booking ?? 2),
    timezone: safeTimeZone(settingsRes.data?.timezone),
  }
}

export async function loadBookingForEditor(bookingId: string): Promise<BookingEditorInitial | null> {
  const { supabase } = await requireAdmin()
  const [bookingRes, participantsRes, segmentsRes, adjustmentsRes] = await Promise.all([
    supabase.from('bookings').select('id, offering_id, starts_at, notes').eq('id', bookingId).maybeSingle(),
    supabase
      .from('booking_participants')
      .select('id, participant_number, client_id, display_name, role')
      .eq('booking_id', bookingId)
      .order('participant_number'),
    supabase
      .from('booking_segments')
      .select('id, sort_order, kind, service_id, duration_minutes, label')
      .eq('booking_id', bookingId)
      .order('sort_order'),
    supabase
      .from('booking_adjustments')
      .select('kind, label, amount')
      .eq('booking_id', bookingId)
      .eq('kind', 'manual')
      .order('created_at'),
  ])
  const error = bookingRes.error ?? participantsRes.error ?? segmentsRes.error ?? adjustmentsRes.error
  if (error) throw error
  if (!bookingRes.data?.offering_id || !participantsRes.data?.length || !segmentsRes.data?.length) return null

  const participantIndex = new Map((participantsRes.data ?? []).map((participant, index) => [participant.id, index]))
  const segmentIds = (segmentsRes.data ?? []).map((segment) => segment.id)
  const linksRes = segmentIds.length
    ? await supabase
        .from('booking_segment_participants')
        .select('segment_id, participant_id')
        .in('segment_id', segmentIds)
    : { data: [], error: null }
  if (linksRes.error) throw linksRes.error

  const linksBySegment = new Map<string, number[]>()
  for (const link of linksRes.data ?? []) {
    const index = participantIndex.get(link.participant_id)
    if (index === undefined) continue
    const indexes = linksBySegment.get(link.segment_id) ?? []
    indexes.push(index)
    linksBySegment.set(link.segment_id, indexes)
  }

  return {
    booking_id: bookingRes.data.id,
    offering_id: bookingRes.data.offering_id,
    starts_at: bookingRes.data.starts_at,
    participants: participantsRes.data.map((participant) => ({
      role: participant.role as 'primary' | 'additional',
      display_name: participant.display_name,
      client_id: participant.client_id,
    })),
    segments: segmentsRes.data.map((segment) =>
      segment.kind === 'service' && segment.service_id
        ? {
            editor_id: segment.id,
            kind: 'service' as const,
            service_id: segment.service_id,
            participants: (linksBySegment.get(segment.id) ?? []).sort((a, b) => a - b),
            label: segment.label,
          }
        : {
            editor_id: segment.id,
            kind: 'break' as const,
            duration_minutes: Number(segment.duration_minutes),
            label: segment.label,
          },
    ),
    manual_adjustments: (adjustmentsRes.data ?? []).map((adjustment) => ({
      label: adjustment.label,
      amount: String(adjustment.amount),
    })),
    notes: bookingRes.data.notes ?? '',
  }
}

