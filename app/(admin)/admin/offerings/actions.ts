'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { SNAPSHOT_CACHE_TAG } from '@/lib/snapshot'
import { availableStartTimesForDuration } from '@/lib/booking-time'
import { requireAdmin } from '../auth'

const OFFERINGS_PATH = '/admin/offerings'
const bookingStartTimeSchema = z.string().regex(
  /^(?:[01]\d|2[0-3]):(?:00|30)$/,
  'Start times must use 30-minute increments',
)
const moneyStringSchema = z.string().trim().regex(/^\d{1,8}(?:\.\d{1,2})?$/, 'Use a non-negative amount with at most two decimals')
const durationTermSchema = z.object({
  participant_count: z.number().int().min(1).max(100),
  duration_minutes: z.number().int().min(1).max(1440),
})

// ============================================================
// Services
// ============================================================

const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(500).nullable().or(z.literal('').transform(() => null)),
  price_amount: moneyStringSchema,
  duration_terms: z.array(durationTermSchema).min(1, 'Add at least one duration term').refine(
    (terms) => new Set(terms.map((term) => term.participant_count)).size === terms.length,
    'Each participant count may appear only once',
  ),
  service_group_id: z.string().uuid('Pick a service group'),
  is_active: z.coerce.boolean(),
  requires_all_attendees: z.coerce.boolean(),
})

export type ServiceActionState = { ok: boolean; error: string | null }
const serviceInitial = (msg: string | null): ServiceActionState => ({ ok: msg === null, error: msg })

function parseService(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    price_amount: formData.get('price_amount'),
    duration_terms: (() => {
      try { return JSON.parse(String(formData.get('duration_terms') ?? '[]')) }
      catch { return [] }
    })(),
    service_group_id: formData.get('service_group_id'),
    is_active: formData.get('is_active') === 'on',
    requires_all_attendees: formData.get('requires_all_attendees') === 'on',
  })
}

export async function createService(_prev: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const parsed = parseService(formData)
  if (!parsed.success) return serviceInitial(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { supabase } = await requireAdmin()
  const { duration_terms, ...service } = parsed.data
  if (!duration_terms.some((term) => term.participant_count === 1)) {
    return serviceInitial('A duration term for 1 participant is required')
  }
  const { data, error } = await supabase
    .from('services')
    .insert(service)
    .select('id')
    .single()
  if (error || !data) return serviceInitial(error?.message ?? 'Insert failed')
  const termsError = await syncDurationTerms(supabase, data.id, duration_terms)
  if (termsError) return serviceInitial(termsError)

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, error: null }
}

export async function updateService(id: string, _prev: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const parsed = parseService(formData)
  if (!parsed.success) return serviceInitial(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { supabase } = await requireAdmin()
  const { duration_terms, ...service } = parsed.data
  if (!duration_terms.some((term) => term.participant_count === 1)) {
    return serviceInitial('A duration term for 1 participant is required')
  }
  const { error } = await supabase
    .from('services')
    .update(service)
    .eq('id', id)
  if (error) return serviceInitial(error.message)
  const termsError = await syncDurationTerms(supabase, id, duration_terms)
  if (termsError) return serviceInitial(termsError)

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, error: null }
}

async function syncDurationTerms(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceId: string,
  terms: z.infer<typeof durationTermSchema>[],
) {
  const rows = terms.map((term) => ({ service_id: serviceId, ...term }))
  const { error: upsertError } = await supabase
    .from('service_duration_terms')
    .upsert(rows, { onConflict: 'service_id,participant_count' })
  if (upsertError) return upsertError.message
  const counts = terms.map((term) => term.participant_count).join(',')
  const { error: deleteError } = await supabase
    .from('service_duration_terms')
    .delete()
    .eq('service_id', serviceId)
    .not('participant_count', 'in', `(${counts})`)
  return deleteError?.message ?? null
}

export async function deleteService(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('services').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(OFFERINGS_PATH)
}

// ============================================================
// Service groups
// ============================================================

const groupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(500).nullable().or(z.literal('').transform(() => null)),
})

export type GroupActionState = { ok: boolean; error: string | null; id?: string }
const groupInitial = (msg: string | null): GroupActionState => ({ ok: msg === null, error: msg })

