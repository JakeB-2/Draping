import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// ListPageWrapper — standard wrapper for every list/table page.
// Provides the Suspense boundary + loading skeleton so each page.tsx
// doesn't have to repeat it.
//
// Usage:
//   <ListPageWrapper>
//     <ClientsTable data={rows} />
//   </ListPageWrapper>
// ---------------------------------------------------------------------------
export function ListPageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        {children}
      </Suspense>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LoadError — inline error state for failed data fetches.
// Use instead of an inline <div className="text-destructive"> in page.tsx.
//
// Usage:
//   if (error) return <LoadError message="Failed to load clients." />
// ---------------------------------------------------------------------------
export function LoadError({ message }: { message: string }) {
  return <p className="text-sm text-destructive">{message}</p>
}
