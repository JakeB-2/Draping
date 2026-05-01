import { createClient } from '@/lib/supabase/server'
import ServiceForm from '../ServiceForm'

type ServiceGroupRow = { id: string; name: string }

export default async function NewServicePage() {
  const supabase = await createClient()
  const { data } = await supabase.from('service_groups').select('id, name').order('name')
  const serviceGroups = (data ?? []) as unknown as ServiceGroupRow[]

  return <ServiceForm serviceGroups={serviceGroups} />
}
