import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type ServiceRow = {
  id: string
  name: string
  description: string | null
  time_requirement_minutes: number
  is_active: boolean
  service_groups: { name: string } | null
}

export default async function ServicesPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('services')
    .select('*, service_groups ( name )')
    .order('name')

  const services = (data ?? []) as unknown as ServiceRow[]

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Services</h1>
        <Button asChild size="sm">
          <Link href="/admin/services/new">Add Service</Link>
        </Button>
      </div>

      {!services.length ? (
        <p className="text-muted-foreground text-sm">No services yet. Add one to get started.</p>
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <div key={s.id} className="rounded-lg border p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {s.service_groups?.name} · {s.time_requirement_minutes} min
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={s.is_active ? 'default' : 'secondary'}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/services/${s.id}`}>Edit</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
