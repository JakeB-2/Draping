// Shared DataTable types. Lifted out of DataTable.tsx so the row-pipeline
// helper and the URL-state hook can depend on them without importing the
// whole component file. DataTable.tsx re-exports these so existing callsites
// (`import type { Column, FilterDef } from '@/components/tables/DataTable'`)
// continue to resolve.

export type FacetFilterDef<T> = {
  /** Default — multi-select chip group. Omit `type` and existing call sites keep working. */
  type?: 'facet'
  label: string
  /** Key to read from the row, or a custom predicate receiving (row, selectedValue). */
  accessor: keyof T | ((row: T, value: string) => boolean)
  /**
   * `parentValue` is optional UI metadata only (filtering/URL-state logic
   * ignores it). When every option carries it, FilterSheet renders the group
   * as a cascading parent-dropdown + optional child-dropdown pair instead of
   * a flat multi-select — `null` marks a top-level (parent) option, a string
   * names the parent option's `value` for a child option.
   */
  options: { label: string; value: string; parentValue?: string | null }[]
}

export type DateRangeFilterDef<T> = {
  type: 'dateRange'
  label: string
  /** Returns the row's date as ISO (yyyy-MM-dd or full ISO). */
  accessor: (row: T) => string | null
}

export type FilterDef<T> = FacetFilterDef<T> | DateRangeFilterDef<T>

type ColumnBase<T> = {
  header: string
  /** String key for sortable/searchable columns, or a render function for custom cells. */
  accessor: keyof T | ((row: T) => React.ReactNode)
  /**
   * Phone-card override: when set, the card renders THIS instead of `accessor`
   * for the column's `mobile` slot (the desktop table always uses `accessor`).
   * Return SHORT, text-first content sized for a card line — or null when the
   * row has no phone-worthy value, which drops the cell (and its `·` separator)
   * from the card entirely. Use it when the desktop cell is rich JSX that can't
   * truncate cleanly, or when the phone needs a folded composite ("email ·
   * phone") the desktop shows as separate columns.
   */
  mobileAccessor?: (row: T) => React.ReactNode
  sortable?: boolean
  /** Sort key when the visible accessor is a render function. Lets a column
   *  display a formatted string but sort by an underlying ISO/numeric field. */
  sortKey?: keyof T
  /** className applied to the <th> */
  className?: string
  /** className applied to the <td> */
  cellClassName?: string
}

// TYPE-SAFE-005: `hideBelow`/`mobile` are mutually exclusive — combining them
// renders on phone, vanishes on tablet, and reappears on desktop. This used to
// be a same-object optional-key pair enforced only by a comment + a separate
// lint (scripts/lint-mobile-slots.mjs's 'lg-plus-slot' check) that could drift
// out of sync with the type. The discriminated union below makes the illegal
// combination a compile error instead: a column literal can set `hideBelow`
// OR `mobile`, never both.
export type Column<T> = ColumnBase<T> & (
  | {
      /** Desktop-only column: shown only when the table's CONTAINER is ≥48rem
       *  (container-query-keyed since the 2026-07-22 tablet fix — a full-width
       *  table at a ≥1024px viewport qualifies, a narrow SplitView pane never
       *  does, regardless of viewport).
       *
       *  Responsive tiers (R-UX-036): the desktop `<table>` only renders at md+
       *  (below md the phone card layout takes over entirely), so 'sm'/'md' values
       *  were no-ops and have been removed. The three effective tiers are:
       *    - PRIMARY   → give the column a `mobile:` slot (phone card + table)
       *    - SECONDARY → plain column (tablet + desktop table)
       *    - DESKTOP   → `hideBelow: 'lg'` (desktop table only)
       *  Never combine `hideBelow: 'lg'` with a `mobile:` slot — see above. */
      hideBelow: 'lg'
      mobile?: never
    }
  | {
      hideBelow?: never
      /** Semantic role in the adaptive mobile receipt row. Columns without a
       *  role are hidden on mobile, and absent row values collapse without
       *  reserving blank lines.
       *  - `title` is the invariant first left value.
       *  - `subtitle` and `metadata` pack downward on the left.
       *  - `trailing` values are primary scan information centered in the
       *    right rail.
       *  - `signal` glyphs/badges occupy the bottom of the right rail.
       *  - `compactAction` is the single compact control at the top of the
       *    right rail. Multiple claims warn in development and only the first
       *    column renders.
       *  - `action` spans the card below its left content and right rail for
       *    controls that cannot fit safely in the content-sized trailing stack.
       *  Rich desktop cells should provide a short `mobileAccessor`.
       *  `tertiary` and `right` are compatibility aliases for `metadata` and
       *  `trailing`; new callers should use the semantic names.
       *  Actions: the detail drawer/panel is the canonical action surface on
       *  phone; use `compactAction` only for one small control or overflow
       *  trigger, and `action` for editors, forms, and multi-control groups. */
      mobile?: 'title' | 'subtitle' | 'metadata' | 'trailing' | 'signal' | 'compactAction' | 'action' | 'tertiary' | 'right'
    }
)
