import type {
  PublicBookingOffering,
  PublicFlowState,
} from './types'

export const PUBLIC_PARTICIPANT_UI_CAP = 2

export function createInitialFlowState(
  from: string,
  to: string,
): PublicFlowState {
  return {
    date_range: { from, to },
    offering_id: null,
    participant_count: 1,
    attendance: {},
    selected_start_iso: null,
    primary: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
    },
    additional_display_name: '',
    notes: '',
  }
}

export function selectOffering(
  state: PublicFlowState,
  offering: PublicBookingOffering | null,
): PublicFlowState {
  if (!offering) {
    return {
      ...state,
      offering_id: null,
      participant_count: 1,
      attendance: {},
    }
  }

  return {
    ...state,
    offering_id: offering.id,
    participant_count: 1,
    attendance: Object.fromEntries(
      offering.services.map((service) => [service.id, [0]]),
    ),
    selected_start_iso: null,
  }
}

function allIndexes(count: number) {
  return Array.from({ length: count }, (_, index) => index)
}

export function setParticipantCount(
  state: PublicFlowState,
  requestedCount: number,
  configuredCap: number,
  lockedServiceIds: readonly string[] = [],
): PublicFlowState {
  const count = Math.max(
    1,
    Math.min(requestedCount, configuredCap, PUBLIC_PARTICIPANT_UI_CAP),
  )
  const locked = new Set(lockedServiceIds)
  const attendance = Object.fromEntries(
    Object.entries(state.attendance).map(([serviceId, indexes]) => [
      serviceId,
      // A4: services that require all attendees always cover the whole party.
      locked.has(serviceId)
        ? allIndexes(count)
        : indexes.filter((index) => index < count),
    ]),
  )

  return {
    ...state,
    participant_count: count,
    attendance,
    additional_display_name: count > 1 ? state.additional_display_name : '',
    selected_start_iso: null,
  }
}

export function lockedServiceIdsFor(offering: PublicBookingOffering | null): string[] {
  return offering?.services
    .filter((service) => service.requires_all_attendees)
    .map((service) => service.id) ?? []
}

export function setServiceAttendance(
  state: PublicFlowState,
  serviceId: string,
  participantIndexes: number[],
): PublicFlowState {
  const normalized = [...new Set(participantIndexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < state.participant_count)
    .sort((left, right) => left - right)

  if (normalized.length === 0) return state

  return {
    ...state,
    attendance: { ...state.attendance, [serviceId]: normalized },
    selected_start_iso: null,
  }
}

export function toMatrixInput(state: PublicFlowState) {
  if (!state.offering_id) return null
  return {
    offering_id: state.offering_id,
    participant_count: state.participant_count,
    attendance: state.attendance,
  }
}
