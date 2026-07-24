'use client'

import { useState, useEffect, useMemo, useTransition, useActionState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Trash2, Search, Pencil, Plus } from 'lucide-react'
import { RequiredMark } from '@/components/ui/required-mark'
import DataTable, { type Column, type FilterDef } from '@/components/tables/DataTable'
import { toast } from 'sonner'
import { availableStartTimesForDuration, type BookingScheduleWindow } from '@/lib/booking-time'
import {
  createServiceGroup, updateServiceGroup, deleteServiceGroup, type GroupActionState,
  createService, updateService, deleteService, type ServiceActionState,
  createOffering, updateOffering, deleteOffering, type OfferingPayload,
} from './actions'

// ============================================================
// Types
// ============================================================

export type CatalogGroup = { id: string; name: string; description: string | null }
export type CatalogService = {
  id: string
  name: string
  description: string | null
  price_amount: string
  requires_all_attendees: boolean
  duration_terms: { participant_count: number; duration_minutes: number }[]
  service_group_id: string
  is_active: boolean
}
export type CatalogOffering = {
  id: string
  name: string
  description: string | null
  price_override: string | null
  buffer_minutes: number
  allowed_start_times: string[]
  is_active: boolean
  service_ids: string[]
}

/** Solo (count-1) duration of a service; 0 when no solo term exists. */
function soloMinutes(service: CatalogService | undefined) {
  return service?.duration_terms.find((term) => term.participant_count === 1)?.duration_minutes ?? 0
}

const groupInitial: GroupActionState = { ok: false, error: null }
const serviceInitial: ServiceActionState = { ok: false, error: null }

