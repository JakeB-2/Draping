/**
 * Shared table utilities. Today: filter-options derivation; expand as more
 * cross-table boilerplate falls out.
 *
 * deriveFilterOptions — most *Table.tsx files build their column filter
 * dropdowns by doing `[...new Set(data.map(r => r.currency))]` style work
 * inline. Multiply that across 85+ table files and 120+ occurrences and
 * you've got a pile of nearly-identical noise. This helper unifies the
 * pattern.
 *
 * Usage:
 *   const filterOptions = deriveFilterOptions(rows, {
 *     currency: (r) => r.currency,
 *     status:   (r) => r.status,
 *     type:     (r) => r.acc_doc_type?.name ?? null,
 *   })
 *   // → { currency: [{value, label}…], status: [...], type: [...] }
 *
 * Behaviour:
 *   - Null / undefined / empty-string values are skipped.
 *   - Duplicates de-duplicated by value.
 *   - Options sorted by label (case-insensitive).
 *   - Accessor can return `{ value, label }` for cases where value !== label.
 */

export type FilterOption = { value: string; label: string }

type Accessor<R> =
  | ((row: R) => string | null | undefined)
  | ((row: R) => FilterOption | null | undefined)

export function deriveFilterOptions<R, K extends string>(
  rows: readonly R[],
  accessors: Record<K, Accessor<R>>,
): Record<K, FilterOption[]> {
  const out = {} as Record<K, FilterOption[]>
  for (const key of Object.keys(accessors) as K[]) {
    const accessor = accessors[key]
    const seen = new Map<string, FilterOption>()
    for (const row of rows) {
      const v = accessor(row)
      if (v == null) continue
      if (typeof v === 'string') {
        if (v === '' || seen.has(v)) continue
        seen.set(v, { value: v, label: v })
      } else {
        if (!v.value || seen.has(v.value)) continue
        seen.set(v.value, v)
      }
    }
    out[key] = Array.from(seen.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    )
  }
  return out
}
