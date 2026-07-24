'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ParticipantInput, Quote, SegmentInput, StartsResult } from '@/lib/booking-engine'
import { formatInTimeZone } from '@/lib/time-zone'
import {
  createAdminBooking,
  quoteAdminBooking,
  reviseAdminBooking,
  startsForAdminBooking,
} from './editor-actions'
import type {
  BookingEditorProps,
  EditableSegment,
} from './booking-editor-types'

type Configuration = {
  offering_id: string
  participants: ParticipantInput[]
  segments: SegmentInput[]
  manual_adjustments: { label: string; amount: string }[]
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(key: string, count: number) {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() + count)
  return dateKey(date)
}

function displayMoney(amount: string) {
  return amount.startsWith('-') ? `-$${amount.slice(1)}` : `$${amount}`
}

function newEditorId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function formatStart(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function BookingEditor({ mode, clients, offerings, maxParticipants, timezone, initial }: BookingEditorProps) {
  const router = useRouter()
  const initialDay = initial?.starts_at?.slice(0, 10) || dateKey(new Date())
  const [offeringId, setOfferingId] = useState(initial?.offering_id ?? '')
  const [participants, setParticipants] = useState<ParticipantInput[]>(
    initial?.participants ?? [{ role: 'primary', display_name: '', client_id: null }],
  )
  const [segments, setSegments] = useState<EditableSegment[]>(initial?.segments ?? [])
  const [adjustments, setAdjustments] = useState(initial?.manual_adjustments ?? [])
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [startsAt, setStartsAt] = useState(initial?.starts_at ?? '')
  const [fromDate, setFromDate] = useState(initialDay)
  const [toDate, setToDate] = useState(addDays(initialDay, 30))
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [startsResult, setStartsResult] = useState<StartsResult | null>(null)
  const [startsError, setStartsError] = useState<string | null>(null)
  const [loadingQuote, setLoadingQuote] = useState(false)
  const [loadingStarts, setLoadingStarts] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const requestId = useRef(0)

  const offering = offerings.find((item) => item.id === offeringId) ?? null
  const serviceById = useMemo(
    () => new Map((offering?.services ?? []).map((service) => [service.id, service])),
    [offering],
  )
  const configuration: Configuration = useMemo(() => ({
    offering_id: offeringId,
    participants,
    segments: segments.map((segment) => segment.kind === 'service'
      ? { kind: 'service', service_id: segment.service_id, participants: segment.participants, label: segment.label }
      : { kind: 'break', duration_minutes: segment.duration_minutes, label: segment.label }),
    manual_adjustments: adjustments,
  }), [adjustments, offeringId, participants, segments])
  const configurationKey = JSON.stringify(configuration)
  const configurationReady = Boolean(
    offeringId
      && participants.length
      && participants[0]?.client_id
      && participants.every((participant) => participant.display_name.trim())
      && segments.some((segment) => segment.kind === 'service'),
  )

  useEffect(() => {
    if (!configurationReady) return
    const id = ++requestId.current
    const timer = window.setTimeout(async () => {
      setLoadingQuote(true)
      const result = await quoteAdminBooking(configuration)
      if (id !== requestId.current) return
      setLoadingQuote(false)
      if (result.ok) {
        setQuote(result.data)
        setQuoteError(null)
      } else {
        setQuote(null)
        setQuoteError(result.error)
      }
    }, 250)
    return () => window.clearTimeout(timer)
    // configurationKey intentionally represents the complete serializable editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurationKey, configurationReady])

  async function refreshStarts() {
    if (!configurationReady || !fromDate || !toDate) return
    setLoadingStarts(true)
    const result = await startsForAdminBooking(
      configuration,
      fromDate,
      toDate,
      mode === 'revise' ? initial?.booking_id : undefined,
    )
    setLoadingStarts(false)
    if (result.ok) {
      setStartsResult(result.data)
      setStartsError(null)
    } else {
      setStartsResult(null)
      setStartsError(result.error)
    }
  }

  useEffect(() => {
    if (!configurationReady || !quote) return
    const timer = window.setTimeout(() => void refreshStarts(), 350)
    return () => window.clearTimeout(timer)
    // refresh when the authoritative quote or date range changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configurationKey, configurationReady, fromDate, toDate, quote?.duration_minutes])

  const startOptions = (startsResult?.days ?? []).flatMap((day) => day.start_isos)
  const selectedStartIsValid = Boolean(startsAt && startOptions.includes(startsAt))
  const authoritativeQuote = configurationReady ? quote : null

  function chooseOffering(nextId: string) {
    setOfferingId(nextId)
    const next = offerings.find((item) => item.id === nextId)
    setSegments((next?.services ?? []).map((service) => ({
      editor_id: newEditorId('service'),
      kind: 'service',
      service_id: service.id,
      participants: [0],
    })))
    setStartsAt('')
    setSubmitError(null)
  }

  function choosePrimary(clientId: string) {
    const client = clients.find((item) => item.id === clientId)
    setParticipants((current) => current.map((participant, index) => index === 0
      ? { ...participant, client_id: clientId, display_name: client?.display_name ?? '' }
      : participant))
  }

  function addParticipant() {
    if (participants.length >= maxParticipants) return
    setParticipants((current) => [...current, { role: 'additional', display_name: '', client_id: null }])
  }

  function removeParticipant(index: number) {
    if (index === 0) return
    setParticipants((current) => current.filter((_, participantIndex) => participantIndex !== index))
    setSegments((current) => current.reduce<EditableSegment[]>((nextSegments, segment) => {
      if (segment.kind === 'break') {
        nextSegments.push(segment)
        return nextSegments
      }
      const nextParticipants = segment.participants
        .filter((participantIndex) => participantIndex !== index)
        .map((participantIndex) => participantIndex > index ? participantIndex - 1 : participantIndex)
      if (nextParticipants.length) nextSegments.push({ ...segment, participants: nextParticipants })
      return nextSegments
    }, []))
  }

  function toggleParticipant(segmentId: string, participantIndex: number, checked: boolean) {
    setSegments((current) => current.flatMap((segment) => {
      if (segment.editor_id !== segmentId || segment.kind !== 'service') return [segment]
      const next = checked
        ? [...new Set([...segment.participants, participantIndex])].sort((a, b) => a - b)
        : segment.participants.filter((index) => index !== participantIndex)
      return next.length ? [{ ...segment, participants: next }] : []
    }))
  }

  function addService(serviceId: string) {
    setSegments((current) => [...current, {
      editor_id: newEditorId('service'),
      kind: 'service',
      service_id: serviceId,
      participants: [0],
    }])
  }

  function addBreak() {
    setSegments((current) => [...current, {
      editor_id: newEditorId('break'),
      kind: 'break',
      duration_minutes: 15,
      label: 'Break',
    }])
  }

  function moveSegment(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= segments.length) return
    setSegments((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function updateBreak(segmentId: string, patch: { duration_minutes?: number; label?: string }) {
    setSegments((current) => current.map((segment) =>
      segment.editor_id === segmentId && segment.kind === 'break' ? { ...segment, ...patch } : segment))
  }

  function submit() {
    setSubmitError(null)
    if (!authoritativeQuote) {
      setSubmitError(quoteError ?? 'Complete the booking configuration first.')
      return
    }
    if (!selectedStartIsValid) {
      setSubmitError('Choose one of the currently available start times.')
      return
    }

    const payload = {
      ...configuration,
      starts_at: startsAt,
      notes: notes.trim() || null,
    }
    startTransition(async () => {
      const result = mode === 'create'
        ? await createAdminBooking(payload)
        : await reviseAdminBooking(initial!.booking_id!, {
            starts_at: payload.starts_at,
            participants: payload.participants,
            segments: payload.segments,
            manual_adjustments: payload.manual_adjustments,
            notes: payload.notes,
          })
      if (!result.ok) {
        setSubmitError(result.error)
        await refreshStarts()
        return
      }
      toast.success(mode === 'create' ? 'Booking created' : 'Booking revised')
      router.push(`/admin/bookings/${result.data.booking_id}`)
      router.refresh()
    })
  }

  const includedServiceIds = new Set(
    segments.filter((segment) => segment.kind === 'service').map((segment) => segment.service_id),
  )
  const missingServices = (offering?.services ?? []).filter((service) => !includedServiceIds.has(service.id))

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Offering and participants</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="offering">Offering</Label>
              <select
                id="offering"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
                value={offeringId}
                disabled={mode === 'revise'}
                onChange={(event) => chooseOffering(event.target.value)}
              >
                <option value="">Choose an offering</option>
                {offerings.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}{item.is_active ? '' : ' (inactive)'}</option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="primary-client">Primary client</Label>
                <select
                  id="primary-client"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={participants[0]?.client_id ?? ''}
                  onChange={(event) => choosePrimary(event.target.value)}
                >
                  <option value="">Choose a client record</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.display_name}{client.email ? ` — ${client.email}` : ''}
                    </option>
                  ))}
                </select>
                {clients.length === 0 && <p className="text-xs text-destructive">Create a client record before creating a booking.</p>}
              </div>

              {participants.slice(1).map((participant, offset) => {
                const index = offset + 1
                return (
                  <div key={index} className="flex items-end gap-2 rounded-md border p-3">
                    <div className="flex-1 space-y-2">
                      <Label htmlFor={`participant-${index}`}>Additional attendee {index}</Label>
                      <Input
                        id={`participant-${index}`}
                        value={participant.display_name}
                        maxLength={200}
                        placeholder="Display name"
                        onChange={(event) => setParticipants((current) => current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, display_name: event.target.value } : item))}
                      />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeParticipant(index)} aria-label="Remove attendee">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}

              <Button variant="outline" size="sm" onClick={addParticipant} disabled={participants.length >= maxParticipants}>
                <Plus className="mr-1.5 h-4 w-4" /> Add attendee
              </Button>
              <p className="text-xs text-muted-foreground">Policy limit: {maxParticipants} participant{maxParticipants === 1 ? '' : 's'}.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">2. Service attendance and timeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {segments.length === 0 && <p className="text-sm text-muted-foreground">Choose an offering, then include at least one service.</p>}
            {segments.map((segment, index) => (
              <div key={segment.editor_id} className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {segment.kind === 'service' ? serviceById.get(segment.service_id)?.name ?? 'Unknown service' : segment.label || 'Break'}
                    </p>
                    <p className="text-xs text-muted-foreground">Timeline position {index + 1}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => moveSegment(index, -1)} aria-label="Move up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={index === segments.length - 1} onClick={() => moveSegment(index, 1)} aria-label="Move down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setSegments((current) => current.filter((item) => item.editor_id !== segment.editor_id))} aria-label="Remove segment">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {segment.kind === 'service' ? (
                  <div className="flex flex-wrap gap-4">
                    {participants.map((participant, participantIndex) => (
                      <label key={participantIndex} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={segment.participants.includes(participantIndex)}
                          onCheckedChange={(checked) => toggleParticipant(segment.editor_id, participantIndex, checked === true)}
                        />
                        {participant.display_name || (participantIndex === 0 ? 'Primary client' : `Attendee ${participantIndex}`)}
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`break-label-${segment.editor_id}`}>Label</Label>
                      <Input
                        id={`break-label-${segment.editor_id}`}
                        value={segment.label ?? ''}
                        maxLength={200}
                        onChange={(event) => updateBreak(segment.editor_id, { label: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`break-duration-${segment.editor_id}`}>Duration (minutes)</Label>
                      <Input
                        id={`break-duration-${segment.editor_id}`}
                        type="number"
                        min={1}
                        max={1440}
                        value={segment.duration_minutes}
                        onChange={(event) => updateBreak(segment.editor_id, { duration_minutes: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={addBreak} disabled={!offeringId}>
                <Plus className="mr-1.5 h-4 w-4" /> Add break
              </Button>
              {missingServices.map((service) => (
                <Button key={service.id} variant="outline" size="sm" onClick={() => addService(service.id)}>
                  <Plus className="mr-1.5 h-4 w-4" /> Restore {service.name}
                </Button>
              ))}
            </div>
            {quoteError && <p className="text-sm text-destructive" role="alert">{quoteError}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">3. Manual adjustments and notes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {adjustments.map((adjustment, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
                <Input
                  aria-label={`Adjustment ${index + 1} label`}
                  placeholder="Reason"
                  value={adjustment.label}
                  maxLength={200}
                  onChange={(event) => setAdjustments((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, label: event.target.value } : item))}
                />
                <Input
                  aria-label={`Adjustment ${index + 1} amount`}
                  placeholder="-20.00"
                  inputMode="decimal"
                  value={adjustment.amount}
                  onChange={(event) => setAdjustments((current) => current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, amount: event.target.value } : item))}
                />
                <Button variant="ghost" size="icon" onClick={() => setAdjustments((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove adjustment">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setAdjustments((current) => [...current, { label: '', amount: '0.00' }])}>
              <Plus className="mr-1.5 h-4 w-4" /> Add adjustment
            </Button>
            <div className="space-y-2">
              <Label htmlFor="booking-notes">Owner notes</Label>
              <Textarea id="booking-notes" rows={4} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">4. Start time</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="from-date">From</Label>
                <Input id="from-date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-date">To</Label>
                <Input id="to-date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshStarts()} disabled={!configurationReady || loadingStarts}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loadingStarts ? 'animate-spin' : ''}`} />
              Refresh available times
            </Button>
            <div className="space-y-2">
              <Label htmlFor="start-time">Available start</Label>
              <select
                id="start-time"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              >
                <option value="">Choose an available start</option>
                {startsAt && !startOptions.includes(startsAt) && (
                  <option value={startsAt}>{formatStart(startsAt, timezone)} — no longer available</option>
                )}
                {startOptions.map((iso) => <option key={iso} value={iso}>{formatStart(iso, timezone)}</option>)}
              </select>
            </div>
            {startsResult && startOptions.length === 0 && <p className="text-sm text-muted-foreground">No valid starts in this range.</p>}
            {startsAt && !selectedStartIsValid && startsResult && (
              <p className="text-sm text-destructive">The selected time does not fit the current duration. Choose another available start.</p>
            )}
            {startsError && <p className="text-sm text-destructive" role="alert">{startsError}</p>}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader><CardTitle className="text-base">Authoritative quote</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {loadingQuote && <p className="text-muted-foreground">Recomputing…</p>}
            {!authoritativeQuote && !loadingQuote && <p className="text-muted-foreground">Complete the matrix to see duration and price.</p>}
            {authoritativeQuote && (
              <>
                <div className="flex justify-between gap-3 font-medium"><span>Duration</span><span>{authoritativeQuote.duration_minutes} min</span></div>
                <div className="border-t pt-3 space-y-2">
                  <PriceRow label="Base package" amount={authoritativeQuote.base_package_amount} />
                  {authoritativeQuote.segments.filter((segment) => segment.kind === 'service').map((segment) => (
                    <PriceRow key={segment.sort_order} label={`${segment.service_name_snapshot} add-on`} amount={segment.addon_amount} />
                  ))}
                  {authoritativeQuote.adjustments.map((adjustment, index) => (
                    <PriceRow key={`${adjustment.kind}-${index}`} label={adjustment.label} amount={adjustment.amount} />
                  ))}
                </div>
                <div className="border-t pt-3 space-y-2">
                  <PriceRow label="Subtotal" amount={authoritativeQuote.subtotal_amount} />
                  <PriceRow label={`Tax (${authoritativeQuote.tax_rate_percent}%)`} amount={authoritativeQuote.tax_amount} />
                  <div className="flex justify-between gap-3 text-base font-semibold"><span>Total</span><span>{displayMoney(authoritativeQuote.total_amount)}</span></div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {submitError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            {submitError} No booking changes were saved.
          </div>
        )}
        <Button className="w-full" size="lg" onClick={submit} disabled={pending || !authoritativeQuote || !selectedStartIsValid}>
          {pending ? 'Validating and saving…' : mode === 'create' ? 'Create booking' : 'Save revision'}
        </Button>
        <p className="text-xs text-muted-foreground">Saving recomputes the quote and re-validates availability atomically.</p>
      </aside>
    </div>
  )
}

function PriceRow({ label, amount }: { label: string; amount: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span>{displayMoney(amount)}</span></div>
}
