// Shared types for the booking engine (Phase A foundation).
//
// Money values are 2-decimal strings (e.g. "380.00") produced by
// PostgreSQL — the database is the monetary authority, JavaScript
// only displays what it is given (AGENTS.md money rule).

export type ParticipantRole = 'primary' | 'additional'

export type ParticipantInput = {
  role: ParticipantRole
  /** Frozen name shown on the appointment. */
  display_name: string
  /** Required for the primary participant (the billing client). */
  client_id?: string | null
}

export type SegmentInput =
  | {
      kind: 'service'
      service_id: string
      /** Indexes into the participants array (0-based). At least one. */
      participants: number[]
      label?: string | null
    }
  | {
      kind: 'break'
      duration_minutes: number
      label?: string | null
    }

export type ManualAdjustmentInput = {
  label: string
  /** Signed decimal string, e.g. "-20.00". */
  amount: string
}

export type QuoteSegment = {
  sort_order: number
  kind: 'service' | 'break'
  service_id: string | null
  service_name_snapshot: string | null
  duration_minutes: number
  seat_price_amount: string | null
  addon_amount: string
  label: string | null
  /** Indexes into the participants array (0-based). */
  participants: number[]
}

export type QuoteAdjustment = {
  kind: 'package' | 'pair_discount' | 'manual'
  label: string
  amount: string
  percent_snapshot: number | null
}

export type Quote = {
  offering_id: string
  offering_name: string
  duration_minutes: number
  buffer_minutes: number
  base_package_amount: string
  segments: QuoteSegment[]
  adjustments: QuoteAdjustment[]
  subtotal_amount: string
  tax_rate_percent: string
  tax_amount: string
  total_amount: string
}

export type BookingEngineErrorCode =
  | 'offering_missing'
  | 'participants_invalid'
  | 'participant_cap'
  | 'primary_required'
  | 'billing_client_required'
  | 'segment_invalid'
  | 'segment_participants_required'
  | 'duration_term_missing'
  | 'no_service_segments'
  | 'adjustment_invalid'
  | 'status_invalid'
  | 'outside_schedule'
  | 'invalid_start_time'
  | 'too_soon'
  | 'too_far_ahead'
  | 'blocked'
  | 'slot_taken'
  | 'day_minutes_cap'
  | 'week_days_cap'
  | 'consecutive_days_cap'
  | 'booking_missing'
  | 'quote_changed'
  | 'unknown'

export type EngineResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: BookingEngineErrorCode; error: string }

/** Fingerprint of the quote the caller showed before submitting. */
export type QuoteFingerprint = {
  duration_minutes: number
  subtotal_amount: string
  tax_amount: string
  total_amount: string
}

export type CreateBookingInput = {
  offering_id: string
  /** ISO timestamp of the booking start. */
  starts_at: string
  participants: ParticipantInput[]
  segments: SegmentInput[]
  manual_adjustments?: ManualAdjustmentInput[]
  notes?: string | null
  status?: 'draft' | 'pending' | 'confirmed'
  is_waitlist?: boolean
  /** Admin scheduling: skip min-lead-hours / max-advance-days checks. */
  skip_lead_checks?: boolean
  /**
   * When set, the engine re-verifies this fingerprint against the
   * recomputed quote INSIDE the atomic transaction and fails with
   * 'quote_changed' (writing nothing) if the catalog moved since the
   * caller displayed it.
   */
  expected_quote?: QuoteFingerprint
}

export type ReviseBookingInput = {
  /** Omit to keep the current start time. */
  starts_at?: string
  participants: ParticipantInput[]
  segments: SegmentInput[]
  manual_adjustments?: ManualAdjustmentInput[]
  /** Omit to keep the current notes. */
  notes?: string | null
  skip_lead_checks?: boolean
}

export type BookingWriteResult = {
  booking_id: string
  quote: Quote
}

/** A contiguous stretch of bookable time on one day (plan §9.1). */
export type OpenWindow = {
  /** ISO start of the free stretch (already clipped to lead time). */
  start_iso: string
  /** ISO end of the free stretch. */
  end_iso: string
}

export type DayWindows = {
  /** Local date key (YYYY-MM-DD) in the studio timezone. */
  date: string
  windows: OpenWindow[]
}

export type WindowsResult = {
  timezone: string
  from: string
  to: string
  max_advance_date: string
  days: DayWindows[]
}

export type OfferingFit = {
  offering_id: string
  name: string
  /** All member services at attendee count 1. */
  min_duration_minutes: number
  /** All member services at the configured participant cap (or the
   *  highest count each service offers, whichever is lower). */
  max_duration_minutes: number
  fits: boolean
  /** Earliest allowed start inside the window that fits the minimum
   *  duration; null when the offering does not fit. */
  earliest_start_iso: string | null
}

export type StartsResult = {
  timezone: string
  duration_minutes: number
  buffer_minutes: number
  /** Valid ISO start times for the exact duration, grouped per day. */
  days: { date: string; start_isos: string[] }[]
}
