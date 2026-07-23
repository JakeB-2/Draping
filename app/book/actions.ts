'use server'

import { z } from 'zod'
import {
  createBookingAtomic,
  fits,
  getQuote,
  starts,
  windows,
  type BookingEngineErrorCode,
  type OpenWindow,
  type ParticipantInput,
  type Quote,
  type SegmentInput,
} from '@/lib/booking-engine'
import { runTrigger } from '@/lib/email/triggers'
import { getActiveSnapshot } from '@/lib/snapshot'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  daysBetween,
  formatInTimeZone,
  safeTimeZone,
} from '@/lib/time-zone'
import { PUBLIC_PARTICIPANT_UI_CAP } from './flow-state'
import type {
  PrimaryDetails,
  PublicBookingCatalog,
  PublicFitsResult,
  PublicMatrixInput,
  PublicQuoteResult,
  PublicStarts,
  PublicStartsResult,
  PublicWindowsResult,
  SubmitPublicBookingInput,
  SubmitPublicBookingResult,
} from './types'

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const isoSchema = z.string().datetime({ offset: true })
const moneySchema = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/)

const matrixSchema = z.object({
  offering_id: z.string().uuid(),
  participant_count: z.number().int().min(1).max(PUBLIC_PARTICIPANT_UI_CAP),
  attendance: z.record(
    z.string().uuid(),
    z.array(z.number().int().min(0).max(PUBLIC_PARTICIPANT_UI_CAP - 1)).min(1),
  ),
})

const primarySchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required.').max(60),
  last_name: z.string().trim().min(1, 'Last name is required.').max(60),
  email: z.string().trim().email('Enter a valid email address.').max(320),
  phone: z.string().trim().max(40),
})

const submitSchema = z.object({
  matrix: matrixSchema,
  starts_at: isoSchema,
  expected_quote: z.object({
    duration_minutes: z.number().int().positive(),
    subtotal_amount: moneySchema,
    tax_amount: moneySchema,
    total_amount: moneySchema,
  }),
  primary: primarySchema,
  additional_display_name: z.string().trim().max(120).nullable(),
  notes: z.string().trim().max(2000).nullable(),
  date_range: z.object({ from: dateKeySchema, to: dateKeySchema }),
  selected_window: z.object({ start_iso: isoSchema, end_iso: isoSchema }).nullable(),
})

type LoadedMatrix = {
  participants: ParticipantInput[]
  segments: SegmentInput[]
}

type MatrixLoadResult =
  | { ok: true; data: LoadedMatrix }
  | { ok: false; code: string; error: string }

function queryFailure(code: string, error: string) {
  return { ok: false as const, code, error }
}

