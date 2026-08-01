'use client'

// FilterSheet — grouped multi-select filter UI used by DataTable in place of
// inline per-filter dropdowns. One button opens the sheet; the sheet renders
// each filter group as an uppercase eyebrow + a wrap-flex of pill buttons.
// Date-range groups render as two date inputs (from / to). Apply commits the
// staged selections, Clear wipes them all.
//
// Stays controlled: the parent owns active state via URL/searchParams. The
// sheet stages edits internally so closing without "Apply" discards changes.

import { useState } from 'react'
import { ListFilter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { DrawerPortalContext } from '@/components/screens/drawer-portal-context'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export type FilterGroupConfig = {
  /** Stable key used in the URL searchParams + as the React key. */
  key: string
  /** Visible group label (used as the section header). */
  label: string
  /**
   * When every option carries `parentValue`, the group renders as a cascading
   * parent-dropdown + optional child-dropdown pair (`null` = top-level
   * option, a string = the parent option's `value`) instead of a flat
   * multi-select dropdown.
   */
  options: { value: string; label: string; parentValue?: string | null }[]
}

// Sentinel for the cascade selects' "no selection" item — Radix Select
// doesn't allow an item with value="".
const CASCADE_CLEAR = '__clear__'

export type DateRangeGroupConfig = {
  key: string
  label: string
}

export type DateRangeValue = { from: string | null; to: string | null }

type Props = {
  groups: FilterGroupConfig[]
  dateRangeGroups?: DateRangeGroupConfig[]
  /** Map of key → selected option values. */
  active: Record<string, string[]>
  activeDateRanges?: Record<string, DateRangeValue>
  /** Replace the full active maps in one go. */
  onChange: (
    nextFacets: Record<string, string[]>,
    nextDateRanges: Record<string, DateRangeValue>,
  ) => void
  /** Override the default trigger label. */
  triggerLabel?: string
  className?: string
}

export function FilterSheet({
  groups,
  dateRangeGroups = [],
  active,
  activeDateRanges = {},
  onChange,
  triggerLabel = 'Filters',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  // Match the app-wide mobile convention (FormDrawer / WorkEntryEditorSheet):
  // bottom sheet below md, right drawer at md+. One change here flows to every
  // DataTable filter button since FilterSheet is the single shared component.
  const isWide = useMediaQuery('(min-width: 768px)')
  const side = isWide ? 'right' : 'bottom'

  const facetActiveCount = Object.values(active).reduce((sum, vals) => sum + vals.length, 0)
  const rangeActiveCount = Object.values(activeDateRanges).filter((r) => r.from || r.to).length
  const totalActive = facetActiveCount + rangeActiveCount

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {/* Icon-only below md so the toolbar doesn't burn a full label's worth
            of width on narrow screens; the label returns on the desktop table. */}
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5 shrink-0', className)}
          aria-label={typeof triggerLabel === 'string' ? triggerLabel : 'Filters'}
        >
          <ListFilter className="size-3.5 opacity-60" />
          <span className="hidden md:inline">{triggerLabel}</span>
          {totalActive > 0 && (
            <Badge className="min-w-5 justify-center rounded-full px-1 tabular-nums md:ml-0.5">
              {totalActive}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={side}
        className={cn(
          'flex flex-col p-0',
          isWide
            ? 'w-full sm:max-w-md'
            : 'data-[side=bottom]:max-h-[88dvh] data-[side=bottom]:rounded-t-xl',
        )}
      >
        <SheetHeader className="border-b">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription className="sr-only">
            Adjust table filters before applying them to the current list.
          </SheetDescription>
        </SheetHeader>

        {/* Body is keyed on `open` so closing+reopening remounts it with
            fresh staged state initialized from the latest active/range
            props. Avoids the previous setState-in-useEffect re-sync. */}
        {open && (
          <FilterSheetBody
            key={`${facetActiveCount}-${rangeActiveCount}`}
            groups={groups}
            dateRangeGroups={dateRangeGroups}
            initialFacets={active}
            initialDateRanges={activeDateRanges}
            onApply={(facets, ranges) => {
              onChange(facets, ranges)
              setOpen(false)
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function FilterSheetBody({
  groups,
  dateRangeGroups,
  initialFacets,
  initialDateRanges,
  onApply,
}: {
  groups: FilterGroupConfig[]
  dateRangeGroups: DateRangeGroupConfig[]
  initialFacets: Record<string, string[]>
  initialDateRanges: Record<string, DateRangeValue>
  onApply: (
    facets: Record<string, string[]>,
    ranges: Record<string, DateRangeValue>,
  ) => void
}) {
  // Lazy initial state from the props captured at mount; the parent remounts
  // this component (via the keyed render above) whenever the sheet reopens
  // so a fresh stage is captured from the latest URL/searchParams.
  const [staged, setStaged] = useState<Record<string, string[]>>(initialFacets)
  const [stagedRanges, setStagedRanges] = useState<Record<string, DateRangeValue>>(initialDateRanges)
  // Combobox popups (and Select's, via its own DrawerPortalContext read) need
  // a portal container inside the Sheet's Radix focus trap — without this
  // they'd portal to <body> and swallow pointer clicks on their options.
  const [portalNode, setPortalNode] = useState<HTMLDivElement | null>(null)

  function setGroupValues(key: string, values: string[]) {
    setStaged((prev) => ({ ...prev, [key]: values }))
  }

  function setRange(key: string, side: 'from' | 'to', value: string) {
    setStagedRanges((prev) => ({
      ...prev,
      [key]: { from: prev[key]?.from ?? null, to: prev[key]?.to ?? null, [side]: value || null },
    }))
  }

  function clearAll() {
    setStaged({})
    setStagedRanges({})
  }

  function apply() {
    const cleanedFacets: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(staged)) {
      if (v.length > 0) cleanedFacets[k] = v
    }
    const cleanedRanges: Record<string, DateRangeValue> = {}
    for (const [k, v] of Object.entries(stagedRanges)) {
      if (v.from || v.to) cleanedRanges[k] = v
    }
    onApply(cleanedFacets, cleanedRanges)
  }

  return (
    <DrawerPortalContext.Provider value={portalNode}>
      {/* display:contents so this wrapper doesn't affect the flex layout below */}
      <div ref={setPortalNode} className="contents">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-5">
        {groups.length === 0 && dateRangeGroups.length === 0 && (
          <p className="text-sm text-muted-foreground">No filters available.</p>
        )}
        {dateRangeGroups.map((group) => {
          const range = stagedRanges[group.key] ?? { from: null, to: null }
          return (
            <div key={group.key} className="space-y-2">
              <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-micro text-muted-foreground mb-1">From</label>
                  <Input
                    type="date"
                    value={range.from ?? ''}
                    onChange={(e) => setRange(group.key, 'from', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-micro text-muted-foreground mb-1">To</label>
                  <Input
                    type="date"
                    value={range.to ?? ''}
                    onChange={(e) => setRange(group.key, 'to', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {groups.map((group) => {
          const selected = staged[group.key] ?? []
          const isHierarchical = group.options.some((o) => o.parentValue !== undefined)
          return (
            <div key={group.key} className="space-y-2">
              <p className="text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              {isHierarchical ? (
                <CategoryCascadeSelect
                  options={group.options}
                  selected={selected}
                  onChange={(values) => setGroupValues(group.key, values)}
                />
              ) : (
                <FacetMultiSelect
                  label={group.label}
                  options={group.options}
                  selected={selected}
                  onChange={(values) => setGroupValues(group.key, values)}
                />
              )}
            </div>
          )
        })}
      </div>
      </div>

      <SheetFooter className="border-t flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-10"
          onClick={clearAll}
        >
          Clear
        </Button>
        <Button
          type="button"
          className="flex-[2] h-10"
          onClick={apply}
        >
          Apply filters
        </Button>
      </SheetFooter>
    </DrawerPortalContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// FacetMultiSelect — chip-input multi-select dropdown for a flat filter group
// ---------------------------------------------------------------------------

function FacetMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const anchor = useComboboxAnchor()
  return (
    <Combobox items={options} multiple value={selected} onValueChange={onChange}>
      <ComboboxChips ref={anchor}>
        {selected.map((v) => {
          const opt = options.find((o) => o.value === v)
          return (
            <ComboboxChip key={v}>
              {opt?.label ?? v}
            </ComboboxChip>
          )
        })}
        <ComboboxChipsInput placeholder={selected.length === 0 ? `Select ${label.toLowerCase()}…` : undefined} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(item: { value: string; label: string }) => (
            <ComboboxItem key={item.value} value={item.value}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

// ---------------------------------------------------------------------------
// CategoryCascadeSelect — parent dropdown, then an optional dropdown scoped to
// that parent's children. Single-select at each level (a two-step narrowing
// picker, not a multi-select) — selecting a child replaces the parent-only
// selection, and switching parents drops any previously-selected child.
// ---------------------------------------------------------------------------

function CategoryCascadeSelect({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string; parentValue?: string | null }[]
  selected: string[]
  onChange: (values: string[]) => void
}) {
  const parents = options.filter((o) => o.parentValue === null)
  const selectedParent = parents.find((p) => selected.includes(p.value))
  const selectedChild = options.find((o) => o.parentValue != null && selected.includes(o.value))
  const activeParentValue = selectedParent?.value ?? selectedChild?.parentValue ?? null
  const children = activeParentValue
    ? options.filter((o) => o.parentValue === activeParentValue)
    : []

  return (
    <div className="space-y-2">
      <Select
        value={activeParentValue ?? CASCADE_CLEAR}
        onValueChange={(v) => onChange(v === CASCADE_CLEAR ? [] : [v])}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CASCADE_CLEAR}>All categories</SelectItem>
          {parents.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activeParentValue && children.length > 0 && (
        <Select
          value={selectedChild?.value ?? CASCADE_CLEAR}
          onValueChange={(v) => onChange(v === CASCADE_CLEAR ? [activeParentValue] : [v])}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="All in this category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CASCADE_CLEAR}>All in this category</SelectItem>
            {children.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterChipRow — horizontal-scroll row of removable chips for active filters
// ---------------------------------------------------------------------------

type Chip = { key: string; value: string; label: string }

export function FilterChipRow({
  chips,
  onRemove,
}: {
  chips: Chip[]
  onRemove: (key: string, value: string) => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto -mx-4 px-4 no-scrollbar">
      {chips.map((c) => (
        <button
          key={`${c.key}|${c.value}`}
          type="button"
          onClick={() => onRemove(c.key, c.value)}
          className="h-7 touch:h-9 px-2.5 rounded-full border bg-card text-meta flex items-center gap-1 shrink-0 hover:bg-muted/40"
        >
          {c.label}
          <X className="size-3" />
        </button>
      ))}
    </div>
  )
}
