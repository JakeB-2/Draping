import type {
  ManualAdjustmentInput,
  ParticipantInput,
  Quote,
  SegmentInput,
} from '@/lib/booking-engine'

export type AdminClientOption = {
  id: string
  display_name: string
  email: string | null
  phone_number: string | null
}

export type AdminServiceOption = {
  id: string
  name: string
  sort_order: number
  duration_terms: { participant_count: number; duration_minutes: number }[]
}

export type AdminOfferingOption = {
  id: string
  name: string
  is_active: boolean
  services: AdminServiceOption[]
}

export type EditableSegment = SegmentInput & { editor_id: string }

export type BookingEditorInitial = {
  booking_id?: string
  offering_id: string
  starts_at: string
  participants: ParticipantInput[]
  segments: EditableSegment[]
  manual_adjustments: ManualAdjustmentInput[]
  notes: string
}

export type BookingEditorProps = {
  mode: 'create' | 'revise'
  clients: AdminClientOption[]
  offerings: AdminOfferingOption[]
  maxParticipants: number
  initial?: BookingEditorInitial
}

export type AdminQuoteState =
  | { ok: true; data: Quote }
  | { ok: false; code: string; error: string }

