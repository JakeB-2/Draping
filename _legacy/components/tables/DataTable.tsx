'use client'

import { useState, useMemo } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronsUpDown, ListFilter, MoreHorizontal, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const HIDE_BELOW: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

export type FilterDef<T> = {
  label: string
  /** Key to read from the row, or a custom predicate receiving (row, selectedValue). */
  accessor: keyof T | ((row: T, value: string) => boolean)
  options: { label: string; value: string }[]
}

export type Column<T> = {
  header: string
  /** String key for sortable/searchable columns, or a render function for custom cells. */
  accessor: keyof T | ((row: T) => React.ReactNode)
  sortable?: boolean
  /** className applied to the <th> */
  className?: string
  /** className applied to the <td> */
  cellClassName?: string
  /** Hide this column below a breakpoint */
  hideBelow?: 'sm' | 'md' | 'lg'
}

type Props<T> = {
  data: T[]
  columns: Column<T>[]
  /** Keys to include in the text search. Omit to disable search. */
  searchKeys?: (keyof T)[]
  searchPlaceholder?: string
  /** Rendered on the left side of the toolbar. */
  title?: React.ReactNode
  /** Rendered right-aligned in the toolbar (e.g. a "New X" Button). */
  actions?: React.ReactNode
  emptyMessage?: string
  /** Structured column filters rendered as dropdowns in the toolbar. */
  filters?: FilterDef<T>[]
  /** Makes each row clickable. Consumer handles navigation. */
  onRowClick?: (row: T) => void
  /** When provided, adds an Actions dropdown with an "Import CSV" item. */
  onImportCsv?: () => void
}

export default function DataTable<T extends object>({
  data,
  columns,
  searchKeys,
  searchPlaceholder,
  title,
  actions,
  filters,
  emptyMessage = 'No results.',
  onRowClick,
  onImportCsv,
}: Props<T>) {
  const effectivePlaceholder = searchPlaceholder
    ?? (title && typeof title === 'string' ? `Search ${title}…` : 'Search…')
  const [sort, setSort] = useState<{ key: keyof T; dir: 'asc' | 'desc' } | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const search = searchParams.get('q') ?? ''

  function setSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('q', value)
    } else {
      params.delete('q')
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const activeFilters = useMemo(() => {
    if (!filters?.length) return {}
    return Object.fromEntries(
      filters
        .map((f) => [f.label, searchParams.getAll(f.label)])
        .filter(([, vals]) => (vals as string[]).length > 0)
    ) as Record<string, string[]>
  }, [searchParams, filters])

  function updateFilter(filterLabel: string, values: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(filterLabel)
    for (const v of values) params.append(filterLabel, v)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const rows = useMemo(() => {
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

    if (filters?.length) {
      for (const filter of filters) {
        const selected = activeFilters[filter.label] ?? []
        if (selected.length === 0) continue
        result = result.filter((row) =>
          selected.some((value) =>
            typeof filter.accessor === 'function'
              ? filter.accessor(row, value)
              : String((row as Record<keyof T, unknown>)[filter.accessor as keyof T] ?? '') === value
          )
        )
      }
    }

    if (sort) {
      result = [...result].sort((a, b) => {
        const av = (a as Record<keyof T, unknown>)[sort.key]
        const bv = (b as Record<keyof T, unknown>)[sort.key]
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''))
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }

    return result
  }, [data, search, searchKeys, filters, activeFilters, sort])

  function toggleSort(key: keyof T) {
    setSort((prev) => {
      if (prev?.key === key) return prev.dir === 'asc' ? { key, dir: 'desc' } : null
      return { key, dir: 'asc' }
    })
  }

  function cellValue(row: T, col: Column<T>): React.ReactNode {
    return typeof col.accessor === 'function'
      ? col.accessor(row)
      : (row[col.accessor] as React.ReactNode)
  }

  const hasToolbar = title || (searchKeys && searchKeys.length > 0) || actions || filters?.length || onImportCsv

  return (
    <div className="space-y-3">
      {hasToolbar && (
        <div className="flex items-center gap-2">
          {title && <div className="text-lg font-semibold shrink-0">{title}</div>}
          {((searchKeys && searchKeys.length > 0) || filters?.length || actions || onImportCsv) ? (
            <div className="flex items-center gap-2 ml-auto">
              {searchKeys && searchKeys.length > 0 && (
                <Input
                  placeholder={effectivePlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:max-w-xs"
                />
              )}
              {filters?.map((filter) => {
                const selected = activeFilters[filter.label] ?? []
                return (
                  <DropdownMenu key={filter.label}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <ListFilter className="size-3 opacity-50" />
                        {filter.label}
                        {selected.length > 0 ? (
                          <span className="rounded-full bg-primary text-primary-foreground text-xs size-4 flex items-center justify-center leading-none">
                            {selected.length}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">All</span>
                        )}
                        <ChevronDown className="size-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {filter.options.map((opt) => (
                        <DropdownMenuCheckboxItem
                          key={opt.value}
                          checked={selected.includes(opt.value)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...selected, opt.value]
                              : selected.filter((v) => v !== opt.value)
                            updateFilter(filter.label, next)
                          }}
                        >
                          {opt.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              })}
              {onImportCsv && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <MoreHorizontal className="size-3.5 opacity-50" />
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onImportCsv}>
                      <Upload className="size-4" />
                      Import CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {actions}
            </div>
          ) : null}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => {
                const isSortable = col.sortable && typeof col.accessor !== 'function'
                const sortKey = isSortable ? (col.accessor as keyof T) : null
                const currentDir = sortKey && sort?.key === sortKey ? sort.dir : null

                return (
                  <TableHead
                    key={col.header}
                    className={[col.className, col.hideBelow ? HIDE_BELOW[col.hideBelow] : undefined].filter(Boolean).join(' ') || undefined}
                    onClick={sortKey ? () => toggleSort(sortKey) : undefined}
                    style={sortKey ? { cursor: 'pointer', userSelect: 'none' } : undefined}
                  >
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
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow
                  key={((row as Record<string, unknown>).id as string) ?? i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {columns.map((col) => (
                    <TableCell key={col.header} className={[col.cellClassName, col.hideBelow ? HIDE_BELOW[col.hideBelow] : undefined].filter(Boolean).join(' ') || undefined}>
                      {cellValue(row, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
