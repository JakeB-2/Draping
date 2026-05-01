'use client'

const TZ = 'America/Toronto'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { PublicSnapshot, PublicOffering } from '@/lib/snapshot'
import { getAvailableSlots, submitBooking, type DayAvailability, type SubmitPayload } from './actions'

const STEPS = ['Service', 'When', 'Who', 'Review'] as const

type ClientForm = {
  first_name: string
  last_name: string
  email: string
  phone: string
}

const emptyClient: ClientForm = { first_name: '', last_name: '', email: '', phone: '' }

function peopleLabel(n: number) {
  return n === 1 ? '1 person' : `${n} people`
}

function durationLabel(o: PublicOffering): string {
  return o.break_required && o.break_minutes > 0
    ? `${o.duration_minutes} min · incl. ${o.break_minutes} min break`
    : `${o.duration_minutes} min`
}

export function BookingFlow({ snapshot }: { snapshot: PublicSnapshot }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, startTransition] = useTransition()

  // Step 1
  const [selectedOfferingId, setSelectedOfferingId] = useState<string | null>(null)
  const [filters, setFilters] = useState<OfferingFilters>(() => ({
    serviceIds: [],
    people: 'any',
    maxMinutes: snapshot.offerings.reduce((m, o) => Math.max(m, o.duration_minutes), 0),
  }))

  const offering: PublicOffering | null = useMemo(
    () => snapshot.offerings.find((o) => o.id === selectedOfferingId) ?? null,
    [snapshot.offerings, selectedOfferingId],
  )

  function selectOffering(id: string | null) {
    setSelectedOfferingId(id)
    setChosenIso(null)
  }

  // Step 2
  const [chosenIso, setChosenIso] = useState<string | null>(null)

  // Step 3 — clients array sized to offering.people_count
  const [clients, setClients] = useState<ClientForm[]>([emptyClient])
  const [notes, setNotes] = useState('')

  // Resize clients array when the offering changes.
  useEffect(() => {
    const target = offering?.people_count ?? 1
    setClients((cur) => {
      if (cur.length === target) return cur
      if (cur.length < target) return [...cur, ...Array.from({ length: target - cur.length }, () => emptyClient)]
      return cur.slice(0, target)
    })
  }, [offering])

  function back() {
    setStep((s) => Math.max(0, s - 1))
  }
  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  function canAdvance(): boolean {
    if (step === 0) return !!offering
    if (step === 1) return !!chosenIso
    if (step === 2) {
      if (clients.length === 0) return false
      const primary = clients[0]
      if (!primary.first_name.trim() || !primary.last_name.trim() || !primary.email.trim()) return false
      for (let i = 1; i < clients.length; i++) {
        if (!clients[i].first_name.trim() || !clients[i].last_name.trim()) return false
      }
      return true
    }
    return true
  }

  function onSubmit() {
    if (!offering || !chosenIso) return
    const payload: SubmitPayload = {
      offering_id: offering.id,
      starts_at: chosenIso,
      notes: notes.trim() || null,
      clients: clients.map((c, i) => ({
        first_name: c.first_name.trim(),
        last_name: c.last_name.trim(),
        email: c.email.trim() || (i === 0 ? '' : null),
        phone: c.phone.trim() || null,
      })),
    }
    startTransition(async () => {
      const result = await submitBooking(payload)
      if (result.ok) {
        toast.success('Booking submitted')
        router.push(`/book/confirmation/${result.booking_id}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  function setClientAt(i: number, c: ClientForm) {
    setClients((cur) => cur.map((x, j) => (i === j ? c : x)))
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-8 space-y-8">
      <Stepper step={step} />

      {step === 0 && (
        <OfferingStep
          snapshot={snapshot}
          filters={filters}
          setFilters={setFilters}
          selectedOfferingId={selectedOfferingId}
          setSelectedOfferingId={selectOffering}
        />
      )}

      {step === 1 && offering && (
        <WhenStep
          offeringId={offering.id}
          durationMinutes={offering.duration_minutes}
          chosenIso={chosenIso}
          setChosenIso={setChosenIso}
        />
      )}

      {step === 2 && offering && (
        <WhoStep
          offering={offering}
          clients={clients}
          setClientAt={setClientAt}
          notes={notes}
          setNotes={setNotes}
        />
      )}

      {step === 3 && offering && chosenIso && (
        <ReviewStep
          offering={offering}
          startsAtIso={chosenIso}
          clients={clients}
          notes={notes}
        />
      )}

      <div className="flex items-center justify-between border-t pt-4">
        <Button type="button" variant="ghost" onClick={back} disabled={step === 0 || submitting}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next} disabled={!canAdvance()}>
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" onClick={onSubmit} disabled={!canAdvance() || submitting}>
            {submitting ? 'Submitting…' : 'Submit booking'}
          </Button>
        )}
      </div>
    </div>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm flex-wrap">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${
            i < step ? 'bg-primary text-primary-foreground' : i === step ? 'border border-foreground' : 'border text-muted-foreground'
          }`}>
            {i < step ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className={i === step ? '' : 'text-muted-foreground'}>{label}</span>
          {i < STEPS.length - 1 && <span className="text-muted-foreground mx-1">›</span>}
        </li>
      ))}
    </ol>
  )
}

