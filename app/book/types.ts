import type {
  OfferingFit,
  OpenWindow,
  Quote,
  StartsResult,
  WindowsResult,
} from '@/lib/booking-engine'

export type EntryMode = 'time-first' | 'service-first'

export type PublicBookingService = {
  id: string
  name: string
  description: string | null
  sort_order: number
  supported_participant_counts: number[]
}

export type PublicBookingOffering = {
  id: string
  name: string
  description: string | null
  image_url: string | null
  services: PublicBookingService[]
}

export type PublicBookingCatalog = {
  timezone: string
  participant_cap: number
  quote_notice_text: string | null
  offerings: PublicBookingOffering[]
}

export type PublicMatrixInput = {
  offering_id: string
  participant_count: number
  /** Service id -> zero-based participant indexes. */
  attendance: Record<string, number[]>
}

export type PrimaryDetails = {
  first_name: string
  last_name: string
  email: string
  phone: string
}

export type PublicFlowState = {
  mode: EntryMode | null
  date_range: { from: string; to: string }
  selected_window: OpenWindow | null
  offering_id: string | null
  participant_count: number
  attendance: Record<string, number[]>
  selected_start_iso: string | null
  primary: PrimaryDetails
  additional_display_name: string
  notes: string
}

export type PublicStarts = StartsResult & {
  /** Exact starts returned by Phase A that fall in the selected open window. */
  selected_window_start_isos: string[]
  /** Phase A starts ordered by proximity to the selected window. */
  nearby_start_isos: string[]
}

export type PublicQueryFailure = {
  ok: false
  code: string
  error: string
}

export type PublicWindowsResult =
  | { ok: true; data: WindowsResult }
  | PublicQueryFailure

export type PublicFitsResult =
  | { ok: true; data: OfferingFit[] }
  | PublicQueryFailure

export type PublicQuoteResult =
  | { ok: true; data: Quote }
  | PublicQueryFailure

export type PublicStartsResult =
  | { ok: true; data: PublicStarts }
  | PublicQueryFailure

export type SubmitPublicBookingInput = {
  matrix: PublicMatrixInput
  starts_at: string
  expected_quote: {
    duration_minutes: number
    subtotal_amount: string
    tax_amount: string
    total_amount: string
  }
  primary: PrimaryDetails
  additional_display_name: string | null
  notes: string | null
  date_range: { from: string; to: string }
  selected_window: OpenWindow | null
}

export type SubmitPublicBookingResult =
  | { ok: true; booking_id: string; email_warning?: string }
  | {
      ok: false
      code: string
      error: string
      quote?: Quote
      alternatives?: string[]
      timezone?: string
    }