export async function createServiceGroup(_prev: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const parsed = groupSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
  })
  if (!parsed.success) return groupInitial(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { supabase } = await requireAdmin()
  const { data, error } = await supabase.from('service_groups').insert(parsed.data).select('id').single()
  if (error || !data) return groupInitial(error?.message ?? 'Insert failed')

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, error: null, id: data.id }
}

export async function updateServiceGroup(id: string, _prev: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const parsed = groupSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
  })
  if (!parsed.success) return groupInitial(parsed.error.issues[0]?.message ?? 'Invalid input')

  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('service_groups').update(parsed.data).eq('id', id)
  if (error) return groupInitial(error.message)

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, error: null, id }
}

export async function deleteServiceGroup(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('service_groups').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(OFFERINGS_PATH)
}

// ============================================================
// Offerings
// ============================================================

const offeringSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(500).nullable().or(z.literal('').transform(() => null)),
  price_override: moneyStringSchema.nullable(),
  buffer_minutes: z.coerce.number().int().min(0).max(240).refine((value) => value % 15 === 0, {
    message: 'Buffer time must use 15-minute increments',
  }),
  allowed_start_times: z.array(bookingStartTimeSchema).max(48).refine(
    (times) => new Set(times).size === times.length,
    'Start times must be unique',
  ),
  is_active: z.boolean(),
  service_ids: z.array(z.string().uuid()).min(1, 'Select at least one service'),
})

export type OfferingPayload = z.infer<typeof offeringSchema>
export type OfferingActionResult = { ok: true; id: string } | { ok: false; error: string }

async function syncOfferingServices(supabase: Awaited<ReturnType<typeof createClient>>, offeringId: string, serviceIds: string[]) {
  const { error: delErr } = await supabase.from('offering_services').delete().eq('offering_id', offeringId)
  if (delErr) return delErr.message
  if (serviceIds.length === 0) return null
  const rows = serviceIds.map((service_id, sort_order) => ({ offering_id: offeringId, service_id, sort_order }))
  const { error: insErr } = await supabase.from('offering_services').insert(rows)
  if (insErr) return insErr.message
  return null
}

// Minimum public duration of the offering: every member service at
// attendee count 1 (plan §9.1). Start-time restrictions are validated
// against this floor — the participation matrix can only lengthen it.
async function computeMinDuration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceIds: string[],
): Promise<{ ok: true; duration: number } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('service_duration_terms')
    .select('service_id, duration_minutes')
    .in('service_id', serviceIds)
    .eq('participant_count', 1)
  if (error) return { ok: false, error: error.message }
  if ((data ?? []).length < serviceIds.length) {
    return { ok: false, error: 'Every selected service needs a duration term for 1 participant' }
  }
  const duration = (data ?? []).reduce((acc, term) => acc + term.duration_minutes, 0)
  if (duration <= 0) return { ok: false, error: 'Selected services have no duration' }
  return { ok: true, duration }
}

async function validateStartTimes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  startTimes: string[],
  durationMinutes: number,
): Promise<string | null> {
  if (startTimes.length === 0) return null

  const { data, error } = await supabase
    .from('weekly_schedule')
    .select('is_open, start_time, end_time')
  if (error) return error.message

  const validStartTimes = new Set(availableStartTimesForDuration(data ?? [], durationMinutes))
  return startTimes.every((time) => validStartTimes.has(time))
    ? null
    : 'One or more selected start times no longer fit the global weekly schedule'
}

export async function createOffering(payload: OfferingPayload): Promise<OfferingActionResult> {
  const parsed = offeringSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { service_ids, ...rest } = parsed.data
  const { supabase } = await requireAdmin()
  const dur = await computeMinDuration(supabase, service_ids)
  if (!dur.ok) return { ok: false, error: dur.error }
  const startTimesError = await validateStartTimes(supabase, rest.allowed_start_times, dur.duration)
  if (startTimesError) return { ok: false, error: startTimesError }

  const { data, error } = await supabase
    .from('offerings')
    .insert(rest)
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'Insert failed' }

  const syncErr = await syncOfferingServices(supabase, data.id, service_ids)
  if (syncErr) return { ok: false, error: syncErr }

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, id: data.id }
}

