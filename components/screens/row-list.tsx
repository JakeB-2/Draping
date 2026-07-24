'use client'

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronDown, ChevronsDownUp, ChevronsUpDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DetailPaneHeader } from './detail-pane-header'
import { OverlaySurfaceContext } from './overlay-surface'
import { Surface } from './surface'
import { cn } from '@/lib/utils'
import { isEmptyCell } from '@/components/tables/table-cells'
import { tieredRowShapeWarning } from '@/lib/calculations/tiered-row-shape'

// Shared by SectionStack and its child RowLists. `openTarget`/`nonce` drive the
// collapse-all broadcast (RowLists re-sync their open state when nonce changes).
// A RowList that finds this context knows it lives inside a SectionStack and so
// stays boxless — the stack owns the single box (its `boxed` prop). The box lives
// on the stack, never per-section, so sections never nest a card-in-a-card.
const SectionStackCtx = React.createContext<{
  openTarget: boolean
  nonce: number
  // True when any reporting collapsible section is currently open. Exposed so a
  // descendant-hosted collapse-all toggle (see `SectionStackCollapseAll`) can
  // show the right label without re-deriving the state.
  anyOpen: boolean
  // Broadcast collapse-all / expand-all to every descendant RowList. Exposed so
  // the toggle can live on a section's title row even when the sections stream
  // behind a <Suspense> (where SectionStack can't see them to inject it itself).
  toggleAll: () => void
  // Collapsible children report their open state so the collapse-all toggle can
  // prefer "collapse" whenever ANY section is open (including a mixed state).
  reportOpen: (id: string, open: boolean) => void
  unregister: (id: string) => void
} | null>(null)

// Tracks how deeply a RowList is nested inside other RowLists. The body accent
// pill only shows when a section is NESTED (depth > 0) — i.e. a recursive child
// like line-staff — so a top-level section carries no pill while its nested
// children do. No per-section/bespoke flags needed.
const RowListDepthContext = React.createContext(0)

export const ROW_GRID = 'grid items-center gap-3 px-3'

// Fixed grid track for a trailing row-actions (⋯) column. 2.25rem = 36px, the
// `touch:size-9` max of RowActionsMenu's icon-sm trigger; the 32px desktop
// button centers in it with 2px slack. Use THIS (not 'max-content') for actions
// columns: a max-content track resolves independently per grid, so a header row
// (empty actions cell → 0px) and its data rows (32px button) get different
// column widths and the last labeled header drifts right of its values.
export const ROW_ACTIONS_TRACK = '2.25rem'

export type RowListVariant = 'card' | 'plain'

// Width-stable Collapse-all / Expand-all toggle. The two labels are stacked in a
// single grid cell so the button keeps the wider label's width and never resizes
// on toggle. Used inline on the first section in flush mode.
function CollapseAllToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 text-micro text-muted-foreground transition-colors hover:text-foreground"
    >
      {expanded ? <ChevronsDownUp className="size-3" /> : <ChevronsUpDown className="size-3" />}
      <span className="grid justify-items-start">
        <span aria-hidden className="invisible col-start-1 row-start-1">Collapse all</span>
        <span className="col-start-1 row-start-1">{expanded ? 'Collapse all' : 'Expand all'}</span>
      </span>
    </button>
  )
}

// Collapse-all / expand-all toggle wired to the surrounding SectionStack via
// context. Render it inside a descendant section's `titleAction` (e.g. the
// first section's title row) to host the shared control there. This is the
// escape hatch for when the sections stream behind a single <Suspense> — the
// SectionStack can't see its section children to inject the inline toggle
// itself (`items.length === 1`), so a section hosts it from inside instead.
// Renders nothing outside a SectionStack.
export function SectionStackCollapseAll() {
  const group = React.useContext(SectionStackCtx)
  if (!group) return null
  return <CollapseAllToggle expanded={group.anyOpen} onToggle={group.toggleAll} />
}