function validDateKey(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function validRange(from: string, to: string) {
  return validDateKey(from) && validDateKey(to) && to >= from && daysBetween(from, to) <= 92
}

function engineMessage(code: BookingEngineErrorCode, fallback: string) {
  const messages: Partial<Record<BookingEngineErrorCode, string>> = {
    offering_missing: 'This experience is no longer available.',
    participant_cap: 'This booking has more attendees than online booking currently allows.',
    participants_invalid: 'Check the attendee details and try again.',
    segment_participants_required: 'Choose at least one attendee for every service.',
    duration_term_missing: 'This attendance combination is not available for one of the services.',
    outside_schedule: 'That time is outside the studio schedule.',
    invalid_start_time: 'That start time is not offered for this experience.',
    too_soon: 'That time is too soon to book online.',
    too_far_ahead: 'That date is not open for booking yet.',
    blocked: 'That time is no longer available.',
    slot_taken: 'That time was just taken. Your selections are still here; choose a nearby time.',
    day_minutes_cap: 'The studio has reached its booking limit for that day.',
    week_days_cap: 'The studio has reached its booking limit for that week.',
    consecutive_days_cap: 'That day is no longer available.',
  }
  return messages[code] ?? fallback
}

async function publishedOfferingIds() {
  const snapshot = await getActiveSnapshot()
  return {
    snapshot,
    ids: new Set(snapshot?.offerings.map((offering) => offering.id) ?? []),
  }
}

export async function getPublicBookingCatalog(): Promise<PublicBookingCatalog> {
  const supabase = createAdminClient()
  const published = await publishedOfferingIds()
  const publishedIds = [...published.ids]
  const settingsRes = await supabase
    .from('booking_settings')
    .select('timezone, max_participants_per_booking')
    .limit(1)
    .maybeSingle()
  if (settingsRes.error) throw new Error(settingsRes.error.message)

  const timezone = safeTimeZone(settingsRes.data?.timezone)
  const participantCap = Math.max(
    1,
    Math.min(
      Number(settingsRes.data?.max_participants_per_booking ?? 2),
      PUBLIC_PARTICIPANT_UI_CAP,
    ),
  )

  if (!published.snapshot || publishedIds.length === 0) {
    return { timezone, participant_cap: participantCap, offerings: [] }
  }

  const [offeringsRes, membersRes] = await Promise.all([
    supabase
      .from('offerings')
      .select('id, name, description')
      .in('id', publishedIds)
      .eq('is_active', true),
    supabase
      .from('offering_services')
      .select('offering_id, service_id, sort_order')
      .in('offering_id', publishedIds)
      .order('sort_order'),
  ])
  const firstError = offeringsRes.error ?? membersRes.error
  if (firstError) throw new Error(firstError.message)

  const serviceIds = [...new Set((membersRes.data ?? []).map((member) => member.service_id))]
  if (serviceIds.length === 0) {
    return { timezone, participant_cap: participantCap, offerings: [] }
  }

  const [servicesRes, termsRes] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, description, is_active')
      .in('id', serviceIds)
      .eq('is_active', true),
    supabase
      .from('service_duration_terms')
      .select('service_id, participant_count')
      .in('service_id', serviceIds),
  ])
  const catalogError = servicesRes.error ?? termsRes.error
  if (catalogError) throw new Error(catalogError.message)

  const offeringById = new Map((offeringsRes.data ?? []).map((offering) => [offering.id, offering]))
  const serviceById = new Map((servicesRes.data ?? []).map((service) => [service.id, service]))
  const countsByService = new Map<string, number[]>()
  for (const term of termsRes.data ?? []) {
    const counts = countsByService.get(term.service_id) ?? []
    counts.push(Number(term.participant_count))
    countsByService.set(term.service_id, counts)
  }
  const snapshotOfferingById = new Map(
    published.snapshot.offerings.map((offering) => [offering.id, offering]),
  )

  const offerings = publishedIds.flatMap((offeringId) => {
    const offering = offeringById.get(offeringId)
    const publishedOffering = snapshotOfferingById.get(offeringId)
    if (!offering || !publishedOffering) return []

    const services = (membersRes.data ?? [])
      .filter((member) => member.offering_id === offeringId)
      .flatMap((member, index) => {
        const service = serviceById.get(member.service_id)
        if (!service) return []
        return [{
          id: service.id,
          name: service.name,
          description: service.description,
          sort_order: Number(member.sort_order ?? index),
          supported_participant_counts: [...new Set(countsByService.get(service.id) ?? [])]
            .sort((left, right) => left - right),
        }]
      })
      .sort((left, right) => left.sort_order - right.sort_order)

    if (services.length === 0) return []
    return [{
      id: offering.id,
      name: offering.name,
      description: offering.description,
      image_url: publishedOffering.image_urls[0] ?? null,
      services,
    }]
  })

  return { timezone, participant_cap: participantCap, offerings }
}

