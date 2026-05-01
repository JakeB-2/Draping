import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServiceForm from '../ServiceForm'

type ServiceGroupRow = { id: string; name: string }
type ServiceRow = {
  id: string; name: string; description: string | null
  service_group_id: string; time_requirement_minutes: number; is_active: boolean
}

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: serviceData }, { data: groupsData }] = await Promise.all([
    supabase.from('services').select('*').eq('id', id).maybeSingle(),
    supabase.from('service_groups').select('id, name').order('name'),
  ])

  if (!serviceData) notFound()

  const service = serviceData as unknown as ServiceRow
  const serviceGroups = (groupsData ?? []) as unknown as ServiceGroupRow[]

  return (
    <ServiceForm
      id={service.id}
      serviceGroups={serviceGroups}
      defaultValues={{
        name: service.name,
        description: service.description ?? '',
        service_group_id: service.service_group_id,
        time_requirement_minutes: service.time_requirement_minutes,
        is_active: service.is_active,
      }}
    />
  )
}