// A vertical stack of collapsible RowList sections sharing ONE collapse-all
// control and ONE collapse-all broadcast (via SectionStackCtx — children re-sync
// their open state when the user toggles all). The body is identical in both
// modes — borderless, edge-pulled (`-mx-3`) hairline-separated sections with the
// Collapse-all toggle riding on the FIRST section's title row (accordion-standard
// placement). This is the booking-detail grammar. Neither mode draws a box — the
// difference is only the header:
//   - default: a boxless titled header (title / subtitle / badges / actions) that
//     sits flush to the edge of the outer shell (the split-pane aside or the
//     WorkspaceShell side rail, both borderless). The panel no longer wraps itself
//     in its own card — it reads as one flat section-stack like the booking body.
//     Callers that genuinely need a card-on-a-page (dashboard summaries, the My
//     Portal form) wrap the SectionStack in <Surface> themselves.
//   - flush: no header at all — the host (a drawer Sheet) supplies the title
//     chrome and the edge padding. Used for drawer detail bodies (the booking).
export function SectionStack({
  title,
  subtitle,
  badges,
  progress,
  actions,
  defaultExpanded = true,
  flush = false,
  boxed = false,
  mobileFlush,
  collapseAllInHeader = false,
  children,
  className,
  helpArticleId,
}: {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  badges?: React.ReactNode
  /** Sanctioned status strip / stepper (R-UX-036), full-width below the title
   *  row — see DetailPaneHeader's `progress` slot. */
  progress?: React.ReactNode
  actions?: React.ReactNode
  defaultExpanded?: boolean
  /** Edge-pulled, headerless drawer canvas (see component note). */
  flush?: boolean
  /** Card-on-a-page: wrap the (default-mode) stack in the canonical `<Surface>`
   *  box (rounded-lg + border) instead of leaving it boxless. Use on dashboard /
   *  My Portal / settings-overview / wizard-review surfaces that need a card on a
   *  tinted page — replaces hand-wrapping the SectionStack in `<Surface>`. No
   *  effect in `flush` mode (the host drawer supplies the box). For an elevated
   *  or tinted box, hand-wrap in `<Surface elevated|tinted>` instead. */
  boxed?: boolean
  /** Phone-only near-full-bleed: eat most of the page's `px-4` gutter so the
   *  panel (header + sections) reclaims that width for data, keeping a slim 4px
   *  breathing gutter to the screen edges. Desktop (`md+`) is unchanged. Use on
   *  a split-view detail panel that fills the phone viewport. */
  mobileFlush?: boolean
  /** Render the collapse-all toggle in the card header (next to actions) instead
   *  of inline on the first section's title row. Use when the sections stream
   *  behind a single <Suspense> (so there's no first-section title row to host
   *  the inline toggle) — the broadcast still reaches every descendant RowList. */
  collapseAllInHeader?: boolean
  children: React.ReactNode
  className?: string
  /** Override the route-derived help article. Pass null to hide the icon. */
  helpArticleId?: string | null
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const [nonce, setNonce] = React.useState(0)
  const inOverlay = React.useContext(OverlaySurfaceContext)

  // Collapsible children register their open state here so the toggle knows
  // whether ANY section is currently open. Stable callbacks (no deps) keep child
  // reporting effects from re-firing on every parent render.
  const [openStates, setOpenStates] = React.useState<Record<string, boolean>>({})
  const reportOpen = React.useCallback((id: string, open: boolean) => {
    setOpenStates((current) => (current[id] === open ? current : { ...current, [id]: open }))
  }, [])
  const unregister = React.useCallback((id: string) => {
    setOpenStates((current) => {
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])
  const anyOpen = Object.values(openStates).some(Boolean)

  function toggleAll() {
    // Prefer collapse: open everything only when every section is already
    // closed; any open section (including a mixed state) collapses all.
    setExpanded(!anyOpen)
    setNonce((current) => current + 1)
  }

  // Inject the Collapse-all toggle onto the first section's titleAction — only
  // when there's more than one section to collapse. When the caller opts into
  // `collapseAllInHeader` (streamed sections behind one <Suspense>), the toggle
  // rides the card header instead and inline injection is skipped.
  const items = React.Children.toArray(children).filter(React.isValidElement)
  const headerToggle = collapseAllInHeader
    ? <CollapseAllToggle expanded={anyOpen} onToggle={toggleAll} />
    : null
  const inlineToggle = !collapseAllInHeader && items.length > 1
    ? <CollapseAllToggle expanded={anyOpen} onToggle={toggleAll} />
    : null
  const rendered = inlineToggle
    ? items.map((child, index) => {
        if (index !== 0) return child
        const el = child as React.ReactElement<{ titleAction?: React.ReactNode }>
        const existing = el.props.titleAction
        return React.cloneElement(el, {
          titleAction: existing ? (<>{existing}{inlineToggle}</>) : inlineToggle,
        })
      })
    : items

  const body = <div className="-mx-3 hairline-rows">{rendered}</div>

  if (flush) {
    return (
      <SectionStackCtx.Provider value={{ openTarget: expanded, nonce, anyOpen, toggleAll, reportOpen, unregister }}>
        <div className={cn('-mx-3 hairline-rows', className)}>{rendered}</div>
      </SectionStackCtx.Provider>
    )
  }

  const hasHeader =
    title != null || subtitle != null || badges != null || actions != null || progress != null

  // Non-boxed SectionStack IS the detail-pane grammar (split-pane aside / side
  // rail), so it bleeds to the phone screen edges by default to reclaim the
  // page's px-4 gutter (R-UX: full-width detail on mobile). Boxed card stacks
  // (dashboard / settings / wizard-review) must stay inset. The bleed default
  // is scoped to PAGE surfaces only: inside an overlay (drawer / sheet / compact
  // editor, signalled via OverlaySurfaceContext) there is no page gutter to eat,
  // so `-mx-3` would hang the stack off the screen edge — overlays default to
  // no bleed. Any caller can still force it either way explicitly.
  const effectiveMobileFlush = mobileFlush ?? (!boxed && !inOverlay)

  const content = (
    <div className={cn(effectiveMobileFlush && '-mx-3 md:mx-0', className)}>
      {hasHeader && (
        // The header itself is the shared record-header grammar (R-UX-036).
        <DetailPaneHeader
          title={title}
          subtitle={subtitle}
          badges={badges}
          progress={progress}
          actions={
            actions || headerToggle ? (
              <>
                {headerToggle}
                {actions}
              </>
            ) : undefined
          }
          helpArticleId={helpArticleId}
          mobileFlush={effectiveMobileFlush}
        />
      )}
      {/* px-3 so the body's -mx-3 pulls each section flush to the rail edge —
          the same edge-pulled hairline grammar the booking drawer body uses. */}
      <div className="px-3 py-1.5">{body}</div>
    </div>
  )

  return (
    <SectionStackCtx.Provider value={{ openTarget: expanded, nonce, anyOpen, toggleAll, reportOpen, unregister }}>
      {/* `boxed` wraps the stack in the canonical Surface box so dashboard /
          settings / wizard-review surfaces stop hand-rolling their own card. */}
      {boxed ? <Surface>{content}</Surface> : content}
    </SectionStackCtx.Provider>
  )
}

export function RowList({
  title,
  titleAction,
  titleMeta,
  collapsedMeta,
  count,
  flush = false,
  collapsible = flush,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  header,
  footer,
  children,
  divided = !flush,
  variant = flush ? 'plain' : 'card',
  elevated = false,
  bodyPill = true,
  indentBody = true,
  className,
  bodyClassName,
  titleClassName,
}: {
  title?: React.ReactNode
  titleAction?: React.ReactNode
  titleMeta?: React.ReactNode
  /** Summary shown in the title row ONLY while the section is collapsed (e.g. a
   *  price total or first few names). Hidden when expanded so the body carries
   *  the detail. Requires `collapsible`. */
  collapsedMeta?: React.ReactNode
  count?: number
  /** The flush detail-body section preset: `variant="plain" divided={false}
   *  collapsible` in one knob, so the default lives here instead of being
   *  copy-pasted per panel. Explicit props still win. */
  flush?: boolean
  collapsible?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  header?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  divided?: boolean
  variant?: RowListVariant
  /** Card variant only: lift via shadow instead of a border (border XOR lift).
   *  Use on a tinted canvas (e.g. the detail-drawer body) so the card floats. */
  elevated?: boolean
  /** Suppress the body accent pill (keep the indent). Use when this section's
   *  rows carry their OWN nested pill (e.g. line-staff) so only one pill layer
   *  shows at a time. */
  bodyPill?: boolean
  /** Indent the body under the title (the `pl-4 md:pl-8` row-grammar indent that lines
   *  rows up past the chevron/pill). Turn OFF for freeform bodies — a nested
   *  DataTable, image, or block — so they sit flush under the section title
   *  instead of being pushed in like a data row. */
  indentBody?: boolean
  className?: string
  bodyClassName?: string
  /** Override the title row's text-size utility (default `text-sm`). Every
   *  other RowList/ActivityRowList/etc. consumer is unaffected — only pass
   *  this at a specific call site that needs a different scale (e.g. Items
   *  "Recent movements"). */
  titleClassName?: string
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const open = controlledOpen ?? uncontrolledOpen
  const bodyShown = !collapsible || open
  const plain = variant === 'plain'
  const group = React.useContext(SectionStackCtx)
  const depth = React.useContext(RowListDepthContext)
  const isNested = depth > 0
  const firstSync = React.useRef(true)
  const reportId = React.useId()

  React.useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false
      return
    }
    if (group) setOpen(group.openTarget)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.nonce])

  // Report this section's open state up to the SectionStack so its collapse-all
  // toggle can prefer "collapse" whenever any section is open. Only collapsible
  // sections participate (a non-collapsible section is always open and can't be
  // toggled). Deregister on unmount so a removed section doesn't pin anyOpen.
  const reportOpen = group?.reportOpen
  const unregister = group?.unregister
  React.useEffect(() => {
    if (collapsible) reportOpen?.(reportId, open)
  }, [collapsible, open, reportOpen, reportId])
  React.useEffect(() => {
    return () => {
      if (collapsible) unregister?.(reportId)
    }
  }, [collapsible, unregister, reportId])

  function setOpen(next: boolean) {
    if (controlledOpen === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  // Only separate the title from the body when the body is actually shown —
  // otherwise a closed section's title border stacks on the inter-section
  // divider below it.
  const titleBorder = bodyShown ? 'hairline-b' : undefined
  const titleText = (
    <span className={cn('truncate font-semibold', titleClassName ?? 'text-sm')}>
      {title}
      {count != null && (
        <span className="ml-1.5 text-micro font-normal tabular-nums text-muted-foreground">({count})</span>
      )}
    </span>
  )

  return (
    <div
      className={cn(
        // `variant` only draws a box when this RowList is STANDALONE (no
        // SectionStack parent). Inside a SectionStack every section is boxless —
        // the stack owns the single box (see SectionStack's `boxed`) and its
        // sections stay flat so we never nest a card-in-a-card. So the card
        // variant lifts (shadow when `elevated`) or borders only when standalone.
        !plain && !group && (elevated
          ? 'overflow-hidden rounded-lg bg-card shadow-[var(--elevation-raised)]'
          : 'overflow-hidden rounded-lg border bg-card'),
        className,
      )}
    >
      {/* No py here: min-h-10 + items-center keeps every title bar a uniform
          height whether it holds plain text or a taller action button. */}
      {title != null && (
        <div className={cn('relative flex min-h-10 items-center justify-between gap-2 px-3', titleBorder)}>
          {/* Header accent pill — left-justified at the row edge, rounded + padded. */}
          <span aria-hidden className="pointer-events-none absolute inset-y-2 left-1.5 w-[3px] rounded-full bg-primary" />
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
                aria-hidden
              />
              {titleText}
              {titleMeta && <span className="ml-auto shrink-0 whitespace-nowrap text-micro text-muted-foreground">{titleMeta}</span>}
              {collapsedMeta != null && !open && (
                <span className={cn('text-micro text-muted-foreground', !titleMeta && 'ml-auto')}>{collapsedMeta}</span>
              )}
            </button>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {titleText}
              {titleMeta && <span className="ml-auto shrink-0 whitespace-nowrap text-micro text-muted-foreground">{titleMeta}</span>}
            </span>
          )}
          {titleAction && <div className="shrink-0">{titleAction}</div>}
        </div>
      )}
      {bodyShown && (
        // Children render one nesting level deeper, so a RowList rendered inside
        // another (a recursive child) knows it's nested and shows its pill.
        <RowListDepthContext.Provider value={depth + 1}>
          {(title != null || header != null || footer != null) && indentBody ? (
            // Headered section: indent the content (header, rows, footer). The
            // teal accent pill runs the body range ONLY when this section is
            // itself nested — so only the deepest layer carries a pill.
            // `footer` is included so a footer-only list (e.g. a nested
            // line-staff editor whose column header only appears once it has
            // rows) keeps its Add button at the same indent when empty — the
            // button must not jump left/right as the first row is added.
            // Phone halves the indent (pl-4) — it compounds per nesting level
            // and 2rem a level eats too much of a narrow viewport.
            <div className="relative pl-4 md:pl-8">
              {bodyPill && isNested && (
                <span aria-hidden className="pointer-events-none absolute inset-y-1.5 left-4 w-[3px] rounded-full bg-primary md:left-8" />
              )}
              {header}
              <div className={cn(divided && 'hairline-rows', bodyClassName)}>{children}</div>
              {footer}
            </div>
          ) : (
            <>
              {header}
              <div className={cn(divided && 'hairline-rows', bodyClassName)}>{children}</div>
              {footer}
            </>
          )}
        </RowListDepthContext.Provider>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Tiered read-only rows (R-UX-038) — the RowList-family analogue of DataTable's
// `mobile:` slot model. A caller declares each COLUMN once (desktop grid track +
// phone receipt role) and each row's cell CONTENT once, and `TieredRowList`
// renders BOTH the md+ grid row AND the below-md stacked receipt card from that
// single declaration — no more hand-written `hidden md:grid` + `md:hidden` dual
// JSX (the drift-prone shape in the old InvoiceLinesSection / WorkEntryRoles /
// ShipmentLines rows). Interactive cell content (buttons, links, ⋯ menus, badges)
// works in any role because cells are rendered as-is into both contexts.
//
// Mobile roles mirror DataTable's card slots:
//   title    — bold anchor line (text-sm font-semibold), one per row
//   subtitle — muted, inline after the title with a `·` separator
//   tertiary — muted, own line under the title/subtitle
//   right    — right-aligned receipt column (numbers / status), stacks if many
//   hidden   — cell omitted on phone (still renders in the desktop grid)
//
// The desktop grid track comes from `track` (any CSS grid-template-columns value:
// 'minmax(0,1.4fr)', 'max-content', '64px', …). The column header row is rendered
// automatically and hidden below md. Grid tracks are applied via inline style
// (not a `grid-cols-[…]` Tailwind class) so a migrated caller carries NO wide
// `grid-cols-[…]` literal — which is exactly what `lint:rowlist-mobile` keys on.

export type RowTierRole = 'title' | 'subtitle' | 'tertiary' | 'right' | 'hidden'

export type RowTierColumn = {
  /** md+ column header label. Omit for an unlabeled column (e.g. actions). */
  header?: React.ReactNode
  /** Desktop grid track: any CSS grid-template-columns value
   *  ('minmax(0,1.4fr)', 'max-content', '64px', 'auto'). Beware 'max-content'
   *  on columns whose content differs between the header grid and row grids —
   *  they are SEPARATE grids sharing only this template string, so the track
   *  resolves per-grid and the header can misalign with its values. Trailing
   *  ⋯ actions columns should use `ROW_ACTIONS_TRACK`. */
  track: string
  /** Phone receipt-card role. 'hidden' drops the cell on phone only. */
  mobile: RowTierRole
  /** Right-align the desktop cell + its header (numbers, status, actions). */
  align?: 'left' | 'right'
  /** Extra classes for the DESKTOP grid cell (e.g. 'truncate',
   *  'text-muted-foreground', 'tabular-nums text-meta'). */
  cellClassName?: string
  /** Extra classes for the PHONE cell (rarely needed — roles style themselves). */
  mobileClassName?: string
  /** Extra classes for the desktop header cell. */
  headerClassName?: string
}

export type TieredRowData = {
  key: React.Key
  /** Cell content in the SAME order as `columns`. Keep content semantic (a
   *  value or an interactive element) — the primitive owns desktop-vs-phone
   *  styling per the column's role. */
  cells: React.ReactNode[]
  /** Extra classes applied to both the desktop row and the phone card. */
  className?: string
}

// Em-dash placeholders read fine in the desktop grid but leave dangling "· —"
// fragments on the phone card, so treat them as absent in the secondary slots
// (title keeps its cell so the card never loses its anchor). Mirrors
// DataTable's `presentOrNull` — `isEmptyCell` catches both the literal '—'
// string and `data-empty-cell`-stamped JSX (MoneyCell/DateCell/CountCell).
function presentOnPhone(v: React.ReactNode) {
  return v == null || isEmptyCell(v) ? null : v
}

function TieredRow({
  columns,
  cells,
  className,
  rowKey,
}: {
  columns: RowTierColumn[]
  cells: React.ReactNode[]
  className?: string
  /** The row's list `key` (not readable via props normally — React reserves
   *  `key` — so TieredRowList passes it through separately for the dev-mode
   *  shape-mismatch warning below). */
  rowKey?: React.Key
}) {
  if (process.env.NODE_ENV !== 'production') {
    const warning = tieredRowShapeWarning(columns.length, cells.length, rowKey)
    if (warning) console.error(warning)
  }

  const gridTemplateColumns = columns.map((c) => c.track).join(' ')

  // Phone: bucket cells by role in column order.
  const titleCells: React.ReactNode[] = []
  const subtitleCells: React.ReactNode[] = []
  const tertiaryCells: React.ReactNode[] = []
  const rightCells: React.ReactNode[] = []
  columns.forEach((col, i) => {
    const value = cells[i]
    switch (col.mobile) {
      case 'title':
        if (value != null) titleCells.push(<span key={i} className={cn('truncate', col.mobileClassName)}>{value}</span>)
        break
      case 'subtitle': {
        const v = presentOnPhone(value)
        if (v != null) subtitleCells.push(v)
        break
      }
      case 'tertiary': {
        const v = presentOnPhone(value)
        if (v != null) tertiaryCells.push(v)
        break
      }
      case 'right':
        // Receipt-column cells are short by construction and never truncate on
        // conforming content; nowrap + max-w-full pair with the stack's 45%
        // safety cap below so a non-conforming cell ellipsizes instead of
        // overlapping the title (mirrors DataTable's card geometry).
        if (value != null) rightCells.push(<span key={i} className={cn('max-w-full truncate whitespace-nowrap', col.mobileClassName)}>{value}</span>)
        break
      // 'hidden' → omitted on phone.
    }
  })

  return (
    <>
      {/* ── DESKTOP grid row (≥ md) ── */}
      <div
        className={cn('hidden min-h-9 items-center gap-3 px-3 py-1.5 text-dense md:grid', className)}
        style={{ gridTemplateColumns }}
      >
        {columns.map((col, i) => (
          <div key={i} className={cn('min-w-0', col.align === 'right' && 'text-right', col.cellClassName)}>
            {cells[i]}
          </div>
        ))}
      </div>

      {/* ── PHONE receipt card (< md) ── keeps the InvoiceLinesSection look:
          bold title line, muted subtitle/tertiary, right-aligned receipt column. */}
      <div className={cn('flex min-h-11 items-start gap-3 px-3 py-2.5 text-dense md:hidden', className)}>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            {titleCells}
            {subtitleCells.map((v, i) => (
              <React.Fragment key={`sub-${i}`}>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">·</span>
                <span className="truncate text-dense font-normal text-muted-foreground">{v}</span>
              </React.Fragment>
            ))}
          </div>
          {tertiaryCells.map((v, i) => (
            <p key={`ter-${i}`} className="mt-0.5 truncate text-xs text-muted-foreground">{v}</p>
          ))}
        </div>
        {rightCells.length > 0 && (
          // max-w-[45%] is a safety net only (same rule as DataTable's phone
          // card): the left column absorbs all squeeze, so the cap should
          // never bind on conforming (short) receipt content.
          <div className="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5 text-right text-meta tabular-nums text-muted-foreground">
            {rightCells}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Read-only row table with a single per-cell declaration that renders as a
 * desktop grid (md+) and a stacked phone receipt card (below md). Drop it inside
 * an existing RowList/SectionStack body in place of a hand-rolled
 * `RowListHeader` + `ROW_GRID` map. See the block comment above for the role
 * model and why it satisfies `lint:rowlist-mobile`.
 *
 * @example
 * <TieredRowList
 *   columns={[
 *     { header: 'Certification', track: 'minmax(0,1.4fr)', mobile: 'title', cellClassName: 'truncate' },
 *     { header: 'Course', track: 'minmax(0,1fr)', mobile: 'subtitle', cellClassName: 'truncate text-muted-foreground' },
 *     { header: 'Agency', track: 'minmax(0,0.8fr)', mobile: 'tertiary', cellClassName: 'truncate text-muted-foreground' },
 *     { header: 'Date', track: 'max-content', mobile: 'right', align: 'right', cellClassName: 'text-meta tabular-nums text-muted-foreground whitespace-nowrap' },
 *     { track: 'max-content', mobile: 'right', align: 'right' },
 *   ]}
 *   rows={data.map((row) => ({
 *     key: row.id,
 *     cells: [row.title, row.course ?? '—', row.agency ?? '—', formatDate(row.date), <Badge>{row.status}</Badge>],
 *   }))}
 *   empty={<RowListEmpty>No records yet.</RowListEmpty>}
 * />
 */
export function TieredRowList({
  columns,
  rows,
  empty,
  showHeader = true,
  className,
}: {
  columns: RowTierColumn[]
  rows: TieredRowData[]
  /** Rendered inside the body when `rows` is empty (e.g. `<RowListEmpty>`). */
  empty?: React.ReactNode
  /** Show the md+ column-header row (hidden below md automatically). */
  showHeader?: boolean
  className?: string
}) {
  const gridTemplateColumns = columns.map((c) => c.track).join(' ')
  const hasHeaderText = columns.some((c) => c.header != null && c.header !== '')

  return (
    <div className={className}>
      {showHeader && hasHeaderText && rows.length > 0 && (
        // Header is desktop-only: the phone card carries its own labels via the
        // title/subtitle receipt layout. Tinted band matches RowListHeader.
        <div className="relative hidden md:block">
          <div aria-hidden className="absolute inset-y-0 left-0 right-0 bg-surface-header" />
          <div
            className="relative grid h-8 items-center gap-3 px-3 hairline-b text-micro font-semibold uppercase tracking-[0.04em] text-muted-foreground"
            style={{ gridTemplateColumns }}
          >
            {columns.map((col, i) => (
              <span key={i} className={cn(col.align === 'right' && 'text-right', col.headerClassName)}>
                {col.header}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="hairline-rows">
        {rows.length === 0 && empty}
        {rows.map((row) => (
          <TieredRow key={row.key} rowKey={row.key} columns={columns} cells={row.cells} className={row.className} />
        ))}
      </div>
    </div>
  )
}

export function RowListHeader({
  className,
  style,
  children,
  tinted = true,
  tintInsetClassName,
  textClassName,
}: {
  className?: string
  /** Inline styles for the grid row — pass `gridTemplateColumns` here when the
   *  column template is shared as a plain CSS string (e.g. a track list built
   *  from `ROW_ACTIONS_TRACK`) instead of a Tailwind `grid-cols-[…]` literal. */
  style?: React.CSSProperties
  children: React.ReactNode
  tinted?: boolean
  /**
   * Inset the tinted fill from the left (e.g. `left-7` to clear a leading
   * chevron/icon column) so the column-label band lines up with the rows'
   * data and reads as belonging to them — not as an extension of the title
   * bar above. The grid itself still spans full width so columns stay aligned.
   */
  tintInsetClassName?: string
  /** Override the header row's text-size utility (default `text-micro`).
   *  Every other consumer is unaffected — only pass this at a specific call
   *  site that needs a different scale (e.g. Items "Recent movements"). */
  textClassName?: string
}) {
  return (
    <div className="relative">
      {tinted && (
        <div
          aria-hidden
          className={cn('absolute inset-y-0 right-0 bg-surface-header', tintInsetClassName ?? 'left-0')}
        />
      )}
      <div
        className={cn(
          ROW_GRID,
          'relative h-8 hairline-b font-semibold uppercase tracking-[0.04em] text-muted-foreground',
          textClassName ?? 'text-micro',
          className,
        )}
        style={style}
      >
        {children}
      </div>
    </div>
  )
}

export const RowListAddButton = React.forwardRef<
  HTMLButtonElement,
  {
    label: string
    onClick?: () => void
    indentClassName?: string
  } & React.ComponentPropsWithoutRef<'button'>
>(function RowListAddButton({ label, onClick, indentClassName, className, ...props }, ref) {
  // forwardRef + prop spread so it can back a DropdownMenuTrigger asChild
  // (e.g. acc-doc "Add line" opens a line-type picker) while staying the same
  // visual add-row affordance everywhere else.
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 w-full items-center gap-1.5 hairline-t pr-3 text-dense text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground',
        indentClassName ?? 'pl-3',
        className,
      )}
      {...props}
    >
      <Plus className="size-3.5" />
      {label}
    </button>
  )
})

export function RowListEmpty({
  children,
  textClassName,
}: {
  children: React.ReactNode
  /** Override the empty-state text-size utility (default `text-sm`). Every
   *  other consumer is unaffected. */
  textClassName?: string
}) {
  return <p className={cn('px-3 py-3 text-muted-foreground', textClassName ?? 'text-sm')}>{children}</p>
}

// Opt-in `stackBelow` reflow, expressed PURELY as `max-{bp}:` overrides layered
// on top of the unchanged default grid classes. At/above the breakpoint none of
// the `max-*` variants apply, so the row renders byte-identically to the default
// (grid) path — including any caller `className` override. BELOW the breakpoint
// the row flips to a full-width stacked column (auto height) so each child wraps
// to its own line. Keeping the grid path as the base (not a prefixed restore)
// guarantees desktop is untouched and that a caller's height/padding overrides
// still win there.
const STACK_OVERRIDES = {
  sm: 'max-sm:flex max-sm:flex-col max-sm:items-stretch max-sm:gap-2 max-sm:h-auto',
  md: 'max-md:flex max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:h-auto',
} as const

export function InlineEditRow({
  columnsClassName,
  children,
  className,
  stackBelow,
}: {
  columnsClassName: string
  children: React.ReactNode
  className?: string
  /** Opt-in responsive reflow. When set, the row keeps the default grid
   *  AT/ABOVE the breakpoint and flips to a `flex flex-col` stacked column
   *  (each child full-width, auto height) BELOW it via `max-{bp}:` overrides.
   *  Omitted = today's always-grid behavior — leave it unset for grid-only
   *  callers (acc-doc / price / shipment lines). Pair stacked cells with
   *  `<InlineEditField label>` so each gets a label below the breakpoint (the
   *  grid relies on a separate header row for labels). */
  stackBelow?: 'sm' | 'md'
}) {
  return (
    <div
      className={cn(
        ROW_GRID,
        columnsClassName,
        'h-11 bg-primary/[0.03]',
        stackBelow && STACK_OVERRIDES[stackBelow],
        className,
      )}
    >
      {children}
    </div>
  )
}

// Literal class maps (not template strings) so Tailwind's source scanner sees
// every full class name — `md:contents` / `sm:contents` / `md:hidden` /
// `sm:hidden` would otherwise never be generated.
const FIELD_WRAPPER_AT_BP = {
  sm: 'sm:contents',
  md: 'md:contents',
} as const
const FIELD_LABEL_HIDE_AT_BP = {
  sm: 'sm:hidden',
  md: 'md:hidden',
} as const

// Stacked-cell wrapper for an `InlineEditRow` with `stackBelow`. Below the
// breakpoint it stacks a small field label ABOVE its child cell so phone users
// see the "Date / Resource / Detail / Price" labels the grid omits (the grid
// puts those in a separate header row). AT/ABOVE the breakpoint the wrapper
// collapses to `display:contents` and the label is `hidden`, so the WRAPPED CELL
// becomes the direct grid child again — desktop layout is identical to an
// un-wrapped cell. Wrap each cell child of a `stackBelow` InlineEditRow.
export function InlineEditField({
  label,
  stackBelow,
  children,
  className,
}: {
  label: React.ReactNode
  stackBelow: 'sm' | 'md'
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', FIELD_WRAPPER_AT_BP[stackBelow], className)}>
      {label !== '' && label != null && (
        <span
          className={cn(
            'text-micro font-medium uppercase tracking-[0.04em] text-muted-foreground',
            FIELD_LABEL_HIDE_AT_BP[stackBelow],
          )}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  )
}

export function InlineEditInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  // h-7 dense on pointer; floored to h-9 (~36px) on touch-capable devices.
  return <Input {...props} className={cn('h-7 touch:h-9 px-2 text-dense', className)} />
}

export function InlineEditActions({
  onSave,
  onCancel,
  saveLabel = 'Save row',
  cancelLabel = 'Cancel',
}: {
  onSave: () => void
  onCancel: () => void
  saveLabel?: string
  cancelLabel?: string
}) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button type="button" variant="ghost" size="icon-sm" onClick={onSave} aria-label={saveLabel}>
        <CheckCircle2 className="size-3.5 text-[var(--color-success)]" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label={cancelLabel}>
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

export type LinkedRow = {
  icon?: React.ReactNode
  name: React.ReactNode
  meta?: React.ReactNode
  href?: string
  onClick?: () => void
  actions?: React.ReactNode
}

export function LinkedRowList({
  title,
  headerAction,
  viewAllHref,
  viewAllLabel = 'View all',
  rows,
  emptyMessage = 'None linked.',
  addLabel,
  addIndentClassName,
  onAdd,
  collapsible,
  defaultOpen,
  variant,
  indentBody,
  className,
}: {
  title: React.ReactNode
  headerAction?: React.ReactNode
  viewAllHref?: string
  viewAllLabel?: string
  rows: LinkedRow[]
  emptyMessage?: string
  addLabel?: string
  addIndentClassName?: string
  onAdd?: () => void
  collapsible?: boolean
  defaultOpen?: boolean
  variant?: RowListVariant
  /** Forwarded to the inner RowList. Pass false to sit flush under the section
   *  title inside a flushed detail SectionStack (R-UX-025). Defaults to RowList's
   *  indented body, so existing call sites are unaffected. */
  indentBody?: boolean
  className?: string
}) {
  const titleAction = (
    <>
      {headerAction}
      {/* Cross-record navigation reads accent-2, like RecordLink (R-UX-044). */}
      {viewAllHref && (
        <Link href={viewAllHref} className="text-micro text-accent-2 hover:underline">
          {viewAllLabel}
        </Link>
      )}
    </>
  )

  return (
    <RowList
      className={className}
      title={title}
      titleAction={headerAction || viewAllHref ? titleAction : undefined}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      variant={variant}
      indentBody={indentBody}
      footer={addLabel ? <RowListAddButton label={addLabel} indentClassName={addIndentClassName} onClick={onAdd} /> : null}
    >
      {rows.length === 0 && <RowListEmpty>{emptyMessage}</RowListEmpty>}
      {rows.map((row, index) => <LinkedRowItem key={index} row={row} />)}
    </RowList>
  )
}

export function LinkedRowItem({ row }: { row: LinkedRow }) {
  const inner = (
    <>
      {row.icon !== undefined && (
        <div className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--surface-3)] text-muted-foreground">
          {row.icon}
        </div>
      )}
      <div className="min-w-0 flex-1 truncate">{row.name}</div>
      {row.meta !== undefined && (
        <div className="shrink-0 text-micro text-muted-foreground">{row.meta}</div>
      )}
      {row.actions && <div className="flex shrink-0 items-center gap-0.5">{row.actions}</div>}
    </>
  )
  const base = 'flex min-h-9 items-center gap-2 px-3 py-1.5 text-dense'

  if (row.href && !row.actions) {
    return <Link href={row.href} className={cn(base, 'transition-colors hover:bg-accent/40')}>{inner}</Link>
  }
  if (row.onClick && !row.actions) {
    return (
      <button type="button" onClick={row.onClick} className={cn(base, 'w-full text-left transition-colors hover:bg-accent/40')}>
        {inner}
      </button>
    )
  }
  return <div className={base}>{inner}</div>
}

export type ActionRow = {
  icon?: React.ReactNode
  title: React.ReactNode
  detail?: React.ReactNode
  tone?: 'default' | 'primary' | 'warning' | 'danger'
  actions?: React.ReactNode
}

const ACTION_TONE_CHIP: Record<NonNullable<ActionRow['tone']>, string> = {
  default: 'bg-[var(--surface-3)] text-muted-foreground',
  primary: 'bg-[var(--primary-soft)] text-primary',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]',
}

export function ActionRowList({
  title,
  rows,
  className,
  collapsible,
  defaultOpen,
  variant,
  indentBody,
}: {
  title: React.ReactNode
  rows: ActionRow[]
  className?: string
  collapsible?: boolean
  defaultOpen?: boolean
  variant?: RowListVariant
  /** Forwarded to the inner RowList (R-UX-025 flush in detail stacks). */
  indentBody?: boolean
}) {
  if (rows.length === 0) return null
  return (
    <RowList className={className} title={title} collapsible={collapsible} defaultOpen={defaultOpen} variant={variant} indentBody={indentBody}>
      {rows.map((row, index) => (
        <div key={index} className="flex min-h-9 items-start gap-2 px-3 py-2 text-dense">
          {row.icon !== undefined && (
            <div className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', ACTION_TONE_CHIP[row.tone ?? 'default'])}>
              {row.icon}
            </div>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <div className="font-medium">{row.title}</div>
            {row.detail != null && <div className="mt-0.5 text-micro text-muted-foreground">{row.detail}</div>}
          </div>
          {row.actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{row.actions}</div>}
        </div>
      ))}
    </RowList>
  )
}

export type ActivityRow = {
  event: React.ReactNode
  actor?: React.ReactNode
  when: React.ReactNode
}

const ACTIVITY_COLS = 'grid-cols-[minmax(0,1.7fr)_minmax(0,0.9fr)_auto]'

export function ActivityRowList({
  title,
  rows,
  className,
  collapsible,
  defaultOpen,
  variant,
  indentBody,
  titleClassName,
  headerTextClassName,
  emptyTextClassName,
}: {
  title?: React.ReactNode
  rows: ActivityRow[]
  className?: string
  collapsible?: boolean
  defaultOpen?: boolean
  variant?: RowListVariant
  /** Forwarded to the inner RowList (R-UX-025 flush in detail stacks). */
  indentBody?: boolean
  /** Override the section title's text-size utility (default `text-sm`).
   *  Passed through to RowList; every other ActivityRowList consumer keeps
   *  the default. */
  titleClassName?: string
  /** Override the EVENT/ACTOR/WHEN header row's text-size utility (default
   *  `text-micro`). Passed through to RowListHeader. */
  headerTextClassName?: string
  /** Override the "No recent activity" empty-state text-size utility
   *  (default `text-sm`). Passed through to RowListEmpty. */
  emptyTextClassName?: string
}) {
  return (
    <RowList
      className={className}
      title={title}
      titleClassName={titleClassName}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      variant={variant}
      indentBody={indentBody}
      header={(
        <RowListHeader className={ACTIVITY_COLS} textClassName={headerTextClassName}>
          <span>Event</span>
          <span>Actor</span>
          <span className="text-right">When</span>
        </RowListHeader>
      )}
    >
      {rows.length === 0 && <RowListEmpty textClassName={emptyTextClassName}>No recent activity.</RowListEmpty>}
      {rows.map((row, index) => (
        <div key={index} className={cn(ROW_GRID, ACTIVITY_COLS, 'h-9 text-dense')}>
          <span className="truncate">{row.event}</span>
          <span className="truncate text-muted-foreground">{row.actor}</span>
          <span className="whitespace-nowrap text-right text-micro text-muted-foreground tabular-nums">{row.when}</span>
        </div>
      ))}
    </RowList>
  )
}

export type MetricRow = {
  label: React.ReactNode
  value: React.ReactNode
  delta?: React.ReactNode
  deltaTone?: 'up' | 'down' | 'neutral'
}

const METRIC_DELTA_TONE: Record<NonNullable<MetricRow['deltaTone']>, string> = {
  up: 'text-[var(--color-success)]',
  down: 'text-[var(--color-danger)]',
  neutral: 'text-muted-foreground',
}

export function MetricRowList({
  title,
  rows,
  className,
  collapsible,
  defaultOpen,
  variant,
  indentBody,
}: {
  title: React.ReactNode
  rows: MetricRow[]
  className?: string
  collapsible?: boolean
  defaultOpen?: boolean
  variant?: RowListVariant
  /** Forwarded to the inner RowList (R-UX-025 flush in detail stacks). */
  indentBody?: boolean
}) {
  return (
    <RowList className={className} title={title} collapsible={collapsible} defaultOpen={defaultOpen} variant={variant} indentBody={indentBody}>
      {rows.map((row, index) => (
        <div key={index} className="flex min-h-9 items-center justify-between gap-3 px-3 py-2 text-dense">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="flex items-baseline gap-1.5 text-right font-medium tabular-nums">
            {row.value}
            {row.delta != null && (
              <span className={cn('text-micro', METRIC_DELTA_TONE[row.deltaTone ?? 'neutral'])}>{row.delta}</span>
            )}
          </span>
        </div>
      ))}
    </RowList>
  )
}
