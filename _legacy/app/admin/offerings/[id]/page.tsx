import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OfferingForm from '../OfferingForm'

type ServiceRow = { id: string; name: string }
type OfferingRow = {
  id: string; name: string; description: string | null
  duration_minutes: number; price_amount: number
  break_required: boolean; pair_allowed: boolean; is_active: boolean
}
type OfferingServiceRow = { service_id: string }

export default async function EditOfferingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: offeringData }, { data: servicesData }, { data: linkedData }] = await Promise.all([
    supabase.from('offerings').select('*').eq('id', id).maybeSingle(),
    supabase.from('services').select('id, name').eq('is_active', true).order('name'),
    supabase.from('offering_services').select('service_id').eq('offering_id', id),
  ])

  if (!offeringData) notFound()

  const offering = offeringData as unknown as OfferingRow
  const services = (servicesData ?? []) as unknown as ServiceRow[]
  const linkedServiceIds = ((linkedData ?? []) as unknown as OfferingServiceRow[]).map((r) => r.service_id)

  return (
    <OfferingForm
      id={offering.id}
      services={services}
      defaultValues={{
        name: offering.name,
        description: offering.description ?? '',
        duration_minutes: offering.duration_minutes,
        price_amount: Number(offering.price_amount),
        break_required: offering.break_required,
        pair_allowed: offering.pair_allowed,
        is_active: offering.is_active,
        service_ids: linkedServiceIds,
      }}
    />
  )
}
