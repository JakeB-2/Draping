'use client'


// Generic data table used by every list page. Handles search, sort, multi-column filters, responsive column hiding, row click, and an optional empty-state message.
//
// Filters render as a single grouped FilterSheet (one button → sheet → all filter
// groups inside) instead of one dropdown per filter. Active filters appear as
// removable chips below the toolbar.
//
// Below the `md` breakpoint — or whenever the table's CONTAINER is narrower
// than 28rem (a SplitView list pane at iPad widths, the right rail, a Settings
// pane beside the SubSidebar) — the table is replaced with a stack of
// card-rows. The root wraps everything in a CSS `@container/table`, so column
// tiers and the card/table switch respond to the width the table actually
// gets, not the viewport (2026-07-22 tablet fix: at lg viewports SplitView
// panes are ~310–440px and used to receive the full desktop column set).
// Each card pulls cells from columns annotated with
// `mobile: 'title' | 'subtitle' | 'metadata' | 'trailing' | 'signal' |
// 'compactAction'` (see the
// slot content contract on Column.mobile in ./types). Columns without a
// `mobile` field are hidden on mobile. If no column is annotated, the first
// column is used as the title.
//
// Card anatomy (2026-07-13 semantic right-rail redesign):
//
//   ┌───────────────────────────────────────────┐
//   │ Title                            [action] │
//   │ Subtitle                    MX$1,234.00 │
//   │ Metadata                      [signals] │
//   └───────────────────────────────────────────┘
//
// Missing groups reserve no space. One right-side group centers (except a lone
// compact action, which stays at the top); two or three groups distribute over
// the natural card height. There is no decorative navigation lane.

import { Fragment, useState, useMemo, useDeferredValue } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronsUpDown, MoreVertical, Search, ChevronRight, ChevronLeft, CheckSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { RouteHelpLink } from '@/components/ui/route-help-link'
import { EmptyState, FilteredEmptyState } from '@/components/ui/states'
import { Surface } from '@/components/screens'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LockTooltip } from '@/components/ui/lock-reason'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { FilterSheet, FilterChipRow } from '@/components/ui/filter-sheet'
import { applyTablePipeline } from './apply-table-pipeline'
import { useTableUrlState } from './use-table-url-state'
import { isEmptyCell } from './table-cells'
import { isDirectRowActivationKey, mobileRightRailJustification } from './mobile-row-utils'
import type { Column, FilterDef, FacetFilterDef, DateRangeFilterDef } from './types'

// Re-export so existing callsites keep importing types from this file.
export type { Column, FilterDef, FacetFilterDef, DateRangeFilterDef }

// Only 'lg' exists: the desktop table itself only renders above the card
// cutoff, so any smaller breakpoint would be a no-op (see Column.hideBelow in
// ./types). CONTAINER-keyed (not viewport): `@3xl` = 48rem = 768px of actual
// table width. Full-width desktop tables at ≥1024px viewports have ~780–916px
// containers (expanded/collapsed sidebar), so desktop-tier columns keep
// rendering there exactly as the old viewport-`lg:` class did — but a table
// squeezed into a narrow SplitView pane now sheds them like a small screen.
const HIDE_BELOW: Record<'lg', string> = {
  lg: 'hidden @3xl/table:table-cell',
}

export type DataTableMoreAction = {
  label: string
  icon?: React.ElementType
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
  /** Tooltip-rendered reason explaining the disabled state. */
  disabledReason?: string
}

