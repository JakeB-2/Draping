'use client'

// URL-backed state for DataTable: text search (with debounce + `/` shortcut),
// sort, and structured filters (facet + date range). Lifted out of
// DataTable.tsx so the rendering component reads as orchestration. Kept as a
// single hook because all three concerns share `searchParams` / `router` /
// `pathname` — splitting into three would mean three `URLSearchParams`
// snapshots and racing `router.replace` calls against the same query string.
//
// Behaviour notes (preserved from the previous inline implementation):
// - Search: local input is the source of truth for filtering; URL `q` is a
//   debounced echo so deep links + back button still work. The debounce
//   effect intentionally omits `searchParams`/`pathname`/`router` from its
//   dep array — re-firing when the URL changes would cancel in-flight typing.
// - Sort: `?sort=col&dir=asc|desc`. We only treat the URL value as valid when
//   it names a sortable column on the current table, so a stale `?sort=`
//   from a different page can't crash the renderer.
// - Filters: facets use one URL key per filter label with multiple values
//   (`?Status=open&Status=closed`); date ranges use two parallel keys
//   (`?Date_from=…&Date_to=…`).

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import type { Column, FilterDef, FacetFilterDef, DateRangeFilterDef } from './types'
import { formatDateRangeChipBound, getSortableKeys } from './table-url-state-utils'

type Sort<T> = { key: keyof T; dir: 'asc' | 'desc' } | null

export type TableUrlState<T> = {
  // search
  search: string
  searchInput: string
  setSearchInput: (v: string) => void
  searchInputRef: RefObject<HTMLInputElement | null>
  // sort
  sort: Sort<T>
  toggleSort: (key: keyof T) => void
  // filters
  facetFilters: FacetFilterDef<T>[]
  dateRangeFilters: DateRangeFilterDef<T>[]
  activeFilters: Record<string, string[]>
  activeDateRanges: Record<string, { from: string | null; to: string | null }>
  writeFilters: (
    nextFacets: Record<string, string[]>,
    nextDateRanges: Record<string, { from: string | null; to: string | null }>,
  ) => void
  removeOneChip: (key: string, value: string) => void
  chips: { key: string; value: string; label: string }[]
}

