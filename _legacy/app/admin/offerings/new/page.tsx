import { createClient } from '@/lib/supabase/server'
import NewOfferingWizard from './NewOfferingWizard'

type ServiceRow = {
  id: string
  name: string
  time_requirement_minutes: number
  service_group_id: string | null
  service_groups: { id: string; name: string } | null
}

export default async function NewOfferingPage() {
  const supabase = await createClient()

  const [{ data: servicesData }, { data: settingsData }] = await Promise.all([
    supabase
      .from('services')
      .select('id, name, time_requirement_minutes, service_group_id, service_groups(id, name)')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('booking_settings')
      .select('break_threshold_minutes, break_duration_minutes')
      .single(),
  ])

  const services = (servicesData ?? []) as unknown as ServiceRow[]

  // Group services by service group, preserving group order by first appearance
  type GroupEntry = { id: string; name: string; services: { id: string; name: string; time_requirement_minutes: number; service_group_id: string }[] }
  const groupMap = new Map<string, GroupEntry>()
  for (const service of services) {
    if (!service.service_group_id || !service.service_groups) continue
    const gid = service.service_group_id
    if (!groupMap.has(gid)) {
      groupMap.set(gid, { id: gid, name: service.service_groups.name, services: [] })
    }
    groupMap.get(gid)!.services.push({
      id: service.id,
      name: service.name,
      time_requirement_minutes: service.time_requirement_minutes,
      service_group_id: gid,
    })
  }
  const serviceGroups = Array.from(groupMap.values())

  const settings = settingsData as { break_threshold_minutes: number; break_duration_minutes: number } | null

  return (
    <NewOfferingWizard
      serviceGroups={serviceGroups}
      breakThresholdMinutes={settings?.break_threshold_minutes ?? 90}
      defaultBreakDurationMinutes={settings?.break_duration_minutes ?? 15}
    />
  )
}