async function loadMatrix(raw: PublicMatrixInput): Promise<MatrixLoadResult> {
  const parsed = matrixSchema.safeParse(raw)
  if (!parsed.success) return queryFailure('participants_invalid', 'The attendance selection is invalid.')

  const supabase = createAdminClient()
  const [published, settingsRes, offeringRes, membersRes] = await Promise.all([
    publishedOfferingIds(),
    supabase.from('booking_settings').select('max_participants_per_booking').limit(1).maybeSingle(),
    supabase.from('offerings').select('id, is_active').eq('id', parsed.data.offering_id).maybeSingle(),
    supabase
      .from('offering_services')
      .select('service_id, sort_order')
      .eq('offering_id', parsed.data.offering_id)
      .order('sort_order'),
  ])
  const error = settingsRes.error ?? offeringRes.error ?? membersRes.error
  if (error) return queryFailure('unknown', error.message)
  if (!published.ids.has(parsed.data.offering_id) || !offeringRes.data?.is_active) {
    return queryFailure('offering_missing', 'This experience is no longer available.')
  }

  const configuredCap = Number(settingsRes.data?.max_participants_per_booking ?? 2)
  if (
    parsed.data.participant_count > configuredCap
    || parsed.data.participant_count > PUBLIC_PARTICIPANT_UI_CAP
  ) {
    return queryFailure('participant_cap', 'This booking has too many attendees.')
  }

  const memberIds = (membersRes.data ?? []).map((member) => member.service_id)
  if (memberIds.length === 0) {
    return queryFailure('offering_missing', 'This experience has no bookable services.')
  }
  if (Object.keys(parsed.data.attendance).some((serviceId) => !memberIds.includes(serviceId))) {
    return queryFailure('segment_invalid', 'The attendance selection contains an unknown service.')
  }

  const segments: SegmentInput[] = []
  for (const serviceId of memberIds) {
    const indexes = [...new Set(parsed.data.attendance[serviceId] ?? [])]
      .sort((left, right) => left - right)
    if (
      indexes.length === 0
      || indexes.some((index) => index < 0 || index >= parsed.data.participant_count)
    ) {
      return queryFailure(
        'segment_participants_required',
        'Choose at least one attendee for every service.',
      )
    }
    segments.push({ kind: 'service', service_id: serviceId, participants: indexes })
  }

  const participants: ParticipantInput[] = Array.from(
    { length: parsed.data.participant_count },
    (_, index) => ({
      role: index === 0 ? 'primary' : 'additional',
      display_name: index === 0 ? 'Primary guest' : `Additional guest ${index}`,
    }),
  )
  return { ok: true, data: { participants, segments } }
}

export async function getPublicWindows(
  from: string,
  to: string,
): Promise<PublicWindowsResult> {
  if (!validRange(from, to)) {
    return queryFailure('invalid_date_range', 'Choose a valid date range of 93 days or fewer.')
  }
  const result = await windows(from, to)
  if (!result.ok) return queryFailure(result.code, engineMessage(result.code, result.error))
  return result
}

export async function getPublicOfferingFits(
  input: { window: OpenWindow } | { start_iso: string },
): Promise<PublicFitsResult> {
  const parsed = z.union([
    z.object({
      window: z.object({ start_iso: isoSchema, end_iso: isoSchema }),
    }),
    z.object({ start_iso: isoSchema }),
  ]).safeParse(input)
  if (!parsed.success) {
    return queryFailure('invalid_start_time', 'Choose a valid time.')
  }
  if ('window' in parsed.data && parsed.data.window.end_iso <= parsed.data.window.start_iso) {
    return queryFailure('invalid_start_time', 'Choose a valid open window.')
  }
  const [result, published] = await Promise.all([
    fits(parsed.data),
    publishedOfferingIds(),
  ])
  if (!result.ok) return queryFailure(result.code, engineMessage(result.code, result.error))
  return {
    ok: true,
    data: result.data.filter((offering) => published.ids.has(offering.offering_id)),
  }
}

export async function getPublicQuote(
  matrix: PublicMatrixInput,
): Promise<PublicQuoteResult> {
  const loaded = await loadMatrix(matrix)
  if (!loaded.ok) return loaded
  const result = await getQuote(matrix.offering_id, loaded.data.participants, loaded.data.segments)
  if (!result.ok) return queryFailure(result.code, engineMessage(result.code, result.error))
  return result
}

async function loadPublicStarts(
  matrix: PublicMatrixInput,
  from: string,
  to: string,
  selectedWindow: OpenWindow | null,
  proximityIso?: string,
): Promise<PublicStartsResult> {
  if (!validRange(from, to)) {
    return queryFailure('invalid_date_range', 'Choose a valid date range of 93 days or fewer.')
  }
  const loaded = await loadMatrix(matrix)
  if (!loaded.ok) return loaded

  const result = await starts(
    matrix.offering_id,
    loaded.data.participants,
    loaded.data.segments,
    from,
    to,
  )
  if (!result.ok) return queryFailure(result.code, engineMessage(result.code, result.error))

  const allStarts = result.data.days.flatMap((day) => day.start_isos)
  let inWindow: string[] = []
  if (selectedWindow) {
    const windowStart = Date.parse(selectedWindow.start_iso)
    const windowEnd = Date.parse(selectedWindow.end_iso)
    if (Number.isFinite(windowStart) && Number.isFinite(windowEnd)) {
      inWindow = allStarts.filter((iso) => {
        const tick = Date.parse(iso)
        return tick >= windowStart && tick < windowEnd
      })
    }
  }

  const anchor = Date.parse(proximityIso ?? selectedWindow?.start_iso ?? '')
  const nearby = Number.isFinite(anchor)
    ? allStarts
      .filter((iso) => !inWindow.includes(iso))
      .sort((left, right) => Math.abs(Date.parse(left) - anchor) - Math.abs(Date.parse(right) - anchor))
      .slice(0, 8)
    : allStarts.slice(0, 8)

  const data: PublicStarts = {
    ...result.data,
    selected_window_start_isos: inWindow,
    nearby_start_isos: nearby,
  }
  return { ok: true, data }
}

