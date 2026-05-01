import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServiceGroupForm from '../ServiceGroupForm'

export default async function EditServiceGroupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase.from('service_groups').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()

  const group = data as unknown as { id: string; name: string; description: string | null }

  return (
    <ServiceGroupForm
      id={group.id}
      defaultValues={{ name: group.name, description: group.description ?? '' }}
    />
  )
}