const BUFFER_OPTIONS = Array.from({ length: 17 }, (_, index) => index * 15)
function formatStartTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`
}

// Deterministic muted tints for service pills, keyed by group index.
const GROUP_TINTS = [
  'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  'bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200',
]

// ============================================================
// Top-level: two stacked sections
// ============================================================

export function CatalogClient({ groups, services, offerings, bookingSchedule }: {
  groups: CatalogGroup[]
  services: CatalogService[]
  offerings: CatalogOffering[]
  bookingSchedule: BookingScheduleWindow[]
}) {
  const groupTintByGroupId = useMemo(() => {
    const map = new Map<string, string>()
    groups.forEach((g, i) => map.set(g.id, GROUP_TINTS[i % GROUP_TINTS.length]))
    return map
  }, [groups])

  const serviceById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  )

  return (
    <div className="space-y-6">
      <OfferingsSection
        offerings={offerings}
        services={services}
        groups={groups}
        serviceById={serviceById}
        groupTintByGroupId={groupTintByGroupId}
        bookingSchedule={bookingSchedule}
      />
      <ServicesSection services={services} groups={groups} />
    </div>
  )
}

function SectionHeader({ title, count, search, setSearch, placeholder, onNew, newDisabled }: {
  title: string
  count: number
  search: string
  setSearch: (v: string) => void
  placeholder: string
  onNew: () => void
  newDisabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 border-b pb-1.5">
      <h2 className="text-sm font-semibold shrink-0">
        {title} <span className="text-muted-foreground font-normal tabular-nums">{count}</span>
      </h2>
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="pl-7 h-7 text-sm"
        />
      </div>
      <div className="flex-1" />
      <Button size="sm" className="h-7 px-2.5 text-xs" onClick={onNew} disabled={newDisabled}>New</Button>
    </div>
  )
}

// ============================================================
// Offerings section
// ============================================================

type OfferingTableRow = CatalogOffering & {
  min_minutes: number
  price: number
  services_label: string
}

const OFFERING_FILTERS: FilterDef<OfferingTableRow>[] = [
  {
    label: 'Status',
    accessor: (row, value) => (value === 'draft' ? !row.is_active : row.is_active),
    options: [
      { label: 'active', value: 'active' },
      { label: 'draft', value: 'draft' },
    ],
  },
]

function OfferingsSection({ offerings, services, groups, serviceById, groupTintByGroupId, bookingSchedule }: {
  offerings: CatalogOffering[]
  services: CatalogService[]
  groups: CatalogGroup[]
  serviceById: Map<string, CatalogService>
  groupTintByGroupId: Map<string, string>
  bookingSchedule: BookingScheduleWindow[]
}) {
  const [editing, setEditing] = useState<CatalogOffering | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<CatalogOffering | null>(null)

  const rows = useMemo<OfferingTableRow[]>(() => offerings.map((o) => {
    const memberServices = o.service_ids
      .map((sid) => serviceById.get(sid))
      .filter((s): s is CatalogService => Boolean(s))
    const minDuration = memberServices.reduce((acc, s) => acc + soloMinutes(s), 0)
    const derivedPrice = memberServices.reduce((acc, s) => acc + Number(s.price_amount), 0)
    return {
      ...o,
      min_minutes: minDuration,
      price: o.price_override !== null ? Number(o.price_override) : derivedPrice,
      services_label: memberServices.map((s) => s.name).join(', '),
    }
  }), [offerings, serviceById])

  const canCreate = services.some((s) => s.is_active)

  const columns = useMemo<Column<OfferingTableRow>[]>(() => [
    {
      header: 'Offering',
      accessor: (row) => (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-medium truncate">{row.name}</span>
          {row.price_override !== null && (
            <Badge variant="outline" className="h-5 text-[10px] px-1.5 shrink-0 font-normal">fixed price</Badge>
          )}
          {row.buffer_minutes > 0 && (
            <Badge variant="outline" className="h-5 text-[10px] px-1.5 shrink-0 font-normal">+ {row.buffer_minutes}m buffer</Badge>
          )}
          {row.allowed_start_times.length > 0 && (
            <Badge variant="outline" className="h-5 text-[10px] px-1.5 shrink-0 font-normal">
              {row.allowed_start_times.length === 1
                ? formatStartTime(row.allowed_start_times[0])
                : `${row.allowed_start_times.length} start times`}
            </Badge>
          )}
          {!row.is_active && (
            <Badge variant="secondary" className="h-5 text-[10px] px-1.5 shrink-0">draft</Badge>
          )}
        </span>
      ),
      mobileAccessor: (row) => row.name,
      sortKey: 'name',
      sortable: true,
      mobile: 'title',
    },
    {
      header: 'Services',
      accessor: (row) => (
        row.service_ids.length === 0 ? (
          <span className="text-[11px] text-muted-foreground italic">No services</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            {row.service_ids.map((sid) => {
              const s = serviceById.get(sid)
              if (!s) return null
              const tint = groupTintByGroupId.get(s.service_group_id) ?? ''
              return (
                <span
                  key={sid}
                  className={`inline-flex items-center h-5 rounded-4xl px-2 text-[11px] font-medium whitespace-nowrap ${tint}`}
                >
                  {s.name}
                </span>
              )
            })}
          </span>
        )
      ),
      mobileAccessor: (row) => row.services_label || 'No services',
      mobile: 'subtitle',
    },
    {
      header: 'Duration',
      accessor: (row) => `from ${row.min_minutes}m`,
      sortKey: 'min_minutes',
      sortable: true,
      className: 'text-right',
      cellClassName: 'text-right tabular-nums text-muted-foreground whitespace-nowrap',
      mobile: 'metadata',
    },
    {
      header: 'Price',
      accessor: (row) => `$${row.price.toFixed(0)}`,
      sortKey: 'price',
      sortable: true,
      className: 'text-right',
      cellClassName: 'text-right tabular-nums font-medium',
      mobile: 'trailing',
    },
    {
      header: '',
      accessor: (row) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(row) }}
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
      className: 'w-10',
      cellClassName: 'text-right',
      mobile: 'compactAction',
    },
  ], [serviceById, groupTintByGroupId])

  return (
    <section className="space-y-2">
      <DataTable
        title="Offerings"
        data={rows}
        columns={columns}
        searchKeys={['name']}
        searchPlaceholder="Search offerings…"
        filters={OFFERING_FILTERS}
        emptyMessage={canCreate ? 'No offerings yet.' : 'Create at least one active service first.'}
        actions={(
          <Button
            size="sm"
            className="h-8 px-2.5 text-xs"
            onClick={() => { setEditing(null); setOpen(true) }}
            disabled={!canCreate}
          >
            New
          </Button>
        )}
        onRowClick={(row) => { setEditing(offerings.find((o) => o.id === row.id) ?? null); setOpen(true) }}
      />

      <OfferingSheet
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        services={services}
        groups={groups}
        bookingSchedule={bookingSchedule}
      />
      <DeleteConfirm
        item={confirmDelete}
        title="Delete offering"
        description="The offering and its service links will be removed. Existing bookings keep their frozen offering data."
        onClose={() => setConfirmDelete(null)}
        onDelete={(id) => deleteOffering(id)}
      />
    </section>
  )
}

function OfferingSheet({ open, onOpenChange, editing, services, groups, bookingSchedule }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: CatalogOffering | null
  services: CatalogService[]
  groups: CatalogGroup[]
  bookingSchedule: BookingScheduleWindow[]
}) {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [priceOverride, setPriceOverride] = useState<string>('')
  const [bufferMinutes, setBufferMinutes] = useState<number>(0)
  const [restrictStartTimes, setRestrictStartTimes] = useState(false)
  const [allowedStartTimes, setAllowedStartTimes] = useState<string[]>([])
  const [openServiceGroup, setOpenServiceGroup] = useState<string | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- opening the controlled sheet intentionally resets its draft fields from the selected catalog row. */
  useEffect(() => {
    if (!open) return
    setName(editing?.name ?? '')
    setDescription(editing?.description ?? '')
    setServiceIds(editing?.service_ids ?? [])
    setPriceOverride(editing?.price_override ?? '')
    setBufferMinutes(editing?.buffer_minutes ?? 0)
    setRestrictStartTimes(Boolean(editing?.allowed_start_times.length))
    setAllowedStartTimes(editing?.allowed_start_times ?? [])
    setOpenServiceGroup(null)
    setIsActive(editing?.is_active ?? true)
    setError(null)
  }, [open, editing])
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedServices = useMemo(
    () => services.filter((s) => serviceIds.includes(s.id)),
    [serviceIds, services],
  )
  // Minimum duration: every member service at 1 attendee. Start-time
  // options are validated against this floor — the participation
  // matrix can only lengthen a booking.
  const minTime = selectedServices.reduce((acc, s) => acc + soloMinutes(s), 0)
  const derivedPrice = selectedServices.reduce((acc, s) => acc + Number(s.price_amount), 0)
  const startTimeOptions = useMemo(
    () => availableStartTimesForDuration(bookingSchedule, minTime),
    [bookingSchedule, minTime],
  )
  const effectiveAllowedStartTimes = allowedStartTimes.filter((time) => startTimeOptions.includes(time))

  function toggleService(id: string) {
    setServiceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  function toggleStartTime(time: string) {
    setAllowedStartTimes((current) => (
      current.includes(time)
        ? current.filter((value) => value !== time)
        : [...current, time].sort()
    ))
  }

  function submit() {
    if (serviceIds.length === 0) { setError('Select at least one service'); return }
    if (!name.trim()) { setError('Name is required'); return }
    if (priceOverride && !/^\d{1,8}(?:\.\d{1,2})?$/.test(priceOverride)) { setError('Package override must use at most two decimals'); return }
    if (restrictStartTimes && effectiveAllowedStartTimes.length === 0) { setError('Select at least one available start time'); return }
    if (minTime <= 0) { setError('Every selected service needs a duration term for 1 participant'); return }

    const payload: OfferingPayload = {
      name: name.trim(),
      description: description.trim() || null,
      price_override: priceOverride || null,
      buffer_minutes: bufferMinutes,
      allowed_start_times: restrictStartTimes ? effectiveAllowedStartTimes : [],
      is_active: isActive,
      service_ids: serviceIds,
    }

    setError(null)
    startTransition(async () => {
      const result = editing?.id
        ? await updateOffering(editing.id, payload)
        : await createOffering(payload)
      if (!result.ok) { setError(result.error); return }
      toast.success(editing ? 'Offering updated' : 'Offering created')
      onOpenChange(false)
    })
  }

  const groupedServices = groups
    .map((g) => ({ group: g, items: services.filter((s) => s.service_group_id === g.id && s.is_active) }))
    .filter((g) => g.items.length > 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader className="gap-1 pb-2">
          <SheetTitle className="text-base">{editing ? 'Edit offering' : 'New offering'}</SheetTitle>
          <SheetDescription className="text-xs">Durations and prices come from the member services&apos; duration terms and seat prices; set an override for a fixed package price.</SheetDescription>
        </SheetHeader>
        <div className="px-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Services<RequiredMark /> <span className="text-muted-foreground font-normal">· {serviceIds.length} selected</span></Label>
            {groupedServices.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center border rounded">No active services.</p>
            ) : (
              <div className="overflow-hidden rounded border divide-y">
                {groupedServices.map(({ group, items }, index) => {
                  const expanded = openServiceGroup === group.id || (openServiceGroup === null && index === 0)
                  const selectedCount = items.filter((item) => serviceIds.includes(item.id)).length
                  return (
                  <div key={group.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 bg-muted/35 px-3 py-2 text-left hover:bg-muted/60"
                      aria-expanded={expanded}
                      onClick={() => setOpenServiceGroup(expanded ? '__closed__' : group.id)}
                    >
                      <span className="flex-1 text-xs font-medium">{group.name}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {selectedCount ? `${selectedCount} selected` : `${items.length} services`}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
                    </button>
                    {expanded && <ul className="border-t">
                      {items.map((s) => {
                        const checked = serviceIds.includes(s.id)
                        return (
                          <li key={s.id}>
                            <label className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-accent/40 text-sm">
                              <Checkbox checked={checked} onCheckedChange={() => toggleService(s.id)} />
                              <span className="flex-1 truncate">{s.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{soloMinutes(s)}m solo</span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>}
                  </div>
                )})}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="offering-name" className="text-xs">Name<RequiredMark /></Label>
            <Input id="offering-name" className="h-8" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="offering-description" className="text-xs">Description</Label>
            <Textarea id="offering-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="offering-price-override" className="text-xs">Package price override (CAD)</Label>
            <Input
              id="offering-price-override"
              className="h-8"
              inputMode="decimal"
              placeholder={`Blank = sum of service seat prices ($${derivedPrice.toFixed(2)})`}
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">The booking engine uses this fixed package price when set; otherwise it derives the base from member services.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="offering-buffer" className="text-xs">Buffer after booking<RequiredMark /></Label>
            <Select value={String(bufferMinutes)} onValueChange={(value) => setBufferMinutes(Number(value))}>
              <SelectTrigger id="offering-buffer" className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUFFER_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes === 0 ? 'No buffer' : `${minutes} minutes`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Clients can start on the hour or half-hour. The session time rounds up to a 30-minute block, then this buffer prevents another booking immediately afterward.
            </p>
          </div>

          <div className="border rounded">
            <label className="flex items-center justify-between px-3 py-2 cursor-pointer">
              <span>
                <span className="block text-sm">Limit available start times</span>
                <span className="block text-[11px] text-muted-foreground">Off means this offering can use any available time.</span>
              </span>
              <Switch checked={restrictStartTimes} onCheckedChange={setRestrictStartTimes} />
            </label>
            {restrictStartTimes && (
              <div className="border-t px-3 py-2 space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  These starts fit the offering&apos;s current total time within at least one open day in the global weekly schedule.
                </p>
                {startTimeOptions.length === 0 ? (
                  <p className="rounded border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    This offering does not fit within any open day in the global weekly schedule.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 sm:grid-cols-4 max-h-48 overflow-y-auto pr-1">
                    {startTimeOptions.map((time) => (
                      <label key={time} className="flex items-center gap-1.5 py-1 cursor-pointer text-xs tabular-nums">
                        <Checkbox
                          checked={effectiveAllowedStartTimes.includes(time)}
                          onCheckedChange={() => toggleStartTime(time)}
                        />
                        {formatStartTime(time)}
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-[11px] font-medium">
                  {effectiveAllowedStartTimes.length === 0
                    ? 'No start times selected'
                    : `${effectiveAllowedStartTimes.length} start ${effectiveAllowedStartTimes.length === 1 ? 'time' : 'times'} selected`}
                </p>
              </div>
            )}
          </div>

          <dl className="border rounded px-3 py-2 text-sm space-y-1 tabular-nums">
            <div className="flex justify-between font-medium">
              <dt>Minimum duration (solo)</dt><dd>{minTime} min</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Derived package price</dt><dd>${derivedPrice.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Minimum calendar occupied</dt><dd>{minTime + bufferMinutes} min</dd>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1 border-t">
              Actual duration and price are computed per booking from the attendance matrix.
            </p>
          </dl>

          <label className="flex items-center justify-between border rounded px-3 py-2 cursor-pointer">
            <span className="text-sm">Active</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </label>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <SheetFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : editing ? 'Save' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================
// Services section — grouped by service group, with inline group management
// ============================================================

function ServicesSection({ services, groups }: { services: CatalogService[]; groups: CatalogGroup[] }) {
  const [search, setSearch] = useState('')
  const [editingService, setEditingService] = useState<CatalogService | null>(null)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [confirmDeleteService, setConfirmDeleteService] = useState<CatalogService | null>(null)
  const [editingGroup, setEditingGroup] = useState<CatalogGroup | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<CatalogGroup | null>(null)

  const q = search.trim().toLowerCase()
  const grouped = useMemo(() => {
    return groups
      .map((g) => {
        const items = services
          .filter((s) => s.service_group_id === g.id)
          .filter((s) => !q || s.name.toLowerCase().includes(q))
        return { group: g, items }
      })
      .filter((g) => !q || g.items.length > 0)
  }, [groups, services, q])

  const filteredCount = grouped.reduce((acc, g) => acc + g.items.length, 0)
  const hasMatches = q ? filteredCount > 0 : services.length > 0

  return (
    <section className="space-y-2">
      <SectionHeader
        title="Services"
        count={services.length}
        search={search}
        setSearch={setSearch}
        placeholder="Search services…"
        onNew={() => { setEditingService(null); setServiceOpen(true) }}
      />

      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center border rounded">
          No services yet. Click <span className="font-medium">New</span> to create your first service and group.
        </p>
      ) : !hasMatches ? (
        <p className="text-xs text-muted-foreground py-4 text-center border rounded">
          {q ? 'No matches.' : 'No services yet.'}
        </p>
      ) : (
        <div className="border rounded text-sm overflow-hidden">
          {grouped.map(({ group, items }) => (
            <div key={group.id} className="not-last:border-b">
              <div className="group/header flex items-center gap-1.5 px-2.5 py-1 bg-muted/40">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium flex-1 truncate">
                  {group.name}
                  {items.length === 0 && (
                    <span className="ml-2 normal-case tracking-normal italic">empty</span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 opacity-0 group-hover/header:opacity-100"
                  onClick={() => { setEditingGroup(group); setGroupOpen(true) }}
                  aria-label="Edit group"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 opacity-0 group-hover/header:opacity-100"
                  onClick={() => setConfirmDeleteGroup(group)}
                  aria-label="Delete group"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {items.length > 0 && (
                <ul className="divide-y">
                  {items.map((s) => (
                    <li
                      key={s.id}
                      className="group flex items-center gap-2 px-2.5 py-1.5 hover:bg-accent/30 cursor-pointer"
                      onClick={() => { setEditingService(s); setServiceOpen(true) }}
                    >
                      <span className="font-medium truncate flex-1 min-w-0">{s.name}</span>
                      <span className="text-xs tabular-nums shrink-0 text-right text-muted-foreground">{s.duration_terms.map((term) => `${term.participant_count}p:${term.duration_minutes}m`).join(' · ')}</span>
                      <span className="text-xs tabular-nums shrink-0 w-16 text-right text-muted-foreground">${s.price_amount}</span>
                      {!s.is_active && <Badge variant="secondary" className="h-4 text-[10px] px-1.5 shrink-0">off</Badge>}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteService(s) }}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <ServiceSheet
        open={serviceOpen}
        onOpenChange={setServiceOpen}
        editing={editingService}
        groups={groups}
      />
      <GroupSheet
        open={groupOpen}
        onOpenChange={setGroupOpen}
        editing={editingGroup}
      />
      <DeleteConfirm
        item={confirmDeleteService}
        title="Delete service"
        description="Offerings that include this service will be affected."
        onClose={() => setConfirmDeleteService(null)}
        onDelete={(id) => deleteService(id)}
      />
      <DeleteConfirm
        item={confirmDeleteGroup}
        title="Delete group"
        description="Services in this group will lose their grouping. Delete or move them first."
        onClose={() => setConfirmDeleteGroup(null)}
        onDelete={(id) => deleteServiceGroup(id)}
      />
    </section>
  )
}

function ServiceSheet({ open, onOpenChange, editing, groups }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: CatalogService | null
  groups: CatalogGroup[]
}) {
  const [groupId, setGroupId] = useState<string>('')
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [groupCreatePending, startGroupCreate] = useTransition()
  const [groupCreateError, setGroupCreateError] = useState<string | null>(null)
  const [priceAmount, setPriceAmount] = useState('0.00')
  const [durationTerms, setDurationTerms] = useState<{ participant_count: number; duration_minutes: number }[]>([
    { participant_count: 1, duration_minutes: 60 },
    { participant_count: 2, duration_minutes: 120 },
  ])

  /* eslint-disable react-hooks/set-state-in-effect -- opening the controlled sheet intentionally resets its draft fields from the selected catalog row. */
  useEffect(() => {
    if (!open) return
    setGroupId(editing?.service_group_id ?? groups[0]?.id ?? '')
    setCreatingGroup(groups.length === 0)
    setNewGroupName('')
    setGroupCreateError(null)
    setPriceAmount(editing?.price_amount ?? '0.00')
    setDurationTerms(editing?.duration_terms.length
      ? editing.duration_terms
      : [{ participant_count: 1, duration_minutes: 60 }])
  }, [open, editing, groups])
  /* eslint-enable react-hooks/set-state-in-effect */

  const action = editing ? updateService.bind(null, editing.id) : createService
  const [state, formAction, pending] = useActionState(action, serviceInitial)

  useEffect(() => {
    if (state.ok) {
      toast.success(editing ? 'Service updated' : 'Service created')
      onOpenChange(false)
    }
  }, [state, editing, onOpenChange])

  function submitNewGroup() {
    const name = newGroupName.trim()
    if (!name) { setGroupCreateError('Name is required'); return }
    setGroupCreateError(null)
    startGroupCreate(async () => {
      const fd = new FormData()
      fd.set('name', name)
      const result = await createServiceGroup(groupInitial, fd)
      if (!result.ok || !result.id) {
        setGroupCreateError(result.error ?? 'Could not create group')
        return
      }
      setGroupId(result.id)
      setCreatingGroup(false)
      setNewGroupName('')
      toast.success('Group created')
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="gap-1 pb-2">
          <SheetTitle className="text-base">{editing ? 'Edit service' : 'New service'}</SheetTitle>
          <SheetDescription className="text-xs">Atomic units offerings bundle together.</SheetDescription>
        </SheetHeader>
        <form action={formAction} className="px-4 space-y-3" key={editing?.id ?? 'new'}>
          <div className="space-y-1.5">
            <Label htmlFor="svc-name" className="text-xs">Name<RequiredMark /></Label>
            <Input id="svc-name" className="h-8" name="name" defaultValue={editing?.name ?? ''} required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="svc-description" className="text-xs">Description</Label>
            <Textarea id="svc-description" name="description" defaultValue={editing?.description ?? ''} maxLength={500} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="svc-price" className="text-xs">Seat price (CAD)<RequiredMark /></Label>
              <Input id="svc-price" className="h-8" name="price_amount" inputMode="decimal" value={priceAmount} onChange={(event) => setPriceAmount(event.target.value)} required />
              <p className="text-[11px] text-muted-foreground leading-snug">Canonical per-attendee price used by the booking engine.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-group" className="text-xs">Group<RequiredMark /></Label>
              {creatingGroup ? (
                <div className="flex gap-1">
                  <Input
                    id="svc-group"
                    className="h-8"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="New group name"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); submitNewGroup() }
                    }}
                    autoFocus
                    required
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-2"
                    onClick={submitNewGroup}
                    disabled={groupCreatePending}
                  >
                    {groupCreatePending ? '…' : 'Add'}
                  </Button>
                  {groups.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => { setCreatingGroup(false); setGroupCreateError(null) }}
                      disabled={groupCreatePending}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ) : (
                <Select name="service_group_id" value={groupId} onValueChange={(v) => {
                  if (v === '__new__') { setCreatingGroup(true); return }
                  setGroupId(v)
                }}>
                  <SelectTrigger id="svc-group" className="h-8">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                    <SelectItem value="__new__">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Plus className="h-3.5 w-3.5" /> Create new group
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              {!creatingGroup && (
                <input type="hidden" name="service_group_id" value={groupId} />
              )}
              {groupCreateError && <p className="text-xs text-destructive" role="alert">{groupCreateError}</p>}
            </div>
          </div>
          <div className="space-y-2 rounded border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-xs">Duration terms<RequiredMark /></Label>
                <p className="text-[11px] text-muted-foreground">Total service duration for each attendance count.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => setDurationTerms((current) => [
                  ...current,
                  { participant_count: Math.max(0, ...current.map((term) => term.participant_count)) + 1, duration_minutes: current.at(-1)?.duration_minutes ?? 60 },
                ])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Count
              </Button>
            </div>
            <input type="hidden" name="duration_terms" value={JSON.stringify(durationTerms)} />
            {durationTerms.map((term, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]" htmlFor={`svc-count-${index}`}>Participants</Label>
                  <Input
                    id={`svc-count-${index}`}
                    className="h-8"
                    type="number"
                    min={1}
                    value={term.participant_count}
                    onChange={(event) => setDurationTerms((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, participant_count: Number(event.target.value) } : item))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]" htmlFor={`svc-duration-${index}`}>Minutes</Label>
                  <Input
                    id={`svc-duration-${index}`}
                    className="h-8"
                    type="number"
                    min={1}
                    max={1440}
                    value={term.duration_minutes}
                    onChange={(event) => setDurationTerms((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, duration_minutes: Number(event.target.value) } : item))}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={term.participant_count === 1}
                  onClick={() => setDurationTerms((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label="Remove duration term"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <label className="flex items-center justify-between border rounded px-3 py-2 cursor-pointer">
            <span className="text-sm">Active</span>
            <Switch name="is_active" defaultChecked={editing?.is_active ?? true} />
          </label>
          <label className="flex items-center justify-between gap-3 border rounded px-3 py-2 cursor-pointer">
            <span className="text-sm">
              Requires all attendees
              <span className="block text-[11px] text-muted-foreground font-normal">Every attendee on a booking joins this service; the public matrix locks the row. Multiple performances trigger the automatic break.</span>
            </span>
            <Switch name="requires_all_attendees" defaultChecked={editing?.requires_all_attendees ?? false} />
          </label>
          {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
          <SheetFooter>
            <Button type="submit" disabled={pending || creatingGroup}>
              {pending ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================
// Group sheet — only reached from the group-header edit affordance now
// ============================================================

function GroupSheet({ open, onOpenChange, editing }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: CatalogGroup | null
}) {
  const action = editing ? updateServiceGroup.bind(null, editing.id) : createServiceGroup
  const [state, formAction, pending] = useActionState(action, groupInitial)

  useEffect(() => {
    if (state.ok) {
      toast.success(editing ? 'Group updated' : 'Group created')
      onOpenChange(false)
    }
  }, [state, editing, onOpenChange])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="gap-1 pb-2">
          <SheetTitle className="text-base">{editing ? 'Edit group' : 'New group'}</SheetTitle>
          <SheetDescription className="text-xs">Categorise services in the catalog.</SheetDescription>
        </SheetHeader>
        <form action={formAction} className="px-4 space-y-3" key={editing?.id ?? 'new'}>
          <div className="space-y-1.5">
            <Label htmlFor="grp-name" className="text-xs">Name<RequiredMark /></Label>
            <Input id="grp-name" className="h-8" name="name" defaultValue={editing?.name ?? ''} required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grp-description" className="text-xs">Description</Label>
            <Textarea id="grp-description" name="description" defaultValue={editing?.description ?? ''} maxLength={500} rows={2} />
          </div>
          {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ============================================================
// Shared delete confirmation
// ============================================================

function DeleteConfirm<T extends { id: string; name: string }>({ item, title, description, onClose, onDelete }: {
  item: T | null
  title: string
  description: string
  onClose: () => void
  onDelete: (id: string) => Promise<void>
}) {
  const [pending, startTransition] = useTransition()

  function onConfirm() {
    if (!item) return
    startTransition(async () => {
      try {
        await onDelete(item.id)
        toast.success('Deleted')
        onClose()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete')
      }
    })
  }

  return (
    <AlertDialog open={!!item} onOpenChange={(o) => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}: &ldquo;{item?.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={pending}>
            {pending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