export async function getPublicStarts(
  matrix: PublicMatrixInput,
  from: string,
  to: string,
  selectedWindow: OpenWindow | null = null,
): Promise<PublicStartsResult> {
  return loadPublicStarts(matrix, from, to, selectedWindow)
}

async function ensurePrimaryClient(primary: PrimaryDetails) {
  const supabase = createAdminClient()
  const email = primary.email.trim().toLowerCase()
  const existing = await supabase.from('clients').select('id').eq('email', email).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)

  if (existing.data) {
    const updated = await supabase
      .from('clients')
      .update({
        first_name: primary.first_name.trim(),
        last_name: primary.last_name.trim(),
        phone_number: primary.phone.trim() || null,
      })
      .eq('id', existing.data.id)
    if (updated.error) throw new Error(updated.error.message)
    return existing.data.id
  }

  const inserted = await supabase
    .from('clients')
    .insert({
      first_name: primary.first_name.trim(),
      last_name: primary.last_name.trim(),
      email,
      phone_number: primary.phone.trim() || null,
    })
    .select('id')
    .single()
  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message ?? 'Could not save your contact details.')
  }
  return inserted.data.id
}

function quoteMatchesExpected(
  quote: Quote,
  expected: SubmitPublicBookingInput['expected_quote'],
) {
  return quote.duration_minutes === expected.duration_minutes
    && quote.subtotal_amount === expected.subtotal_amount
    && quote.tax_amount === expected.tax_amount
    && quote.total_amount === expected.total_amount
}

function currency(amount: string) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })
    .format(Number(amount))
}

