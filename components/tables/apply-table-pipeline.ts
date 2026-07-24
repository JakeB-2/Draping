// Pure row pipeline used by DataTable: text search → facet filter →
// date-range filter → sort. Lifted out of DataTable.tsx so the rendering
// component reads as orchestration rather than data transformation.
//
// Behaviour notes (preserved from the previous inline useMemo):
// - Search compares against the typed input, not the URL `q` param. The URL
//   lags by the search debounce; results update on each keystroke.
// - Facet match uses `String(...) === value` so number-shaped accessors work
//   without the caller stringifying. A custom predicate accessor short-circuits
//   the comparison and decides on its own.
// - Date-range comparison slices the first 10 chars of the accessor's return
//   and compares lexically against `from` / `to` (yyyy-MM-dd) so we don't
//   drift across timezones.
// - Sort uses a numeric fast-path when both values are genuinely numeric
//   (number type or a fully numeric, finite string) so negative money/qty
//   values (e.g. `balance`, `qty_delta`, `*_usd`) sort by signed value, not
//   by magnitude. Otherwise it falls back to `localeCompare` with
//   `numeric: true` so columns that hold number-shaped strings (e.g.
//   `sort_order`) still sort 1, 2, 10 — not 1, 10, 2 — and string/date
//   columns sort lexically.

import type { FacetFilterDef, DateRangeFilterDef } from './types'

type Sort<T> = { key: keyof T; dir: 'asc' | 'desc' } | null

// True only for values we can compare by signed numeric value: a number
// primitive, or a non-empty string that parses fully to a finite number.
// "12 items" / "2024-01" are rejected so they fall back to localeCompare.
function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : null
  }
  return null
}

export function applyTablePipeline<T>({
  data,
  search,
  searchKeys,
  facetFilters,
  activeFilters,
  dateRangeFilters,
  activeDateRanges,
  sort,
}: {
  data: T[]
  search: string
  searchKeys?: (keyof T)[]
  facetFilters: FacetFilterDef<T>[]
  activeFilters: Record<string, string[]>
  dateRangeFilters: DateRangeFilterDef<T>[]
  activeDateRanges: Record<string, { from: string | null; to: string | null }>
  sort: Sort<T>
}): T[] {
  let result = data

  if (search && searchKeys?.length) {
    const q = search.toLowerCase()
    result = result.filter((row) =>
      searchKeys.some((key) => {
        const val = (row as Record<keyof T, unknown>)[key]
        return typeof val === 'string' && val.toLowerCase().includes(q)
      })
    )
  }

  for (const filter of facetFilters) {
    const selectedVals = activeFilters[filter.label] ?? []
    if (selectedVals.length === 0) continue
    result = result.filter((row) =>
      selectedVals.some((value) =>
        typeof filter.accessor === 'function'
          ? filter.accessor(row, value)
          : String((row as Record<keyof T, unknown>)[filter.accessor as keyof T] ?? '') === value
      )
    )
  }

  for (const filter of dateRangeFilters) {
    const range = activeDateRanges[filter.label]
    if (!range || (!range.from && !range.to)) continue
    result = result.filter((row) => {
      const raw = filter.accessor(row)
      if (!raw) return false
      const day = raw.length >= 10 ? raw.slice(0, 10) : raw
      if (range.from && day < range.from) return false
      if (range.to && day > range.to) return false
      return true
    })
  }

  if (sort) {
    result = [...result].sort((a, b) => {
      const av = (a as Record<keyof T, unknown>)[sort.key]
      const bv = (b as Record<keyof T, unknown>)[sort.key]
      const an = asFiniteNumber(av)
      const bn = asFiniteNumber(bv)
      const cmp =
        an !== null && bn !== null
          ? an - bn
          : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }

  return result
}