export function useTableUrlState<T>({
  columns,
  filters,
  searchKeys,
  namespace,
  serverSearch,
  serverPaged,
}: {
  columns: Column<T>[]
  filters?: FilterDef<T>[]
  searchKeys?: (keyof T)[]
  /**
   * When set, every URL key this table reads/writes is prefixed `${ns}.` so
   * multiple `DataTable`s on the same route don't collide on `q` / `sort` /
   * `dir` / facet labels. Default unset = bare keys (current behaviour).
   */
  namespace?: string
  /**
   * When true, the search box drives a SERVER query (the page reads `?q=`) rather
   * than client filtering, so a search must also reset the server `page` param —
   * otherwise a search while on page ≥2 leaves a stale offset and strands the user
   * on an empty result page. Pairs with DataTable skipping the client search filter.
   */
  serverSearch?: boolean
  /**
   * When true, sort + filter changes ALSO reset the server `?page=` param (same
   * reasoning as serverSearch): a new sort/filter invalidates the current offset.
   * Set by DataTable's `serverPagination` mode.
   */
  serverPaged?: boolean
}): TableUrlState<T> {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Key helpers: prefix with `${namespace}.` when set so nested tables don't
  // share state with the page's outer table.
  const k = useMemo(() => {
    const prefix = namespace ? `${namespace}.` : ''
    return {
      q: `${prefix}q`,
      sort: `${prefix}sort`,
      dir: `${prefix}dir`,
      facet: (label: string) => `${prefix}${label}`,
      from: (label: string) => `${prefix}${label}_from`,
      to: (label: string) => `${prefix}${label}_to`,
    }
  }, [namespace])

  // --- sort ---------------------------------------------------------------

  const sortKeyParam = searchParams.get(k.sort)
  const sortDirParam = searchParams.get(k.dir)
  const sortableKeys = useMemo(() => {
    return getSortableKeys(columns)
  }, [columns])
  const sort = useMemo<Sort<T>>(() => {
    if (!sortKeyParam || !sortableKeys.has(sortKeyParam)) return null
    const dir: 'asc' | 'desc' = sortDirParam === 'desc' ? 'desc' : 'asc'
    return { key: sortKeyParam as keyof T, dir }
  }, [sortKeyParam, sortDirParam, sortableKeys])

  function toggleSort(key: keyof T) {
    // Cycle: unsorted → asc → desc → unsorted. Mirrors the previous local-state
    // behaviour but writes through the URL so the choice survives navigation.
    const params = new URLSearchParams(searchParams.toString())
    const colKey = String(key)
    if (sort?.key === key) {
      if (sort.dir === 'asc') {
        params.set(k.sort, colKey)
        params.set(k.dir, 'desc')
      } else {
        params.delete(k.sort)
        params.delete(k.dir)
      }
    } else {
      params.set(k.sort, colKey)
      params.set(k.dir, 'asc')
    }
    if (serverPaged) params.delete('page')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // --- search -------------------------------------------------------------

  // Effective search query — read from URL so deep links + back button still work.
  const search = searchParams.get(k.q) ?? ''

  // Local input value updates synchronously for snappy typing; the URL writeback
  // is debounced ~250ms so we don't trigger a router.replace per keystroke.
  const [searchInput, setSearchInput] = useState(search)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Sync local input when URL `q` changes from outside (e.g. saved-link
  // navigation). Adjusted DURING render (the React-endorsed
  // "prev-value" pattern) instead of protec's original useEffect —
  // draping's eslint enables react-hooks/set-state-in-effect, which flags
  // the effect form. Behaviour is identical: same-value updates bail out.
  const [prevSearch, setPrevSearch] = useState(search)
  if (search !== prevSearch) {
    setPrevSearch(search)
    setSearchInput(search)
  }

  // Debounced URL writeback. Only writes when the typed value has settled and
  // diverges from the current URL.
  useEffect(() => {
    if (searchInput === search) return
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (searchInput) params.set(k.q, searchInput)
      else params.delete(k.q)
      // Server-driven search owns the result set, so a changed term invalidates
      // the current server page — drop it back to page 1 to avoid an empty offset.
      if (serverSearch) params.delete('page')
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, 250)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  // `/` focuses the search input on any list page that has one. Skipped when
  // the user is already typing in an input/textarea/contenteditable so the
  // shortcut never eats a literal slash. No-op if the table has no searchKeys.
  useEffect(() => {
    if (!searchKeys || searchKeys.length === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const el = searchInputRef.current
      if (!el) return
      e.preventDefault()
      el.focus()
      el.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchKeys])

  // --- filters ------------------------------------------------------------

  // Split filters into facet vs date-range buckets so the URL keys + UI logic
  // stay simple. Facet uses one URL key per label with multiple values; date
  // range uses two parallel keys: `<label>_from` and `<label>_to`.
  const facetFilters = useMemo(() => (filters ?? []).filter(f => f.type !== 'dateRange') as FacetFilterDef<T>[], [filters])
  const dateRangeFilters = useMemo(() => (filters ?? []).filter(f => f.type === 'dateRange') as DateRangeFilterDef<T>[], [filters])

  // Active facet selections keyed by filter label.
  const activeFilters = useMemo(() => {
    if (!facetFilters.length) return {} as Record<string, string[]>
    return Object.fromEntries(
      facetFilters
        .map((f) => [f.label, searchParams.getAll(k.facet(f.label))])
        .filter(([, vals]) => (vals as string[]).length > 0)
    ) as Record<string, string[]>
  }, [searchParams, facetFilters, k])

  // Active date-range selections keyed by filter label. `null` for an unset bound.
  const activeDateRanges = useMemo(() => {
    if (!dateRangeFilters.length) return {} as Record<string, { from: string | null; to: string | null }>
    const out: Record<string, { from: string | null; to: string | null }> = {}
    for (const f of dateRangeFilters) {
      const from = searchParams.get(k.from(f.label))
      const to = searchParams.get(k.to(f.label))
      if (from || to) out[f.label] = { from, to }
    }
    return out
  }, [searchParams, dateRangeFilters, k])

  function writeFilters(
    nextFacets: Record<string, string[]>,
    nextDateRanges: Record<string, { from: string | null; to: string | null }>,
  ) {
    const params = new URLSearchParams(searchParams.toString())
    // Wipe all known filter keys first so removed groups disappear.
    for (const f of facetFilters) params.delete(k.facet(f.label))
    for (const f of dateRangeFilters) {
      params.delete(k.from(f.label))
      params.delete(k.to(f.label))
    }
    for (const [label, vals] of Object.entries(nextFacets)) {
      for (const v of vals) params.append(k.facet(label), v)
    }
    for (const [label, range] of Object.entries(nextDateRanges)) {
      if (range.from) params.set(k.from(label), range.from)
      if (range.to) params.set(k.to(label), range.to)
    }
    if (serverPaged) params.delete('page')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function removeOneChip(key: string, value: string) {
    if (value === '__dateRange__') {
      // dateRange chips collapse to one chip per filter; remove the whole range.
      const next = { ...activeDateRanges }
      delete next[key]
      writeFilters(activeFilters, next)
      return
    }
    const current = activeFilters[key] ?? []
    writeFilters({ ...activeFilters, [key]: current.filter((v) => v !== value) }, activeDateRanges)
  }

  const chips = useMemo(() => {
    const out: { key: string; value: string; label: string }[] = []
    for (const f of facetFilters) {
      const selectedVals = activeFilters[f.label] ?? []
      for (const v of selectedVals) {
        const opt = f.options.find((o) => o.value === v)
        out.push({ key: f.label, value: v, label: opt?.label ?? v })
      }
    }
    for (const f of dateRangeFilters) {
      const range = activeDateRanges[f.label]
      if (!range) continue
      const left = formatDateRangeChipBound(range.from, '...')
      const right = formatDateRangeChipBound(range.to, '...')
      out.push({ key: f.label, value: '__dateRange__', label: `${f.label}: ${left} – ${right}` })
    }
    return out
  }, [facetFilters, dateRangeFilters, activeFilters, activeDateRanges])

  return {
    search,
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
  }
}