async function sendRequestedEmail(
  bookingId: string,
  quote: Quote,
  primary: PrimaryDetails,
  additionalDisplayName: string | null,
  startsAt: string,
  notes: string | null,
) {
  const supabase = createAdminClient()
  const settingsRes = await supabase
    .from('booking_settings')
    .select('business_name, address, contact_email, phone, timezone')
    .limit(1)
    .maybeSingle()
  if (settingsRes.error) throw new Error(settingsRes.error.message)
  const settings = settingsRes.data
  const timezone = safeTimeZone(settings?.timezone)
  const endsAt = new Date(Date.parse(startsAt) + quote.duration_minutes * 60_000).toISOString()
  const serviceNames = quote.segments
    .filter((segment) => segment.kind === 'service')
    .map((segment) => segment.service_name_snapshot)
    .filter((name): name is string => Boolean(name))

  await runTrigger('booking.requested', {
    booking_id: bookingId,
    booking_reference: bookingId,
    booking_date: formatInTimeZone(startsAt, timezone, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
    booking_start_time: formatInTimeZone(startsAt, timezone, {
      hour: 'numeric', minute: '2-digit',
    }),
    booking_end_time: formatInTimeZone(endsAt, timezone, {
      hour: 'numeric', minute: '2-digit',
    }),
    booking_duration_minutes: quote.duration_minutes,
    booking_price: currency(quote.total_amount),
    booking_subtotal: currency(quote.subtotal_amount),
    booking_tax_rate: quote.tax_rate_percent,
    booking_tax: currency(quote.tax_amount),
    booking_total: currency(quote.total_amount),
    booking_notes: notes ?? '',
    booking_includes_break: 'No',
    booking_break_minutes: 0,
    client_first_name: primary.first_name.trim(),
    client_last_name: primary.last_name.trim(),
    client_full_name: `${primary.first_name.trim()} ${primary.last_name.trim()}`,
    client_email: primary.email.trim().toLowerCase(),
    client_phone: primary.phone.trim(),
    client_count: additionalDisplayName ? 2 : 1,
    additional_client_names: additionalDisplayName ?? '',
    offering_name: quote.offering_name,
    offering_description: '',
    service_names: serviceNames.join(', '),
    business_name: settings?.business_name ?? 'DNA My Colours',
    business_address: settings?.address ?? '',
    business_email: settings?.contact_email ?? '',
    business_phone: settings?.phone ?? '',
    business_timezone: timezone,
  }, primary.email.trim().toLowerCase())
}

export async function submitPublicBooking(
  input: SubmitPublicBookingInput,
): Promise<SubmitPublicBookingResult> {
  const parsed = submitSchema.safeParse(input)
  if (!parsed.success) {
    return queryFailure(
      'validation',
      parsed.error.issues[0]?.message ?? 'Check your details and try again.',
    )
  }
  if (!validRange(parsed.data.date_range.from, parsed.data.date_range.to)) {
    return queryFailure('invalid_date_range', 'Choose a valid booking date range.')
  }
  if (
    parsed.data.matrix.participant_count > 1
    && !parsed.data.additional_display_name
  ) {
    return queryFailure('validation', 'Enter the additional attendee\'s name.')
  }

  const loaded = await loadMatrix(parsed.data.matrix)
  if (!loaded.ok) return loaded

  const refreshedQuote = await getQuote(
    parsed.data.matrix.offering_id,
    loaded.data.participants,
    loaded.data.segments,
  )
  if (!refreshedQuote.ok) {
    return queryFailure(
      refreshedQuote.code,
      engineMessage(refreshedQuote.code, refreshedQuote.error),
    )
  }
  if (!quoteMatchesExpected(refreshedQuote.data, parsed.data.expected_quote)) {
    return {
      ok: false,
      code: 'quote_changed',
      error: 'The timing or price changed while you were reviewing. We refreshed the quote; please check it once more.',
      quote: refreshedQuote.data,
    }
  }

  let clientId: string
  try {
    clientId = await ensurePrimaryClient(parsed.data.primary)
  } catch (error) {
    return queryFailure(
      'client_error',
      error instanceof Error ? error.message : 'Could not save your contact details.',
    )
  }

  const participants: ParticipantInput[] = loaded.data.participants.map((participant, index) => ({
    ...participant,
    display_name: index === 0
      ? `${parsed.data.primary.first_name} ${parsed.data.primary.last_name}`.trim()
      : parsed.data.additional_display_name ?? 'Additional guest',
    client_id: index === 0 ? clientId : null,
  }))
  const created = await createBookingAtomic({
    offering_id: parsed.data.matrix.offering_id,
    starts_at: parsed.data.starts_at,
    participants,
    segments: loaded.data.segments,
    notes: parsed.data.notes,
    status: 'pending',
    is_waitlist: false,
    // Re-verified inside the atomic transaction: closes the race where
    // the catalog changes between the pre-check above and the write.
    expected_quote: parsed.data.expected_quote,
  })

  if (!created.ok && created.code === 'quote_changed') {
    const refreshed = await getQuote(
      parsed.data.matrix.offering_id,
      loaded.data.participants,
      loaded.data.segments,
    )
    return {
      ok: false,
      code: 'quote_changed',
      error: 'The timing or price changed while you were reviewing. We refreshed the quote; please check it once more.',
      quote: refreshed.ok ? refreshed.data : undefined,
    }
  }

  if (!created.ok) {
    const alternativesResult = await loadPublicStarts(
      parsed.data.matrix,
      parsed.data.date_range.from,
      parsed.data.date_range.to,
      parsed.data.selected_window,
      parsed.data.starts_at,
    )
    const alternatives = alternativesResult.ok
      ? [
          ...alternativesResult.data.selected_window_start_isos,
          ...alternativesResult.data.nearby_start_isos,
        ].filter((iso) => iso !== parsed.data.starts_at).slice(0, 8)
      : []
    return {
      ok: false,
      code: created.code,
      error: engineMessage(created.code, created.error),
      alternatives,
      timezone: alternativesResult.ok ? alternativesResult.data.timezone : undefined,
    }
  }

  try {
    await sendRequestedEmail(
      created.data.booking_id,
      created.data.quote,
      parsed.data.primary,
      parsed.data.additional_display_name,
      parsed.data.starts_at,
      parsed.data.notes,
    )
  } catch (error) {
    console.error('Booking request saved, but its request email failed:', error)
    return {
      ok: true,
      booking_id: created.data.booking_id,
      email_warning: 'Your request was saved, but the receipt email could not be sent. It remains available for review.',
    }
  }

  return { ok: true, booking_id: created.data.booking_id }
}
