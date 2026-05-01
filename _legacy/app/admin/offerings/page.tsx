import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/types/database'

type Offering = Database['public']['Tables']['offerings']['Row']

export default async function OfferingsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('offerings')
    .select('*')
    .order('name')

  const offerings = (data ?? []) as unknown as Offering[]

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Offerings</h1>
        <Button asChild size="sm">
          <Link href="/admin/offerings/new">Add Offering</Link>
        </Button>
      </div>

      {!offerings.length ? (
        <p className="text-muted-foreground text-sm">No offerings yet. Add one to get started.</p>
      ) : (
        <div className="space-y-2">
          {offerings.map((o) => (
            <div key={o.id} className="rounded-lg border p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{o.name}</p>
                <p className="text-sm text-muted-foreground">
                  {o.duration_minutes} min · ${Number(o.price_amount).toFixed(2)}
                </p>
                {o.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{o.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={o.is_active ? 'default' : 'secondary'}>
                  {o.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/offerings/${o.id}`}>Edit</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
