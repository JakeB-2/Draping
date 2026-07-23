'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  createBookingAtomic,
  getQuote,
  reviseBookingAtomic,
  starts,
  type CreateBookingInput,
  type EngineResult,
  type Quote,
  type ReviseBookingInput,
  type StartsResult,
} from '@/lib/booking-engine'
import { requireAdmin } from '../auth'

const participantSchema = z.object({
  role: z.enum(['primary', 'additional']),
  display_name: z.string().trim().min(1).max(200),
  client_id: z.string().uuid().nullable().optional(),
})

const segmentSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('service'),
    service_id: z.string().uuid(),
    participants: z.array(z.number().int().min(0)).min(1),
    label: z.string().trim().max(200).nullable().optional(),
  }),
  z.object({
    kind: z.literal('break'),
    duration_minutes: z.number().int().min(1).max(1440),
    label: z.string().trim().max(200).nullable().optional(),
  }),
])

const adjustmentSchema = z.object({
  label: z.string().trim().min(1).max(200),
  amount: z.string().trim().regex(/^-?\d{1,8}(?:\.\d{1,2})?$/, 'Use a monetary amount with at most two decimals'),
})

const configurationSchema = z.object({
  offering_id: z.string().uuid(),
  participants: z.array(participantSchema).min(1),
  segments: z.array(segmentSchema).min(1),
  manual_adjustments: z.array(adjustmentSchema).default([]),
})

const createSchema = configurationSchema.extend({
  starts_at: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable().optional(),
})

const reviseSchema = configurationSchema.omit({ offering_id: true }).extend({
  starts_at: z.string().datetime({ offset: true }),
  notes: z.string().trim().max(2000).nullable().optional(),
})

type Configuration = z.infer<typeof configurationSchema>

function invalid<T>(message: string): EngineResult<T> {
  return { ok: false, code: 'unknown', error: message }
}

async function validateOfferingServices(configuration: Configuration): Promise<string | null> {
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from('offering_services')
    .select('service_id')
    .eq('offering_id', configuration.offering_id)
  if (error) return error.message

  const members = new Set((data ?? []).map((row) => row.service_id))
  const invalidService = configuration.segments.find(
    (segment) => segment.kind === 'service' && !members.has(segment.service_id),
  )
  return invalidService ? 'Every service segment must belong to the selected offering.' : null
}

export async function quoteAdminBooking(input: unknown): Promise<EngineResult<Quote>> {
  await requireAdmin()
  const parsed = configurationSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid booking configuration')

  const membershipError = await validateOfferingServices(parsed.data)
  if (membershipError) return invalid(membershipError)
  return getQuote(
    parsed.data.offering_id,
    parsed.data.participants,
    parsed.data.segments,
    parsed.data.manual_adjustments,
  )
}

export async function startsForAdminBooking(
  input: unknown,
  fromDate: string,
  toDate: string,
  excludeBookingId?: string,
): Promise<EngineResult<StartsResult>> {
  await requireAdmin()
  const parsed = configurationSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid booking configuration')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return invalid('Choose a valid date range.')
  }

  const membershipError = await validateOfferingServices(parsed.data)
  if (membershipError) return invalid(membershipError)
  return starts(
    parsed.data.offering_id,
    parsed.data.participants,
    parsed.data.segments,
    fromDate,
    toDate,
    { skipLeadChecks: true, excludeBookingId },
  )
}

export async function createAdminBooking(input: unknown) {
  await requireAdmin()
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return invalid<{ booking_id: string; quote: Quote }>(parsed.error.issues[0]?.message ?? 'Invalid booking')

  const membershipError = await validateOfferingServices(parsed.data)
  if (membershipError) return invalid<{ booking_id: string; quote: Quote }>(membershipError)
  const payload: CreateBookingInput = {
    ...parsed.data,
    status: 'pending',
    skip_lead_checks: true,
  }
  const result = await createBookingAtomic(payload)
  if (result.ok) revalidatePath('/admin/bookings')
  return result
}

export async function reviseAdminBooking(bookingId: string, input: unknown) {
  await requireAdmin()
  const id = z.string().uuid().safeParse(bookingId)
  const parsed = reviseSchema.safeParse(input)
  if (!id.success || !parsed.success) {
    return invalid<{ booking_id: string; quote: Quote }>(
      parsed.success ? 'Invalid booking id' : parsed.error.issues[0]?.message ?? 'Invalid booking',
    )
  }

  const { supabase } = await requireAdmin()
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('offering_id')
    .eq('id', bookingId)
    .maybeSingle()
  if (error || !booking?.offering_id) {
    return invalid<{ booking_id: string; quote: Quote }>(error?.message ?? 'This booking cannot be revised before legacy backfill.')
  }
  const membershipError = await validateOfferingServices({ ...parsed.data, offering_id: booking.offering_id })
  if (membershipError) return invalid<{ booking_id: string; quote: Quote }>(membershipError)

  const payload: ReviseBookingInput = {
    starts_at: parsed.data.starts_at,
    participants: parsed.data.participants,
    segments: parsed.data.segments,
    manual_adjustments: parsed.data.manual_adjustments,
    notes: parsed.data.notes,
    skip_lead_checks: true,
  }
  const result = await reviseBookingAtomic(bookingId, payload)
  if (result.ok) {
    revalidatePath('/admin/bookings')
    revalidatePath(`/admin/bookings/${bookingId}`)
  }
  return result
}