type Props<T> = {
  data: T[]
  columns: Column<T>[]
  /** Extra row-state glyphs for the mobile signal cluster when the state is
   *  derived from the row rather than represented by a desktop column. */
  mobileSignals?: (row: T) => React.ReactNode
  /** Keys to include in the text search. Omit to disable search. */
  searchKeys?: (keyof T)[]
  /**
   * When true, the search box drives a server query instead of filtering `data`
   * client-side: the page reads `?q=` and returns the matching slice, so this
   * table skips its own search pass over `data` and resets the server `?page=`
   * on each new term. `searchKeys` still gates the search box + `/` shortcut.
   */
  serverSearch?: boolean
  searchPlaceholder?: string
  /** Table heading. Rendered as the leading item in the toolbar row. */
  title?: React.ReactNode
  /** Optional help article rendered beside the table heading. */
  helpArticleId?: string | null
  /**
   * Hide the toolbar title (+ its help icon) below md, keeping the search bar,
   * actions, and any `description`. Used by settings pages where the SubSidebar
   * mobile dropdown already carries the section name, so the table title would
   * duplicate it on phones (R-UX-027). Desktop is unchanged.
   */
  hideTitleOnMobile?: boolean
  /** Short subtitle rendered directly under the toolbar title. Plain text or any node. */
  description?: React.ReactNode
  /**
   * The single primary CTA on the toolbar (e.g. "Add Work Entry").
   * Rendered right of the search bar. Anything beyond one button should
   * go in `moreActions` so the toolbar stays a single row.
   */
  actions?: React.ReactNode
  /**
   * Secondary actions surfaced through a "More" dropdown next to `actions`.
   * Each item renders as a DropdownMenuItem.
   */
  moreActions?: DataTableMoreAction[]
  emptyMessage?: string
  /** Structured column filters. Surfaced through a single grouped FilterSheet. */
  filters?: FilterDef<T>[]
  /** Makes each row clickable. Consumer handles navigation. */
  onRowClick?: (row: T) => void
  /**
   * When provided, hovering a row calls router.prefetch(rowHref(row)) so
   * the detail page is already in cache by the time the user clicks. Pair
   * with onRowClick that pushes the same path — onRowClick still drives the
   * actual navigation; this just warms the cache.
   */
  rowHref?: (row: T) => string
  /** When true, render a checkbox column + select-all header. Rows must have an `id` field. */
  selectable?: boolean
  /** Toolbar slot rendered when at least one row is selected. */
  selectionActions?: (ids: string[], clearSelection: () => void) => React.ReactNode
  /**
   * When provided, each row gets a leading chevron toggle that reveals an
   * inline panel beneath the row. Rows must have an `id` field. One row open
   * at a time. Toggle clicks do not propagate to onRowClick.
   */
  renderExpanded?: (row: T) => React.ReactNode
  /**
   * Per-row gate for renderExpanded: rows failing it keep the leading column
   * (alignment) but render no chevron (e.g. items without variants).
   */
  canExpandRow?: (row: T) => boolean
  /**
   * Per-row className appended to the row's class list. Lets the parent
   * mark a row as externally selected without piggybacking on the table's
   * internal bulk-select state.
   */
  getRowClassName?: (row: T) => string | undefined
  /**
   * When set, slice the post-pipeline rows into pages of this size and render
   * Prev/Next controls below the table once the row count exceeds it. Sorting,
   * filtering, and search still operate on the full dataset.
   */
  pageSize?: number
  /**
   * When set, every URL key this table reads/writes is prefixed `${ns}.` so
   * multiple `DataTable`s on the same route don't collide on `q` / `sort` /
   * `dir` / facet labels. Default unset = bare keys (current behaviour).
   */
  namespace?: string
  /** When true, checkbox selection is visible immediately instead of hidden behind the toolbar Select button. */
  alwaysShowSelection?: boolean
  /** Id of the externally-open record (e.g. ?selected=); that row gets a teal
   *  left bar + faint teal fill so the open record is obvious in the list. */
  selectedId?: string | null
  /**
   * Opt into SERVER-side pagination. When set, the parent page has already
   * filtered, sorted, and paged the data — `data` is exactly the current page —
   * so the table skips its own client pipeline (no client search/facet/sort/
   * slice) and renders a URL-driven `?page=` paginator from `totalCount`.
   * The filter chips + sortable headers still write `sort`/`dir`/facet params to
   * the URL (the page re-queries), and any of those changes resets `?page=` to 1.
   * Pair with `serverSearch`. Leave unset for the default client-side behaviour.
   */
  serverPagination?: {
    page: number
    pageSize: number
    totalCount: number
  }
}

