'use client'

import * as React from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { RouteHelpLink } from '@/components/ui/route-help-link'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// DetailPaneHeader — THE record-detail header (R-UX-036).
//
// One header grammar for every record surface (split-view pane, full-route
// body, bespoke detail bodies like AccDocDetailBody). SectionStack renders its
// header through this component, so ~45 existing panes conform automatically;
// bespoke bodies use it directly instead of hand-rolling a flex row.
//
// The grammar (enforced by convention + review, encoded here as slots):
//   - `title` (+ the route help icon, always attached beside it, same row —
//     desktop only; on phones the page help moves to the sticky hub top bar)
//   - `subtitle` — supplementary muted line
//   - `badges` — at most ONE status badge (via a StatusBadge wrapper), plus
//     nothing else. Metadata (currency, type, counts) belongs in the subtitle
//     text or a body Field row, not here.
//   - `progress` — the only sanctioned extra chrome: a status strip / stepper
//     (shipment lifecycle, wizard steps) rendered full-width below the title
//     row, inside the header border.
//   - `actions` — at most one standalone primary in-flow action plus one ⋯
//     menu (RecordActions / RowActionsMenu). Everything else folds into the ⋯.
//
// Mobile "back to list" is NOT here (R-UX-040): the sticky hub top bar renders a
// "<Tab> › <record>" breadcrumb whose tab crumb links back to the list, so a
// per-header phone chevron would be a redundant second back affordance.
// ---------------------------------------------------------------------------

// Pure core of useSelectionBackHref, exported for direct unit testing (the
// unit suite is Node-only — no rendering harness for the hook itself).
export function resolveSelectionBackHref(
  pathname: string,
  queryString: string,
  selectionParam?: string,
): { active: boolean; href: string | null } {
  const params = new URLSearchParams(queryString)
  const selectionKey = selectionParam && params.has(selectionParam)
    ? selectionParam
    : params.has('selected')
      ? 'selected'
      : Array.from(params.keys()).find((key) => key.startsWith('selected_'))

  if (!selectionKey) return { active: false, href: null }

  params.delete(selectionKey)
  if (selectionKey === 'selected') {
    params.delete('new')
    params.delete('edit')
  } else if (selectionKey.startsWith('selected_')) {
    const suffix = selectionKey.slice('selected'.length)
    params.delete(`new${suffix}`)
    params.delete(`edit${suffix}`)
  }

  const qs = params.toString()
  return {
    active: true,
    href: qs ? `${pathname}?${qs}` : pathname,
  }
}

export function useSelectionBackHref(selectionParam?: string) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()

  return React.useMemo(
    () => resolveSelectionBackHref(pathname, queryString, selectionParam),
    [pathname, queryString, selectionParam],
  )
}

export function DetailPaneHeader({
  title,
  subtitle,
  badges,
  progress,
  actions,
  helpArticleId,
  mobileFlush = false,
  className,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  /** ≤1 status badge (StatusBadge wrapper). Metadata goes in `subtitle`/body. */
  badges?: React.ReactNode
  /** Sanctioned status strip / stepper, full-width below the title row. */
  progress?: React.ReactNode
  /** ≤1 standalone primary action + one ⋯ menu. Everything else folds in. */
  actions?: React.ReactNode
  /** Override the route-derived help article. Pass null to hide the icon. */
  helpArticleId?: string | null
  /** Match SectionStack's phone near-full-bleed mode: inset the bottom rule to
   *  the section accent-pill line instead of drawing an edge-to-edge border. */
  mobileFlush?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'py-2',
        // Flush phones: px-1.5 starts the title/subtitle on the SAME line as
        // the inset bottom rule and the section accent pills below (all at the
        // 0.375rem line inside the bled wrapper), so the pane reads as one
        // aligned column. Desktop and non-flush keep the standard px-3.
        mobileFlush ? 'px-1.5 md:px-3' : 'px-3',
        // Bottom rule: on flush phones inset it to the same pill line via a
        // pseudo-rule; plain edge-to-edge border everywhere else.
        mobileFlush
          ? 'relative after:pointer-events-none after:absolute after:inset-x-1.5 after:bottom-0 after:h-px after:bg-border md:border-b md:after:hidden'
          : 'border-b',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <div className="min-w-0 flex-1">
            {/* Title + help icon are a no-wrap unit (title truncates instead);
                badges wrap below as a group on narrow screens rather than
                landing icon-by-icon between the title and the subtitle. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="flex min-w-0 max-w-full items-center gap-1">
                {typeof title === 'string' ? (
                  <h2 className="min-w-0 truncate text-record font-semibold leading-tight">{title}</h2>
                ) : (
                  title
                )}
                {/* Desktop only — on phones this page help lives in the hub top
                    bar (R-UX-040), so hide it here to avoid a duplicate. */}
                <span className="hidden shrink-0 md:inline-flex">
                  <RouteHelpLink articleId={helpArticleId} />
                </span>
              </span>
              {badges}
            </div>
            {subtitle && (
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {progress && <div className="pt-2">{progress}</div>}
    </div>
  )
}
