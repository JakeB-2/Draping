import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type ServiceGroupRow = { id: string; name: string; description: string | null }

export default async function ServiceGroupsPage() {
  const supabase = await createClient()
  const { data } = await supabase.from('service_groups').select('*').order('name')
  const groups = (data ?? []) as unknown as ServiceGroupRow[]

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Service Groups</h1>
        <Button asChild size="sm">
          <Link href="/admin/service-groups/new">Add Group</Link>
        </Button>
      </div>

      {!groups.length ? (
        <p className="text-muted-foreground text-sm">No service groups yet. Add one to get started.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="rounded-lg border p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{g.name}</p>
                {g.description && (
                  <p className="text-sm text-muted-foreground">{g.description}</p>
                )}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/service-groups/${g.id}`}>Edit</Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
