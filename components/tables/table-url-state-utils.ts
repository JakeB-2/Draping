import { format, isValid, parseISO } from 'date-fns'
import type { Column } from './types'

export function getSortableKeys<T>(columns: Column<T>[]): Set<string> {
  const keys = new Set<string>()

  for (const col of columns) {
    if (!col.sortable) continue

    const key = col.sortKey ?? (typeof col.accessor === 'function' ? undefined : col.accessor)
    if (key != null) keys.add(String(key))
  }

  return keys
}

export function formatDateRangeChipBound(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const parsed = parseISO(value)
  if (!isValid(parsed)) return value
  return format(parsed, 'MMM d')
}
