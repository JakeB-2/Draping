// Loading skeleton for `<Suspense>` fallbacks inside FormDrawers. Shared
// shape: two short rows + one taller row, matching most light CRUD forms
// (name + select + notes/textarea). Pages with custom shorter forms can
// inline their own variant — this is the common case.

import { Skeleton } from '@/components/ui/skeleton'

export function FormSkeleton() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}
