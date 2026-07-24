import { isValidElement, type ReactNode } from 'react'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { Check, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/calculations/currency'
import { formatLocalDate, formatTableDate } from '@/lib/format-date'
import { cn } from '@/lib/utils'

// Reusable table-cell layout helpers. Presentational only (no state), so this
// file stays directive-free and is usable from both server and client tables.

/**
 * Empty-cell detection for the phone card layouts (DataTable's card rows and
 * TieredRowList's receipt card). An em-dash placeholder reads fine in a desktop
 * grid but leaves dangling "· —" separators / dash-only right slots on a phone
 * card, so the cards drop those cells. Detectable forms:
 *   - the literal string '—' (plain-text cells)
 *   - an UNRENDERED `<MoneyCell/>` / `<DateCell/>` / `<CountCell/>` element
 *     whose props resolve to the dash branch — checked by element type, since
 *     at the card layer the component hasn't rendered yet and its stamped
 *     output span is not visible
 *   - host JSX carrying `data-empty-cell` (e.g. a custom cell's own
 *     `<span data-empty-cell="">—</span>` dash branch)
 * Custom composite cells the card can't see through should either return the
 * plain string '—' / stamped host JSX, or use a `mobileAccessor` returning
 * null.
 */
export function isEmptyCell(value: ReactNode): boolean {
  if (value === '—' || value === '-') return true
  if (!isValidElement(value)) return false
  const props = value.props as Record<string, unknown>
  if (props['data-empty-cell'] !== undefined) return true
  if (props.children === '—' || props.children === '-') return true
  if (value.type === MoneyCell) return props.amount == null
  if (value.type === DateCell) {
    const d = props.date
    return d == null || d === ''
  }
  if (value.type === CountCell) return props.value == null
  return false
}

/**
 * Two-line table cell: a primary value with a muted secondary line beneath it.
 *
 * Use when a single column — usually the identity / name column — is ambiguous
 * on its own and needs a disambiguating second value tied tightly to it (e.g. a
 * line-type name with its parent doc type, a code with its description, a SKU
 * with its category). Prefer this over adding a far-right context column when
 * the second value is the row's *primary* disambiguator: pairing it under the
 * name reads better than scanning across the table to a distant column.
 *
 * Mirrors the mobile card title/subtitle idiom in `DataTable` so the desktop
 * table and the phone card-stack read consistently. When `secondary` is
 * null/empty the cell renders the primary value alone, so rows with and without
 * context coexist in the same table without ragged spacing.
 *
 * Composes with the name-cell glyph wrappers: pass a whole `<SeededNameCell>`
 * / `<PinnedNameCell>` node as `primary` and the lock / baseline marker stays
 * inline with the name while the subtitle stacks below it.
 *
 * Decision note: row-section grouping (sticky group headers inside the table
 * body) was considered for the same "one column is not enough" need and
 * deliberately not built — it would force DataTable's sort / filter /
 * pagination pipeline to special-case header rows. A subtitle (or a filter)
 * covers the catalog cases without that complexity. See docs/ui-patterns.md.
 */
/**
 * Money value in a table cell: currency folded into the amount (never a
 * separate Currency column), right-aligned, tabular figures.
 *
 * Convention (R-UX-036): the "one number people scan for" is PRIMARY tier —
 * money columns carry `mobile: 'trailing'` and are never hidden outright. Pair
 * the column with `className: 'text-right'` so the header aligns too.
 */
export function MoneyCell({
  amount,
  currency,
  className,
}: {
  amount: number | null | undefined
  currency: string
  className?: string
}) {
  if (amount == null) {
    return <span data-empty-cell="" className={cn('block text-right tabular-nums', className)}>—</span>
  }
  return (
    <span className={cn('block text-right tabular-nums', className)}>
      {formatCurrency(amount, currency)}
    </span>
  )
}

/**
 * Date value in a table cell, one app-wide format: "Jul 9" absolute, with a
 * compact two-digit year appended only when the date is outside the current
 * calendar year ("Jul 9 '25") — R-UX-039 + the 2026-07-09 per-surface year-back
 * decision. Or a strict relative distance ("3 days ago") for activity/audit
 * rows.
 * Accepts ISO strings (with or without time) or Date; null renders an em dash.
 */
export function DateCell({
  date,
  relative = false,
  className,
}: {
  date: string | Date | null | undefined
  relative?: boolean
  className?: string
}) {
  if (date == null || date === '') return <span data-empty-cell="" className={className}>—</span>
  const parsed = typeof date === 'string' ? parseISO(date) : date
  if (Number.isNaN(parsed.getTime())) return <span data-empty-cell="" className={className}>—</span>
  return (
    <span className={cn('whitespace-nowrap', className)}>
      {relative
        ? formatDistanceToNowStrict(parsed, { addSuffix: true })
        : formatTableDate(typeof date === 'string' ? date : formatLocalDate(parsed))}
    </span>
  )
}

/**
 * Boolean flag as an icon-only glyph: success check for true, muted dash for
 * false — replaces hand-rolled `r.flag ? 'Yes' : 'No'` text cells and reads
 * faster while freeing column width. `label` feeds the screen-reader text
 * ("Payable: yes"); pass the column's meaning, not "yes"/"no".
 */
export function BooleanCell({
  value,
  label,
  className,
}: {
  value: boolean | null | undefined
  /** What the flag means, for assistive text (e.g. "Active", "Payable"). */
  label: string
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      {value ? (
        <Check aria-hidden className="size-4 text-[var(--color-success)]" />
      ) : (
        <Minus aria-hidden className="size-4 text-muted-foreground/50" />
      )}
      <span className="sr-only">{`${label}: ${value ? 'yes' : 'no'}`}</span>
    </span>
  )
}

/**
 * Count value in a table cell: right-aligned tabular figures, optional
 * pluralized noun for the phone card where a bare number loses its meaning
 * (`3` in a desktop "Lines" column, but `3 lines` in a card slot).
 */
export function CountCell({
  value,
  noun,
  className,
}: {
  value: number | null | undefined
  /** Singular noun; pluralized with a bare "s" (e.g. "line" -> "3 lines"). */
  noun?: string
  className?: string
}) {
  if (value == null) return <span data-empty-cell="" className={cn('block text-right tabular-nums', className)}>—</span>
  const suffix = noun ? ` ${noun}${value === 1 ? '' : 's'}` : ''
  return (
    <span className={cn('block text-right tabular-nums', className)}>
      {value.toLocaleString()}
      {suffix}
    </span>
  )
}

export function TwoLineCell({
  primary,
  secondary,
  className,
  secondaryClassName,
}: {
  primary: ReactNode
  secondary?: ReactNode
  className?: string
  /** Extra classes on the secondary line — e.g. `md:hidden` to keep the
   *  subtitle on the mobile card while dropping it from the desktop cell
   *  (same accessor renders both; see SimpleCatalogTable's
   *  `hideSubtitleOnDesktop`). */
  secondaryClassName?: string
}) {
  if (secondary == null || secondary === '') return <>{primary}</>
  return (
    <span className={cn('flex min-w-0 flex-col gap-0.5 py-1 leading-tight', className)}>
      <span className="truncate">{primary}</span>
      <span className={cn('truncate text-micro font-normal text-muted-foreground', secondaryClassName)}>
        {secondary}
      </span>
    </span>
  )
}