// --- Step 1: Offering ----------------------------------------
type OfferingFilters = {
  serviceIds: string[]
  people: 'any' | '1' | '2+'
  maxMinutes: number
}

const SLIDER_STEP = 15

function OfferingStep({
  snapshot, filters, setFilters, selectedOfferingId, setSelectedOfferingId,
}: {
  snapshot: PublicSnapshot
  filters: OfferingFilters
  setFilters: (f: OfferingFilters) => void
  selectedOfferingId: string | null
  setSelectedOfferingId: (id: string | null) => void
}) {
  const serviceById = useMemo(
    () => new Map(snapshot.services.map((s) => [s.id, s])),
    [snapshot.services],
  )

  const { sliderMin, sliderMax } = useMemo(() => {
    if (snapshot.offerings.length === 0) return { sliderMin: 0, sliderMax: 0 }
    const durations = snapshot.offerings.map((o) => o.duration_minutes)
    const rawMin = Math.min(...durations)
    const rawMax = Math.max(...durations)
    const floor = Math.max(0, Math.floor(rawMin / SLIDER_STEP) * SLIDER_STEP)
    const ceil = Math.ceil(rawMax / SLIDER_STEP) * SLIDER_STEP
    return { sliderMin: floor, sliderMax: ceil }
  }, [snapshot.offerings])

  const filtered = useMemo(() => {
    const list = snapshot.offerings.filter((o) => {
      if (filters.serviceIds.length > 0) {
        if (!filters.serviceIds.some((sid) => o.service_ids.includes(sid))) return false
      }
      if (filters.people === '1' && o.people_count !== 1) return false
      if (filters.people === '2+' && o.people_count < 2) return false
      if (o.duration_minutes > filters.maxMinutes) return false
      return true
    })
    return list.sort((a, b) => a.duration_minutes - b.duration_minutes)
  }, [snapshot.offerings, filters])

  function toggleService(id: string) {
    const next = filters.serviceIds.includes(id)
      ? filters.serviceIds.filter((x) => x !== id)
      : [...filters.serviceIds, id]
    setFilters({ ...filters, serviceIds: next })
  }

  const maxLabel = filters.maxMinutes >= 60
    ? `${Math.floor(filters.maxMinutes / 60)}h${filters.maxMinutes % 60 ? ` ${filters.maxMinutes % 60}m` : ''}`
    : `${filters.maxMinutes}m`

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 1</p>
        <h1 className="text-2xl font-light mt-1">Pick a session</h1>
      </div>

      <div className="space-y-4 border rounded-md p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Filter</p>
        {snapshot.services.length > 0 && (
          <div className="space-y-2">
            <Label>Service</Label>
            <div className="flex flex-wrap gap-2">
              {snapshot.services.map((s) => {
                const sel = filters.serviceIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={`px-3 py-1 rounded-full border text-sm ${sel ? 'bg-foreground text-background border-foreground' : 'border-input hover:bg-accent/40'}`}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="filter-people">Group size</Label>
          <select
            id="filter-people"
            value={filters.people}
            onChange={(e) => setFilters({ ...filters, people: e.target.value as OfferingFilters['people'] })}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="any">Any</option>
            <option value="1">1 person</option>
            <option value="2+">2 or more</option>
          </select>
        </div>
        {sliderMax > sliderMin && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="filter-max-minutes">Max time</Label>
              <span className="text-sm text-muted-foreground tabular-nums">{maxLabel}</span>
            </div>
            <input
              id="filter-max-minutes"
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={SLIDER_STEP}
              value={Math.min(sliderMax, Math.max(sliderMin, filters.maxMinutes))}
              onChange={(e) => setFilters({ ...filters, maxMinutes: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center border rounded-md">
          No sessions match these filters.
        </p>
      ) : (
        <ul className="border rounded-md divide-y">
          {filtered.map((o) => {
            const sel = o.id === selectedOfferingId
            const services = o.service_ids
              .map((sid) => serviceById.get(sid)?.name)
              .filter((n): n is string => !!n)
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setSelectedOfferingId(o.id)}
                  className={`w-full text-left px-4 py-4 transition-colors ${sel ? 'bg-accent/40' : 'hover:bg-accent/30'}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">{o.name}</p>
                    <span className="text-sm font-medium shrink-0">${o.price_amount.toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {durationLabel(o)} · {peopleLabel(o.people_count)}
                  </p>
                  {services.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Includes: {services.join(', ')}
                    </p>
                  )}
                  {o.description && <p className="text-sm text-muted-foreground mt-2">{o.description}</p>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// --- Step 2: When --------------------------------------------
function WhenStep({
  offeringId, durationMinutes, chosenIso, setChosenIso,
}: {
  offeringId: string
  durationMinutes: number
  chosenIso: string | null
  setChosenIso: (iso: string | null) => void
}) {
  const [days, setDays] = useState<DayAvailability[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeDate, setActiveDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDays(null)
    setError(null)
    const today = new Date()
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const fromYmd = ymd(today)
    const to = new Date(today); to.setDate(to.getDate() + 30)
    const toYmd = ymd(to)

    getAvailableSlots(offeringId, fromYmd, toYmd).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setDays(res.days)
        const firstWithSlots = res.days.find((d) => d.slot_isos.length > 0)
        setActiveDate(firstWithSlots?.date ?? null)
      } else {
        setError(res.error)
      }
    })
    return () => { cancelled = true }
  }, [offeringId])

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!days) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  const open = days.filter((d) => d.is_open && d.slot_isos.length > 0)
  const active = open.find((d) => d.date === activeDate)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 2</p>
        <h1 className="text-2xl font-light mt-1">When works for you?</h1>
      </div>

      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center border rounded-md">
          No open slots in the next 30 days. Try again later.
        </p>
      ) : (
        <>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Date</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {open.map((d) => {
                const date = new Date(d.date + 'T00:00:00')
                const sel = d.date === activeDate
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => { setActiveDate(d.date); setChosenIso(null) }}
                    className={`shrink-0 px-3 py-2 rounded-md border text-sm ${sel ? 'bg-foreground text-background border-foreground' : 'border-input hover:bg-accent/40'}`}
                  >
                    <div className="text-xs uppercase">{date.toLocaleDateString('en-CA', { weekday: 'short', timeZone: TZ })}</div>
                    <div className="font-medium">{date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: TZ })}</div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Time</p>
            {active ? (
              <>
                <select
                  value={chosenIso ?? ''}
                  onChange={(e) => setChosenIso(e.target.value || null)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                >
                  <option value="">Select a start time</option>
                  {active.slot_isos.map((iso) => {
                    const label = new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
                    return <option key={iso} value={iso}>{label}</option>
                  })}
                </select>
                {chosenIso && (
                  <p className="text-sm text-muted-foreground">
                    Ends at{' '}
                    <span className="text-foreground font-medium">
                      {new Date(new Date(chosenIso).getTime() + durationMinutes * 60_000)
                        .toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: TZ })}
                    </span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Pick a date to see available times.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// --- Step 3: Who ---------------------------------------------
function WhoStep({
  offering, clients, setClientAt, notes, setNotes,
}: {
  offering: PublicOffering
  clients: ClientForm[]
  setClientAt: (i: number, c: ClientForm) => void
  notes: string
  setNotes: (s: string) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 3</p>
        <h1 className="text-2xl font-light mt-1">{offering.people_count > 1 ? "Who's coming?" : 'Your details'}</h1>
        {offering.people_count > 1 && (
          <p className="text-sm text-muted-foreground mt-2">This session is for {peopleLabel(offering.people_count)}.</p>
        )}
      </div>

      {clients.map((c, i) => (
        <div key={i} className={i === 0 ? 'space-y-4' : 'space-y-4 border-t pt-6'}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {clients.length === 1 ? 'Your details' : `Person ${i + 1}`}
          </p>
          <ClientFields index={i} value={c} onChange={(next) => setClientAt(i, next)} requireEmail={i === 0} />
        </div>
      ))}

      <div className="space-y-2">
        <Label htmlFor="notes">Anything we should know?</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Allergies, mobility needs, gift context, etc." />
      </div>
    </div>
  )
}

function ClientFields({ index, value, onChange, requireEmail }: { index: number; value: ClientForm; onChange: (c: ClientForm) => void; requireEmail: boolean }) {
  const set = (k: keyof ClientForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`fn-${index}`}>First name</Label>
          <Input id={`fn-${index}`} value={value.first_name} onChange={set('first_name')} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`ln-${index}`}>Last name</Label>
          <Input id={`ln-${index}`} value={value.last_name} onChange={set('last_name')} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`em-${index}`}>Email{requireEmail && <span className="text-destructive"> *</span>}</Label>
        <Input id={`em-${index}`} type="email" value={value.email} onChange={set('email')} required={requireEmail} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`ph-${index}`}>Phone</Label>
        <Input id={`ph-${index}`} type="tel" value={value.phone} onChange={set('phone')} />
      </div>
    </div>
  )
}

// --- Step 4: Review ------------------------------------------
function ReviewStep({
  offering, startsAtIso, clients, notes,
}: {
  offering: PublicOffering
  startsAtIso: string
  clients: ClientForm[]
  notes: string
}) {
  const date = new Date(startsAtIso)
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Step 4</p>
        <h1 className="text-2xl font-light mt-1">Looks right?</h1>
      </div>

      <div className="border rounded-md p-4 space-y-4">
        <Section label="Session">
          <p className="font-medium">{offering.name}</p>
          <p className="text-sm text-muted-foreground">
            {durationLabel(offering)} · ${offering.price_amount.toFixed(2)} · {peopleLabel(offering.people_count)}
          </p>
        </Section>
        <Section label="When">
          <p className="font-medium">
            {date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ })}
          </p>
          <p className="text-sm text-muted-foreground">
            {date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: TZ })}
          </p>
        </Section>
        <Section label={clients.length === 1 ? 'You' : 'Who'}>
          {clients.map((c, i) => (
            <div key={i} className={i === 0 ? '' : 'mt-3'}>
              <p className="font-medium">{c.first_name} {c.last_name}</p>
              {c.email && <p className="text-sm text-muted-foreground">{c.email}</p>}
            </div>
          ))}
        </Section>
        {notes && (
          <Section label="Notes">
            <p className="text-sm whitespace-pre-wrap">{notes}</p>
          </Section>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        By booking you agree to the cancellation policy. The owner will confirm by email.
      </p>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b last:border-0 pb-4 last:pb-0 space-y-1">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}
