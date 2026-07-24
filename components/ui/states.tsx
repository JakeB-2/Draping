// Shared skeleton and empty/unavailable state primitives.
//
// Keep list/detail/side-rail loading and empty states on shared primitives so
// surfaces do not drift into one-off skeleton shapes and copy.
//
//   Skeletons
//     - DataTableSkeleton     — table list (header row + N body rows)
//     - DetailPanelSkeleton   — detail page (title + metadata grid + body)
//     - PanelBarsSkeleton     — streamed side panel (N stacked full-width bars)
//     - SideRailSkeleton      — workspace side rail (stacked cards)
//     - FormPanelSkeleton     — form body inside a drawer (re-exports
//                                FormSkeleton for symmetry; old import path
//                                also still works)
//
//   States
//     - EmptyState         — "no records yet" with an optional CTA
//     - FilteredEmptyState — "no records match these filters" with a clear
//                            filters CTA
//     - UnavailableState   — feature exists but is not available right now
//                            (e.g. missing prerequisites)
//     - DeferredState      — feature is planned but not yet built; replaces
//                            disabled "Coming soon" buttons sitting in the
//                            primary action position

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Skeleton shapes
// ---------------------------------------------------------------------------

export function DataTableSkeleton({
  rows = 8,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden', className)}>
      <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            {Array.from({ length: columns }).map((_, j) => (
              <Skeleton
                key={j}
                className={cn(
                  'h-4',
                  j === 0 ? 'w-1/4' :
                  j === 1 ? 'w-1/5' :
                  j === columns - 1 ? 'w-1/6 ml-auto' :
                                       'w-1/6',
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetailPanelSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6 p-6', className)}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

// Stacked full-width bars — the Suspense fallback for streamed side-detail
// panels (RoomDetailPanel, CourseDetailPanel, RentalItemDetailPanel, …) that
// each used to redefine an identical local PanelSkeleton.
export function PanelBarsSkeleton({ bars = 3, className }: { bars?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: bars }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  )
}

export function SideRailSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-3 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

// Re-exported for parity with the new naming. Existing callers of
// `<FormSkeleton />` keep working via the original module path.
export { FormSkeleton as FormPanelSkeleton } from '@/components/screens/form-skeleton'

// ---------------------------------------------------------------------------
// State primitives
// ---------------------------------------------------------------------------

type StateProps = {
  title: React.ReactNode
  description?: React.ReactNode
  /** Primary action (typically a <Button>). Omit for read-only contexts. */
  action?: React.ReactNode
  /** Optional icon shown above the title (lucide icon component). */
  icon?: React.ComponentType<{ className?: string }>
  className?: string
}

function StateShell({ title, description, action, icon: Icon, className, tone }: StateProps & { tone: 'muted' | 'deferred' | 'unavailable' }) {
  const toneClass =
    tone === 'deferred'   ? 'border-dashed border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/10' :
    tone === 'unavailable' ? 'border-dashed border-muted-foreground/30 bg-muted/30' :
                              'border-dashed bg-muted/30'
  return (
    <div className={cn('rounded-xl border p-8 text-center space-y-2', toneClass, className)}>
      {Icon && (
        <Icon className="mx-auto h-6 w-6 text-muted-foreground" />
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-md mx-auto">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  )
}

export function EmptyState(props: StateProps) {
  return <StateShell {...props} tone="muted" />
}

export function FilteredEmptyState(props: StateProps) {
  return <StateShell {...props} tone="muted" />
}

export function UnavailableState(props: StateProps) {
  return <StateShell {...props} tone="unavailable" />
}

/**
 * "Planned but not built yet" affordance. Use this instead of a disabled
 * primary "Coming Soon" button — those misrepresent themselves as actionable
 * controls.
 */
export function DeferredState(props: StateProps) {
  return <StateShell {...props} tone="deferred" />
}
