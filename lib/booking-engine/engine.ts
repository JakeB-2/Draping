// Server-only wrappers over the booking-engine database functions.
//
// The plpgsql functions in supabase/migrations/011_participation_redesign.sql
// are the single authority for money and duration math (plan §5/§6) and for
// the atomic create/revise transaction (§4.4). These wrappers only shape
// inputs, forward the RPC, and translate failures into typed results —
// they never compute anything monetary.

import { createAdminClient } from '../supabase/admin.ts'
import type {
  BookingEngineErrorCode,
  BookingWriteResult,
  CreateBookingInput,
  EngineResult,
  ManualAdjustmentInput,
  ParticipantInput,
  Quote,
  ReviseBookingInput,
  SegmentInput,
} from './types.ts'

const KNOWN_CODES: ReadonlySet<string> = new Set<BookingEngineErrorCode>([
  'offering_missing', 'participants_invalid', 'participant_cap',
  'primary_required', 'billing_client_required', 'segment_invalid',
  'segment_participants_required', 'duration_term_missing',
  'no_service_segments', 'adjustment_invalid', 'status_invalid',
  'outside_schedule', 'invalid_start_time', 'too_soon', 'too_far_ahead',
  'blocked', 'slot_taken', 'day_minutes_cap', 'week_days_cap',
  'consecutive_days_cap', 'booking_missing', 'quote_changed',
])

type RpcError = { message: string; hint?: string | null; details?: string | null }

function toFailure(error: RpcError): { ok: false; code: BookingEngineErrorCode; error: string } {
  const hint = error.hint ?? ''
  const code: BookingEngineErrorCode = KNOWN_CODES.has(hint)
    ? (hint as BookingEngineErrorCode)
    : hint === '' && /exclusion|bookings_no_overlap/i.test(error.message)
      ? 'slot_taken'
      : 'unknown'
  return { ok: false, code, error: error.message }
}

function participantsPayload(participants: ParticipantInput[]) {
  return participants.map((p) => ({
    role: p.role,
    display_name: p.display_name,
    client_id: p.client_id ?? null,
  }))
}

function segmentsPayload(segments: SegmentInput[]) {
  return segments.map((segment) =>
    segment.kind === 'service'
      ? {
          kind: 'service',
          service_id: segment.service_id,
          participants: segment.participants,
          label: segment.label ?? null,
        }
      : {
          kind: 'break',
          duration_minutes: segment.duration_minutes,
          label: segment.label ?? null,
        },
  )
}

/**
 * Stateless price + duration quote (plan §9.2 `quote`). Safe to call on
 * every matrix change; nothing is reserved.
 */
export async function getQuote(
  offeringId: string,
  participants: ParticipantInput[],
  segments: SegmentInput[],
  manualAdjustments: ManualAdjustmentInput[] = [],
): Promise<EngineResult<Quote>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('booking_engine_quote', {
    p_offering_id: offeringId,
    p_participants: participantsPayload(participants),
    p_segments: segmentsPayload(segments),
    p_manual_adjustments: manualAdjustments,
  })
  if (error) return toFailure(error)
  return { ok: true, data: data as Quote }
}

/**
 * Atomic booking creation (plan §4.4/§6): one transaction that locks,
 * recomputes duration + pricing from the current catalog, re-validates
 * availability, and writes booking + participants + segments +
 * segment participants + adjustments together. On any failure nothing
 * is written. This is the ONLY legitimate write path for new bookings —
 * never insert into the bookings tables directly.
 */
export async function createBookingAtomic(
  input: CreateBookingInput,
): Promise<EngineResult<BookingWriteResult>> {
  const supabase = createAdminClient()
  const payload: Record<string, unknown> = {
    offering_id: input.offering_id,
    starts_at: input.starts_at,
    participants: participantsPayload(input.participants),
    segments: segmentsPayload(input.segments),
    manual_adjustments: input.manual_adjustments ?? [],
    notes: input.notes ?? null,
    status: input.status ?? 'pending',
    is_waitlist: input.is_waitlist ?? false,
    skip_lead_checks: input.skip_lead_checks ?? false,
  }
  if (input.expected_quote) payload.expected_quote = input.expected_quote
  const { data, error } = await supabase.rpc('booking_engine_create', { p: payload })
  if (error) return toFailure(error)
  return { ok: true, data: data as BookingWriteResult }
}

/**
 * Atomic booking revision (plan §6): full recompute from the *current*
 * catalog terms plus availability re-validation in one transaction.
 * A failed check leaves the original booking provably untouched.
 */
export async function reviseBookingAtomic(
  bookingId: string,
  input: ReviseBookingInput,
): Promise<EngineResult<BookingWriteResult>> {
  const supabase = createAdminClient()
  const payload: Record<string, unknown> = {
    participants: participantsPayload(input.participants),
    segments: segmentsPayload(input.segments),
    manual_adjustments: input.manual_adjustments ?? [],
    skip_lead_checks: input.skip_lead_checks ?? false,
  }
  if (input.starts_at !== undefined) payload.starts_at = input.starts_at
  if (input.notes !== undefined) payload.notes = input.notes

  const { data, error } = await supabase.rpc('booking_engine_revise', {
    p_booking_id: bookingId,
    p: payload,
  })
  if (error) return toFailure(error)
  return { ok: true, data: data as BookingWriteResult }
}
