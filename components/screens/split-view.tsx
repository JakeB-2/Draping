// Split View primitive.
//
// List on the left (or top on narrow widths) + detail on the right. Selection
// lives in the URL via a query param (e.g. `/purchasing/bills?selected=abc`),
// so the list-and-detail state survives navigation, refresh, share, and
// back-button.
//
// Compose with the entity's `<EntityDetailContent />`:
//
//   <SplitView
//     list={<BillsTable basePath="/purchasing/bills" selectedParam="selected" />}
//     detail={selectedId ? <BillDetailContent id={selectedId} /> : null}
//     emptyState={<SplitEmptyState description="Select a bill to see its details." />}
//   />
//
// The list component is responsible for highlighting the selected row; pass
// the same query param key it watches.
//
// Breakpoints (R-UX-030): the two panes go side-by-side at `lg`, not `md`.
// Between md and lg (portrait tablets, small windows) the full-width desktop
// table would otherwise be crushed into a ~40% pane; instead the panes stack,
// with the DETAIL FIRST when a record is open so the selection is immediately
// visible and the list remains reachable below it. Below `md` (phone) the whole
// LIST PANE hides on selection so the detail owns the viewport — the record is
// the master-detail leaf; users return to the list via the mobile top-bar
// breadcrumb (which strips `?selected=`), not by scrolling past the detail.
//
// This collapse is owned HERE, not in DataTable, so it also hides list chrome
// that lives outside the table — most importantly the external `<Paginator>`
// that `EntityListPage` renders as a sibling of the table. DataTable's own
// mobile collapse only fired when the selected row sat on the current page, so
// the paginator leaked below the detail and paging past that page brought the
// full table back. Hiding the pane on `detail` presence fixes both.

import * as React from 'react'
import { cn } from '@/lib/utils'
import { SplitEmptyState } from './split-empty-state'

export function SplitView({
  list,
  detail,
  emptyState,
  className,
  /** Whether a real record is currently selected. This — NOT `detail` being
   *  non-null — is what drives the phone master-detail collapse (`max-md:hidden`
   *  on the list pane). Most callers pass their own empty-state element as
   *  `detail` when nothing is selected, so `detail` is effectively always
   *  truthy; keying the collapse off `detail` would blank the list on phone even
   *  with no selection. Callers pass `selected={!!resolvedRecord}` — the same
   *  boolean that chooses the detail panel over the empty state, so scoped
   *  surfaces (e.g. `?selected=<out-of-scope id>` resolving to no record) stay
   *  on the list rather than collapsing to an empty detail. Defaults to `false`:
   *  a caller that never wires it simply falls back to DataTable's own card-list
   *  collapse and never blanks. */
  selected = false,
  /** Tailwind width override for the detail pane (applies from `lg`, where the
   *  panes sit side-by-side). Default is roughly 40/60. */
  detailWidthClassName = 'lg:w-3/5 xl:w-2/3',
}: {
  list: React.ReactNode
  detail: React.ReactNode | null
  emptyState?: React.ReactNode
  className?: string
  selected?: boolean
  detailWidthClassName?: string
}) {
  return (
    <div className={cn('flex flex-col lg:flex-row lg:gap-4 lg:items-start', className)}>
      {/* List pane: full width until lg; left side from lg. When a record is
          open and the panes are stacked, the detail renders first (order-first
          below) so `order-2` here keeps the list underneath it. On phones
          (`max-md`) the whole pane hides on selection — table, toolbar, AND the
          external paginator — so the detail owns the viewport (see header). The
          phone-hide keys off `selected`, not `detail`, because callers pass an
          empty-state element as `detail` when nothing is selected. */}
      <div
        className={cn(
          'lg:flex-1 min-w-0',
          detail && 'order-2 lg:order-none',
          selected && 'max-md:hidden',
        )}
      >
        {list}
      </div>

      {/* Detail pane: stacks above the list until lg (when a record is open),
          right side from lg. Sticky only when side-by-side — a stuck pane in
          the stacked flow would overlap the list scrolling beneath it.
          NOTHING-SELECTED state is desktop-only (max-lg:hidden): in the
          stacked layout the empty-state hero would sit as a large dead block
          around the list, and the table toolbar + emptyMessage already cover
          creation and zero-row feedback on small screens. */}
      <aside
        className={cn(
          'lg:mt-0 lg:sticky lg:top-4 min-w-0',
          // The stacking margin applies only where the stacked detail pane is
          // actually visible (md→lg). Below md a truthy-but-phone-hidden detail
          // (SplitEmptyState hero, a `hidden md:block` create form) would
          // otherwise render as a zero-height aside whose mb-4 adds 16px of
          // phantom space above the list.
          detail ? 'order-1 lg:order-none max-md:mb-0 mb-4 lg:mb-0' : 'max-lg:hidden',
          detailWidthClassName,
        )}
      >
        {detail ?? (
          <div className="rounded-md border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            {emptyState ?? <SplitEmptyState description="Select an item to see its details." />}
          </div>
        )}
      </aside>
    </div>
  )
}
