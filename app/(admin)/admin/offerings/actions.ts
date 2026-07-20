'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { SNAPSHOT_CACHE_TAG } from '@/lib/snapshot'

const OFFERINGS_PATH = '/admin/offerings'
const bookingStartTimeSchema = z.string().regex(
  /^(?:[01]\d|2[0-3]):(?:00|30)$/,
  'Start times must use 30-minute increments',
)

// ============================================================
// Services
// ============================================================

const serviceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(500).nullable().or(z.literal('').transform(() => null)),
  time_requirement_minutes: z.coerce.number().int().positive('Time must be a positive number').max(1440),
  service_group_id: z.string().uuid('Pick a service group'),
  is_active: z.coerce.boolean(),
})

export type ServiceActionState = { ok: boolean; error: string | null }
const serviceInitial = (msg: string | null): ServiceActionState => ({ ok: msg === null, error: msg })

function parseService(formData: FormData) {
  return serviceSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') || null,
    time_requirement_minutes: formData.get('time_requirement_minutes'),
    service_group_id: formData.get('service_group_id'),
    is_active: formData.get('is_active') === 'on',
  })
}

export async function createService(_prev: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const parsed = parseService(formData)
  if (!parsed.success) return serviceInitial(parsed.error.issues[0]?.message ?? 'Invalid input')

  const supabase = await createClient()
  const { error } = await supabase.from('services').insert(parsed.data)
  if (error) return serviceInitial(error.message)

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, error: null }
}

export async function updateService(id: string, _prev: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const parsed = parseService(formData)
  if (!parsed.success) return serviceInitial(parsed.error.issues[0]?.message ?? 'Invalid input')

  const supabase = await createClient()
  const { error } = await supabase.from('services').update(parsed.data).eq('id', id)
  if (error) return serviceInitial(error.message)

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, error: null }
}

export async function deleteService(id: string): Promise<void> {
  const supabase = await createClient()
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

  const supabase = await createClient()
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

  const supabase = await createClient()
  const { error } = await supabase.from('service_groups').update(parsed.data).eq('id', id)
  if (error) return groupInitial(error.message)

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, error: null, id }
}

export async function deleteServiceGroup(id: string): Promise<void> {
  const supabase = await createClient()
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
  price_amount: z.coerce.number().min(0).max(100000),
  break_required: z.boolean(),
  break_minutes: z.coerce.number().int().min(0).max(180),
  buffer_minutes: z.coerce.number().int().min(0).max(240).refine((value) => value % 15 === 0, {
    message: 'Buffer time must use 15-minute increments',
  }),
  allowed_start_times: z.array(bookingStartTimeSchema).max(48).refine(
    (times) => new Set(times).size === times.length,
    'Start times must be unique',
  ),
  people_count: z.coerce.number().int().min(1).max(10),
  time_adjustment_minutes: z.coerce.number().int().min(-1440).max(1440),
  is_active: z.boolean(),
  service_ids: z.array(z.string().uuid()).min(1, 'Select at least one service'),
}).refine((d) => !d.break_required || d.break_minutes > 0, {
  message: 'Break time must be greater than 0 when a break is required',
  path: ['break_minutes'],
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

async function computeDuration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceIds: string[],
  peopleCount: number,
  timeAdjustmentMinutes: number,
  breakRequired: boolean,
  breakMinutes: number,
): Promise<{ ok: true; duration: number } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('services')
    .select('time_requirement_minutes')
    .in('id', serviceIds)
  if (error) return { ok: false, error: error.message }
  const serviceSum = (data ?? []).reduce((acc, s) => acc + s.time_requirement_minutes, 0)
  if (serviceSum <= 0) return { ok: false, error: 'Selected services have no duration' }
  const duration = (serviceSum * peopleCount) + timeAdjustmentMinutes + (breakRequired ? breakMinutes : 0)
  if (duration <= 0) return { ok: false, error: 'The final offering time must be greater than 0' }
  return { ok: true, duration }
}

export async function createOffering(payload: OfferingPayload): Promise<OfferingActionResult> {
  const parsed = offeringSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }

  const { service_ids, ...rest } = parsed.data
  const supabase = await createClient()
  const dur = await computeDuration(
    supabase,
    service_ids,
    rest.people_count,
    rest.time_adjustment_minutes,
    rest.break_required,
    rest.break_minutes,
  )
  if (!dur.ok) return { ok: false, error: dur.error }

  const { data, error } = await supabase
    .from('offerings')
    .insert({ ...rest, duration_minutes: dur.duration })
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
  const supabase = await createClient()
  const dur = await computeDuration(
    supabase,
    service_ids,
    rest.people_count,
    rest.time_adjustment_minutes,
    rest.break_required,
    rest.break_minutes,
  )
  if (!dur.ok) return { ok: false, error: dur.error }

  const { error } = await supabase
    .from('offerings')
    .update({ ...rest, duration_minutes: dur.duration })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  const syncErr = await syncOfferingServices(supabase, id, service_ids)
  if (syncErr) return { ok: false, error: syncErr }

  revalidatePath(OFFERINGS_PATH)
  return { ok: true, id }
}

export async function deleteOffering(id: string): Promise<void> {
  const supabase = await createClient()
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
  duration_minutes: number
  price_amount: number
  break_required: boolean
  break_minutes: number
  people_count: number
  service_ids: string[]
  image_urls: string[]
}

export async function publishSnapshot(): Promise<{ ok: true; published_at: string } | { ok: false; error: string }> {
  const supabase = await createClient()

  const [groupsRes, servicesRes, offeringsRes, offeringServicesRes, offeringImagesRes, imagesRes, userRes] = await Promise.all([
    supabase.from('service_groups').select('id, name, description').order('name'),
    supabase.from('services').select('id, name, description, service_group_id, time_requirement_minutes').eq('is_active', true).order('name'),
    supabase.from('offerings').select('id, name, description, duration_minutes, price_amount, break_required, break_minutes, people_count').eq('is_active', true).order('name'),
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
      duration_minutes: o.duration_minutes,
      price_amount: Number(o.price_amount),
      break_required: o.break_required,
      break_minutes: o.break_minutes,
      people_count: o.people_count,
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