export async function updateOffering(id: string, payload: OfferingPayload): Promise<OfferingActionResult> {
  const parsed = offeringSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { service_ids, ...rest } = parsed.data
  const { supabase } = await requireAdmin()
  const dur = await computeMinDuration(supabase, service_ids)
  if (!dur.ok) return { ok: false, error: dur.error }
  const startTimesError = await validateStartTimes(supabase, rest.allowed_start_times, dur.duration)
  if (startTimesError) return { ok: false, error: startTimesError }

  const { error } = await supabase
    .from('offerings')
    .update(rest)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  const syncErr = await syncOfferingServices(supabase, id, service_ids)
  if (syncErr) return { ok: false, error: syncErr }

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, id }
}

export async function deleteOffering(id: string): Promise<void> {
  const { supabase } = await requireAdmin()
  const { error } = await supabase.from('offerings').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(OFFERINGS_PATH)
}

// ============================================================
// Publish snapshot
// ============================================================

type SnapshotOffering = {
  id: string
  name: string
  description: string | null
  service_ids: string[]
  image_urls: string[]
}

export async function publishSnapshot(): Promise<{ ok: true; published_at: string } | { ok: false; error: string }> {
  const { supabase } = await requireAdmin()

  const [groupsRes, servicesRes, offeringsRes, offeringServicesRes, offeringImagesRes, imagesRes, userRes] = await Promise.all([
    supabase.from('service_groups').select('id, name, description').order('name'),
    supabase.from('services').select('id, name, description, service_group_id').eq('is_active', true).order('name'),
    supabase.from('offerings').select('id, name, description').eq('is_active', true).order('name'),
    supabase.from('offering_services').select('offering_id, service_id, sort_order').order('sort_order'),
    supabase.from('offering_images').select('offering_id, image_id, sort_order').order('sort_order'),
    supabase.from('images').select('id, storage_path, alt_text'),
    supabase.auth.getUser(),
  ])
  if (groupsRes.error) return { ok: false, error: groupsRes.error.message }
  if (servicesRes.error) return { ok: false, error: servicesRes.error.message }
  if (offeringsRes.error) return { ok: false, error: offeringsRes.error.message }
  if (offeringServicesRes.error) return { ok: false, error: offeringServicesRes.error.message }
  if (offeringImagesRes.error) return { ok: false, error: offeringImagesRes.error.message }
  if (imagesRes.error) return { ok: false, error: imagesRes.error.message }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const imageById = new Map((imagesRes.data ?? []).map((i) => [i.id, i]))

  const offeringsWithRelations: SnapshotOffering[] = (offeringsRes.data ?? []).map((o) => {
    const service_ids = (offeringServicesRes.data ?? [])
      .filter((os) => os.offering_id === o.id)
      .map((os) => os.service_id)
    const image_urls = (offeringImagesRes.data ?? [])
      .filter((oi) => oi.offering_id === o.id)
      .map((oi) => imageById.get(oi.image_id))
      .filter((img): img is NonNullable<typeof img> => !!img)
      .map((img) => `${supabaseUrl}/storage/v1/object/public/draping-images/${img.storage_path}`)
    return {
      id: o.id,
      name: o.name,
      description: o.description,
      service_ids,
      image_urls,
    }
  })

  const usable = offeringsWithRelations.filter((o) => o.service_ids.length > 0)

  const payload = {
    service_groups: groupsRes.data ?? [],
    services: servicesRes.data ?? [],
    offerings: usable,
    generated_at: new Date().toISOString(),
  }

  const publishedAt = new Date().toISOString()
  const { error: deactErr } = await supabase
    .from('published_snapshots')
    .update({ is_active: false })
    .eq('is_active', true)
  if (deactErr) return { ok: false, error: deactErr.message }

  const { error: insErr } = await supabase.from('published_snapshots').insert({
    payload,
    is_active: true,
    published_at: publishedAt,
    published_by: userRes.data.user?.id ?? null,
  })
  if (insErr) return { ok: false, error: insErr.message }

  revalidateTag(SNAPSHOT_CACHE_TAG, 'max')
  revalidatePath(OFFERINGS_PATH)
  return { ok: true, published_at: publishedAt }
}