export default function DataTable<T extends object>({
  data,
  columns,
  mobileSignals,
  searchKeys,
  serverSearch,
  searchPlaceholder,
  title,
  helpArticleId,
  hideTitleOnMobile,
  description,
  actions,
  moreActions,
  filters,
  emptyMessage = 'Nothing here yet.',
  onRowClick,
  rowHref,
  selectable,
  selectionActions,
  renderExpanded,
  canExpandRow,
  getRowClassName,
  pageSize,
  namespace,
  alwaysShowSelection,
  selectedId,
  serverPagination,
}: Props<T>) {
  const serverMode = !!serverPagination
  const effectivePlaceholder = searchPlaceholder ?? 'Search…'
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Bulk-select is opt-in: hidden until the user clicks the "Select" toolbar
  // button. Keeps the checkbox column off lists where it isn't needed in the
  // common case.
  const [selectMode, setSelectMode] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const showCheckboxes = !!selectable && (!!alwaysShowSelection || selectMode)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function goToServerPage(next: number) {
    const params = new URLSearchParams(searchParams.toString())
    if (next <= 1) params.delete('page')
    else params.set('page', String(next))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // URL-backed state: search (with debounce + `/` shortcut), sort, filters
  // (facet + date range), and the chip strip. See use-table-url-state.ts.
  const {
    searchInput,
    setSearchInput,
    searchInputRef,
    sort,
    toggleSort,
    facetFilters,
    dateRangeFilters,
    activeFilters,
    activeDateRanges,
    writeFilters,
    removeOneChip,
    chips,
  } = useTableUrlState<T>({ columns, filters, searchKeys, namespace, serverSearch, serverPaged: serverMode })

  // Under serverSearch the page already returned the matching rows, so the client
  // pipeline must NOT re-filter by the (raw, unescaped) term — that double-filter
  // diverges from the server's escaping and can drop every server-matched row.
  const clientSearchKeys = serverSearch ? undefined : searchKeys
  // Defer the search term feeding the (potentially expensive) client pipeline so
  // each keystroke keeps the input responsive while the filtered rows recompute
  // at a lower priority. No effect in server mode (the pipeline is skipped).
  const deferredSearch = useDeferredValue(searchInput)
  const allRows = useMemo(
    () =>
      // In server-pagination mode the parent page already filtered, sorted, and
      // paged `data`, so the client pipeline is skipped entirely (running it
      // would re-sort/re-filter only the current page's slice).
      serverMode
        ? data
        : applyTablePipeline({
            data,
            search: deferredSearch,
            searchKeys: clientSearchKeys,
            facetFilters,
            activeFilters,
            dateRangeFilters,
            activeDateRanges,
            sort,
          }),
    [serverMode, data, deferredSearch, clientSearchKeys, facetFilters, dateRangeFilters, activeFilters, activeDateRanges, sort],
  )

  // Client-side pagination slice. When pageSize is omitted (or server mode owns
  // paging), behaves as before and renders every row in `allRows`. `page` is
  // clamped during render so shrinking the dataset never leaves us on an empty page.
  const [page, setPage] = useState(1)
  const clientPageSize = serverMode ? undefined : pageSize
  const totalPages = clientPageSize ? Math.max(1, Math.ceil(allRows.length / clientPageSize)) : 1
  const safePage = Math.min(Math.max(1, page), totalPages)
  const rows = useMemo(() => {
    if (!clientPageSize) return allRows
    const start = (safePage - 1) * clientPageSize
    return allRows.slice(start, start + clientPageSize)
  }, [allRows, clientPageSize, safePage])

  // Server paginator geometry (only meaningful in server mode).
  const serverTotalPages = serverPagination
    ? Math.max(1, Math.ceil(serverPagination.totalCount / serverPagination.pageSize))
    : 1
  const serverPage = Math.min(Math.max(1, serverPagination?.page ?? 1), serverTotalPages)

  // Mobile master-detail: once a record is open (`selectedId`), the phone list
  // collapses away entirely so the detail surface owns the viewport. Falls back
  // to the full list if the selected row isn't on the current page. Desktop is
  // unaffected; it shows the whole table beside the detail pane.
  const mobileCollapsed =
    selectedId != null && rows.some((r) => (r as Record<string, unknown>).id === selectedId)
  const mobileRows = rows

  // Selection helpers — operate on the currently-visible (filtered+sorted) rows.
  const visibleIds = useMemo(
    () => rows.map((r) => (r as Record<string, unknown>).id as string).filter(Boolean),
    [rows],
  )
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const someSelected = !allSelected && visibleIds.some((id) => selected.has(id))

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        for (const id of visibleIds) next.delete(id)
      } else {
        for (const id of visibleIds) next.add(id)
      }
      return next
    })
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() { setSelected(new Set()) }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  const selectionActiveCount = selected.size
  const isFilteredEmpty = data.length > 0 && allRows.length === 0

  function clearTableFilters() {
    setSearchInput('')
    writeFilters({}, {})
  }

  const emptyState = isFilteredEmpty ? (
    <FilteredEmptyState
      title="No matching records"
      description={emptyMessage}
      action={
        <Button variant="outline" size="sm" type="button" onClick={clearTableFilters}>
          Clear filters
        </Button>
      }
      className="border-0 bg-transparent"
    />
  ) : (
    <EmptyState title={emptyMessage} className="border-0 bg-transparent" />
  )

  function cellValue(row: T, col: Column<T>): React.ReactNode {
    return typeof col.accessor === 'function'
      ? col.accessor(row)
      : (row[col.accessor] as React.ReactNode)
  }

  // Phone-card cell: `mobileAccessor` wins when declared (short, text-first
  // content sized for a card line — null drops the cell); the desktop table
  // always renders `accessor`.
  function mobileCellValue(row: T, col: Column<T>): React.ReactNode {
    return col.mobileAccessor ? col.mobileAccessor(row) : cellValue(row, col)
  }

  // Resolve the mobile-card slot columns. If no column declares any slot,
  // fall back to using the first column as the title so we never render an
  // empty card. Duplicate claims on single-cell slots dev-warn instead of
  // silently dropping; metadata, trailing, signal, and full-width action are
  // multi-cell slots.
  const mobileSlots = useMemo(() => {
    const titleCol = columns.find((c) => c.mobile === 'title')
    const subtitleCol = columns.find((c) => c.mobile === 'subtitle')
    const metadataCols = columns.filter((c) => c.mobile === 'metadata' || c.mobile === 'tertiary')
    const trailingCols = columns.filter((c) => c.mobile === 'trailing' || c.mobile === 'right')
    const compactActionCols = columns.filter((c) => c.mobile === 'compactAction')
    const actionCols = columns.filter((c) => c.mobile === 'action')
    // Row-signals zone: every `signal` column, in column order, rendered at the
    // bottom of the semantic right rail.
    const signalCols = columns.filter((c) => c.mobile === 'signal')
    if (process.env.NODE_ENV !== 'production') {
      for (const slot of ['title', 'subtitle', 'compactAction'] as const) {
        const claims = columns.filter((c) => c.mobile === slot)
        if (claims.length > 1) {
          console.warn(
            `[DataTable] ${claims.length} columns claim the mobile '${slot}' slot ` +
            `(${claims.map((c) => c.header).join(', ')}); only the first renders.`,
          )
        }
      }
    }
    if (!titleCol && !subtitleCol && metadataCols.length === 0 && trailingCols.length === 0 && signalCols.length === 0 && compactActionCols.length === 0 && actionCols.length === 0) {
      return { title: columns[0], subtitle: undefined, metadata: [] as Column<T>[], trailing: [] as Column<T>[], signals: [] as Column<T>[], compactAction: undefined, actions: [] as Column<T>[] }
    }
    return { title: titleCol, subtitle: subtitleCol, metadata: metadataCols, trailing: trailingCols, signals: signalCols, compactAction: compactActionCols[0], actions: actionCols }
  }, [columns])

  const hasActiveFilters = searchInput.trim().length > 0 || chips.length > 0

  // Selection mode lives here so checkbox columns stay opt-in. Anything
  // additional (Import CSV, etc.) comes in via the caller's `moreActions`.
  const mergedMoreActions: DataTableMoreAction[] = [
    ...(moreActions ?? []),
    ...(selectable && !alwaysShowSelection
      ? [{
          label: selectMode ? 'Stop selecting' : 'Select multiple',
          icon: selectMode ? X : CheckSquare,
          onSelect: () => {
            if (selectMode) {
              exitSelectMode()
            } else {
              setSelectMode(true)
            }
          },
        }]
      : []),
  ]

  const hasMore = mergedMoreActions.length > 0
  const hasHelpLink = helpArticleId !== undefined && helpArticleId !== null
  const hasHeaderText = !!title || !!description || hasHelpLink
  const showSearchRow =
    hasHeaderText ||
    (searchKeys && searchKeys.length > 0) ||
    !!filters?.length ||
    hasActiveFilters ||
    hasMore ||
    !!actions

  return (
    // `@container/table` makes this component's own width the query root for
    // the card/table switch and the desktop-tier (`hideBelow`) columns.
    <div className="@container/table space-y-1.5">
      {showCheckboxes && selectionActiveCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <div className="text-sm">
            <span className="font-medium">{selectionActiveCount}</span> selected
            <Button variant="link" size="sm" className="h-auto px-2" onClick={exitSelectMode}>Cancel</Button>
          </div>
          <div className="flex items-center gap-2">
            {selectionActiveCount > 0 && selectionActions?.(Array.from(selected), clearSelection)}
          </div>
        </div>
      )}

      {showSearchRow && (
        <div className={mobileCollapsed ? 'hidden flex-wrap items-center gap-2 md:flex' : 'flex flex-wrap items-center gap-2'}>
          {/* Left group: title with the search bar tucked up against its end. */}
          {hasHeaderText && (
            <div className="w-full md:w-auto min-w-0 max-w-full flex-[0_1_auto] pr-1">
              {(title || hasHelpLink) && (
                // `hideTitleOnMobile` drops just the title+help row under md (the
                // SubSidebar dropdown already names the section there); any
                // `description` below still renders on mobile.
                <div className={(hideTitleOnMobile ? 'hidden md:flex' : 'flex') + ' min-w-0 items-center gap-1.5'}>
                  {title && <div className="truncate text-record font-semibold leading-tight">{title}</div>}
                  {hasHelpLink && <RouteHelpLink articleId={helpArticleId} className="shrink-0" />}
                </div>
              )}
              {description && (
                <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{description}</p>
              )}
            </div>
          )}
          {searchKeys && searchKeys.length > 0 && (
            <div className="relative min-w-0 flex-1 md:max-w-[260px] md:flex-[0_1_260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                placeholder={effectivePlaceholder}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 h-7 touch:h-9 text-sm w-full"
              />
            </div>
          )}
          {/* Right group: filters sit beside the primary action + overflow menu. */}
          {(hasActiveFilters || !!filters?.length || !!actions || hasMore) && (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearTableFilters}>
                  Clear All Filters
                </Button>
              )}
              {filters && filters.length > 0 && (
                <FilterSheet
                  groups={facetFilters.map((f) => ({ key: f.label, label: f.label, options: f.options }))}
                  dateRangeGroups={dateRangeFilters.map((f) => ({ key: f.label, label: f.label }))}
                  active={activeFilters}
                  activeDateRanges={activeDateRanges}
                  onChange={writeFilters}
                />
              )}
              {actions}
              {hasMore && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="shrink-0"
                      aria-label="More options"
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-56">
                    {mergedMoreActions.map((a) => {
                      const Icon = a.icon
                      const isDisabled = !!a.disabled || !!a.disabledReason
                      const item = (
                        <DropdownMenuItem
                          key={a.label}
                          onSelect={() => a.onSelect()}
                          disabled={isDisabled}
                          variant={a.destructive ? 'destructive' : undefined}
                        >
                          {Icon && <Icon className="size-4" />}
                          {a.label}
                        </DropdownMenuItem>
                      )
                      if (a.disabledReason) {
                        return (
                          <LockTooltip key={a.label} reason={a.disabledReason}>
                            {item}
                          </LockTooltip>
                        )
                      }
                      return item
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      )}

      <div className={mobileCollapsed ? 'hidden md:block' : undefined}>
        <FilterChipRow chips={chips} onRemove={removeOneChip} />
      </div>

      {/* Desktop table — needs BOTH an md+ viewport (phone keeps the card
          branch exactly as before) AND a ≥28rem container: in a narrower pane
          (SplitView list beside an open detail at tablet widths) the card
          branch below renders instead. */}
      <Surface className="hidden md:@md/table:block">
        <Table>
          <TableHeader>
            {/* Stronger bottom rule + the widened surface-2 step (see globals)
                make the column-header band read as distinct from the card. */}
            <TableRow className="bg-surface-header hover:bg-surface-header border-border-strong">
              {renderExpanded && <TableHead className="w-10 px-3" />}
              {showCheckboxes && (
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {columns.map((col) => {
                // Sortable when (a) accessor is a string key, or (b) caller
                // provided an explicit sortKey alongside a render-function
                // accessor (e.g. formatted date column sorting by ISO).
                const fallbackKey = typeof col.accessor === 'function' ? null : (col.accessor as keyof T)
                const sortKey = col.sortable ? (col.sortKey ?? fallbackKey) : null
                const currentDir = sortKey && sort?.key === sortKey ? sort.dir : null
                const ariaSort: 'ascending' | 'descending' | 'none' | undefined = sortKey
                  ? (currentDir === 'asc' ? 'ascending' : currentDir === 'desc' ? 'descending' : 'none')
                  : undefined

                const headerInner = (
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {sortKey && (
                      currentDir === 'asc' ? (
                        <ChevronUp className="size-3" />
                      ) : currentDir === 'desc' ? (
                        <ChevronDown className="size-3" />
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-40" />
                      )
                    )}
                  </span>
                )

                return (
                  <TableHead
                    key={col.header}
                    aria-sort={ariaSort}
                    className={[
                      'h-9 px-3 py-2 text-meta font-semibold uppercase tracking-[0.04em] text-muted-foreground',
                      col.className,
                      col.hideBelow ? HIDE_BELOW[col.hideBelow] : undefined,
                    ].filter(Boolean).join(' ') || undefined}
                  >
                    {sortKey ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(sortKey)}
                        className="inline-flex items-center gap-1 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        {headerInner}
                      </button>
                    ) : (
                      headerInner
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (showCheckboxes ? 1 : 0) + (renderExpanded ? 1 : 0)}
                  className="p-0"
                >
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => {
                const rowId = (row as Record<string, unknown>).id as string | undefined
                const isSelected = !!rowId && selected.has(rowId)
                const isExpanded = !!renderExpanded && !!rowId && expandedId === rowId
                const isActiveRow = selectedId != null && rowId === selectedId
                const accentColor = isActiveRow ? 'var(--primary)' : undefined
                const totalCols = columns.length + (showCheckboxes ? 1 : 0) + (renderExpanded ? 1 : 0)
                return (
                  <Fragment key={rowId ?? i}>
                    <TableRow
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onMouseEnter={rowHref ? () => router.prefetch(rowHref(row)) : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (isDirectRowActivationKey(e)) {
                                e.preventDefault()
                                onRowClick(row)
                              }
                            }
                          : undefined
                      }
                      role={onRowClick ? 'button' : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                      style={accentColor ? { boxShadow: `inset 3px 0 0 0 ${accentColor}` } : undefined}
                      className={[
                        'border-b border-border/50 transition-colors',
                        onRowClick ? 'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset' : 'hover:bg-muted/20',
                        isActiveRow ? 'bg-primary-soft hover:bg-primary-soft' : isSelected ? 'bg-primary/5' : '',
                        getRowClassName?.(row) ?? '',
                      ].filter(Boolean).join(' ')}
                    >
                      {renderExpanded && (
                        <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                          {rowId && (canExpandRow?.(row) ?? true) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 touch:size-9"
                              onClick={() => setExpandedId(isExpanded ? null : rowId)}
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                            >
                              {isExpanded
                                ? <ChevronDown className="size-3.5" />
                                : <ChevronRight className="size-3.5" />}
                            </Button>
                          )}
                        </TableCell>
                      )}
                      {showCheckboxes && (
                        <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                          {rowId && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(rowId)}
                              aria-label="Select row"
                            />
                          )}
                        </TableCell>
                      )}
                      {columns.map((col) => (
                        <TableCell
                          key={col.header}
                          className={[
                            'h-10 px-3 py-0 text-sm',
                            col.cellClassName,
                            col.hideBelow ? HIDE_BELOW[col.hideBelow] : undefined,
                          ].filter(Boolean).join(' ') || undefined}
                        >
                          {cellValue(row, col)}
                        </TableCell>
                      ))}
                    </TableRow>
                    {isExpanded && renderExpanded && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={totalCols} className="px-4 py-3">
                          {renderExpanded(row)}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </Surface>

      {/* Card-rows: phone (below md) AND any md+ container narrower than
          28rem (in-pane tablet rendering). Always mounted so a narrow pane at
          desktop widths still shows the list when a record is selected; the
          phone master-detail collapse (`mobileCollapsed`) is now a max-md-only
          CSS hide instead of an unmount. */}
      <Surface
        className={[
            'divide-y md:@md/table:hidden',
            mobileCollapsed ? 'max-md:hidden' : undefined,
          ].filter(Boolean).join(' ')}
        >
          {mobileRows.length === 0 ? (
            <div>{emptyState}</div>
          ) : (
            mobileRows.map((row, i) => {
              const rowId = (row as Record<string, unknown>).id as string | undefined
              const key = rowId ?? i
              const isSelected = !!rowId && selected.has(rowId)
              const isExpanded = !!renderExpanded && !!rowId && expandedId === rowId
              const isActiveRow = selectedId != null && rowId === selectedId
              const accentColor = isActiveRow ? 'var(--primary)' : undefined
              // Empty-value dashes read fine in a desktop grid but leave
              // dangling "· —" fragments / dash-only right slots on the phone
              // card — treat them as absent (title keeps its cell so the card
              // never loses its anchor value). `isEmptyCell` catches both the
              // literal '—' string and the `data-empty-cell`-stamped JSX
              // dashes from MoneyCell/DateCell/CountCell.
              const presentOrNull = (v: React.ReactNode) => (v == null || isEmptyCell(v) ? null : v)
              const titleCell  = mobileSlots.title    ? mobileCellValue(row, mobileSlots.title)    : null
              const subtitleCell = mobileSlots.subtitle ? presentOrNull(mobileCellValue(row, mobileSlots.subtitle)) : null
              const metadataCells = mobileSlots.metadata
                .map((col) => presentOrNull(mobileCellValue(row, col)))
                .filter((v) => v != null)
              // Primary scan values preserve column order in the center group.
              const trailingCells = mobileSlots.trailing
                .map((col) => presentOrNull(mobileCellValue(row, col)))
                .filter((v) => v != null)
              // Row signals always remain in the bottom semantic group.
              const signalCells = mobileSlots.signals
                .map((col) => presentOrNull(mobileCellValue(row, col)))
                .filter((v) => v != null)
              const actionCells = mobileSlots.actions
                .map((col) => presentOrNull(mobileCellValue(row, col)))
                .filter((v) => v != null)
              const compactActionCell = mobileSlots.compactAction
                ? presentOrNull(mobileCellValue(row, mobileSlots.compactAction))
                : null
              const extraSignals = presentOrNull(mobileSignals?.(row))
              if (extraSignals != null) signalCells.push(extraSignals)
              const rightRailGroups = {
                compactAction: compactActionCell != null,
                trailing: trailingCells.length > 0,
                signals: signalCells.length > 0,
              }
              const hasRightRail = Object.values(rightRailGroups).some(Boolean)
              return (
                <Fragment key={key}>
                  <div
                    onMouseEnter={rowHref ? () => router.prefetch(rowHref(row)) : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (isDirectRowActivationKey(e)) {
                              e.preventDefault()
                              onRowClick(row)
                            }
                          }
                        : undefined
                    }
                    role={onRowClick ? 'button' : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    style={accentColor ? { boxShadow: `inset 3px 0 0 0 ${accentColor}` } : undefined}
                    className={[
                      // min-h + py sized for a comfortable thumb target (~44px w/ scaled text).
                      'flex min-h-11 items-center gap-3 px-3.5 py-3 rounded-sm transition-colors',
                      onRowClick
                        ? 'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                        : 'cursor-default',
                      isActiveRow ? 'bg-primary-soft hover:bg-primary-soft' : isSelected ? 'bg-primary/5' : '',
                      getRowClassName?.(row) ?? '',
                    ].filter(Boolean).join(' ')}
                  >
                    {renderExpanded && rowId && (canExpandRow?.(row) ?? true) && (
                      <div
                        className="shrink-0"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 touch:size-9"
                          onClick={() => setExpandedId(isExpanded ? null : rowId)}
                          aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                        >
                          {isExpanded
                            ? <ChevronDown className="size-3.5" />
                            : <ChevronRight className="size-3.5" />}
                        </Button>
                      </div>
                    )}
                    {showCheckboxes && rowId && (
                      <div
                        className="shrink-0"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(rowId)}
                          aria-label="Select row"
                        />
                      </div>
                    )}
                    {/* The outer role=button is not a real <button>, so the
                        interactive compact/full-width action cells remain
                        valid HTML, matching the desktop TableRow. Inner
                        controls stop propagation and own their key events. */}
                    <div
                      className={[
                        // min-w-0 is load-bearing: as a
                        // flex-1 item this wrapper's min-width:auto would other-
                        // wise inherit the title's full nowrap min-content width
                        // and push the whole card past the viewport (the
                        // original style-lab break) before any truncation could
                        // apply.
                        'min-w-0 flex-1 text-left grid items-stretch gap-x-3 rounded-sm -mx-1 px-1',
                        hasRightRail
                          ? 'grid-cols-[minmax(0,1fr)_fit-content(min(45vw,12rem))]'
                          : 'grid-cols-[minmax(0,1fr)]',
                      ].join(' ')}
                    >
                      {/* Slot wrappers normalize arbitrary desktop JSX and keep
                          every left-side line on a constrained track. */}
                      <div className="col-start-1 min-w-0 max-w-full flex flex-col gap-0.5 self-center overflow-hidden">
                        {titleCell != null && (
                          <div data-mobile-slot="title" className="min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis text-sm font-semibold [&>*]:min-w-0 [&>*]:max-w-full [&>*]:overflow-hidden [&>*]:whitespace-nowrap [&>*]:text-ellipsis [&_*]:min-w-0 [&_*]:max-w-full">
                            {titleCell}
                          </div>
                        )}
                        {subtitleCell != null && (
                          <div data-mobile-slot="subtitle" className="min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis text-dense text-muted-foreground [&>*]:min-w-0 [&>*]:max-w-full [&>*]:overflow-hidden [&>*]:whitespace-nowrap [&>*]:text-ellipsis [&_*]:min-w-0 [&_*]:max-w-full">
                            {subtitleCell}
                          </div>
                        )}
                        {metadataCells.map((cell, mi) => (
                          <div key={mi} data-mobile-slot="metadata" className="min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis text-xs text-muted-foreground [&>*]:min-w-0 [&>*]:max-w-full [&>*]:overflow-hidden [&>*]:whitespace-nowrap [&>*]:text-ellipsis [&_*]:min-w-0 [&_*]:max-w-full">
                            {cell}
                          </div>
                        ))}
                      </div>
                      {hasRightRail && (
                        <div
                          data-mobile-right-rail
                          className={`col-start-2 row-start-1 max-w-full self-stretch flex min-h-full flex-col items-end gap-1 text-right text-dense tabular-nums ${mobileRightRailJustification(rightRailGroups)}`}
                        >
                          {compactActionCell != null && (
                            <div
                              data-mobile-slot="compact-action"
                              className="flex min-h-11 min-w-11 items-start justify-end [&_button]:min-h-11 [&_button]:min-w-11 [&_a]:inline-flex [&_a]:min-h-11 [&_a]:min-w-11 [&_a]:items-center [&_a]:justify-center [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-ring"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              {compactActionCell}
                            </div>
                          )}
                          {trailingCells.length > 0 && (
                            <div data-mobile-slot="trailing" className="flex max-w-full flex-col items-end gap-1 overflow-hidden whitespace-nowrap">
                              {trailingCells.map((cell, ti) => (
                                <div key={ti} className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap [&>*]:max-w-full [&_*]:min-w-0">
                                  {cell}
                                </div>
                              ))}
                            </div>
                          )}
                          {signalCells.length > 0 && (
                            <div data-mobile-slot="signals" className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
                              {signalCells.map((cell, si) => (
                                <span key={si} className="inline-flex shrink-0 items-center">
                                  {cell}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {actionCells.length > 0 && (
                        <div
                          data-mobile-slot="action"
                          className="col-span-full row-start-2 mt-2 min-w-0 space-y-2 [&>*]:max-w-full [&_*]:min-w-0"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {actionCells.map((cell, ai) => <div key={ai}>{cell}</div>)}
                        </div>
                      )}
                    </div>
                  </div>
                  {isExpanded && renderExpanded && (
                    <div className="px-3.5 py-3 bg-muted/20">
                      {renderExpanded(row)}
                    </div>
                  )}
                </Fragment>
              )
            })
          )}
      </Surface>

      {!serverMode && clientPageSize && allRows.length > clientPageSize && (
        // Visible on every width (R-UX-030): hiding paging on phone made rows
        // beyond page 1 unreachable. Compact icon labels below md. When the
        // phone list is collapsed to the selected record, the pager hides with
        // it (below md only — desktop keeps its pager).
        <div className={(mobileCollapsed ? 'hidden md:flex' : 'flex') + ' items-center justify-between pt-1 text-sm text-muted-foreground'}>
          <span>Page {safePage} of {totalPages}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
            >
              <ChevronLeft className="size-3.5" />
              <span className="hidden md:inline">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={safePage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            >
              <span className="hidden md:inline">Next</span>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {serverMode && serverPagination && serverPagination.totalCount > serverPagination.pageSize && (
        // Server-driven paging: Prev/Next write `?page=` and the page re-queries.
        <div className={(mobileCollapsed ? 'hidden md:flex' : 'flex') + ' items-center justify-between pt-1 text-sm text-muted-foreground'}>
          <span className="min-w-0 truncate">Page {serverPage} of {serverTotalPages} · {serverPagination.totalCount} total</span>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={serverPage <= 1}
              onClick={() => goToServerPage(serverPage - 1)}
            >
              <ChevronLeft className="size-3.5" />
              <span className="hidden md:inline">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={serverPage >= serverTotalPages}
              onClick={() => goToServerPage(serverPage + 1)}
            >
              <span className="hidden md:inline">Next</span>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
