'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Coffee,
  Filter,
  Mail,
  MapPin,
  Sparkles,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import type { PublicOffering, PublicSnapshot } from '@/lib/snapshot'
import { addDaysToDateKey, dateKeyInTimeZone, formatInTimeZone } from '@/lib/time-zone'
import {
  getAvailableSlots,
  submitBooking,
  type DayAvailability,
  type SubmitPayload,
} from './actions'

const STEP_LABELS = ['Choose', 'Schedule', 'Details', 'Review'] as const

type ClientForm = {
  first_name: string
  last_name: string
  email: string
  phone: string
}

const createEmptyClient = (): ClientForm => ({ first_name: '', last_name: '', email: '', phone: '' })

function money(amount: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder} min`
  return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`
}

function peopleLabel(count: number) {
  return count === 1 ? '1 person' : `${count} people`
}

function offeringTiming(offering: PublicOffering) {
  if (!offering.break_required || offering.break_minutes <= 0) return minutesLabel(offering.duration_minutes)
  return `${minutesLabel(offering.duration_minutes)} · ${offering.break_minutes} min pause included`
}

function scrollToBooking() {
  requestAnimationFrame(() => {
    document.getElementById('booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

export function BookingFlow({ snapshot, timezone }: { snapshot: PublicSnapshot; timezone: string }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])
  const [peopleFilter, setPeopleFilter] = useState<'all' | '1' | '2+'>('all')
  const [offeringId, setOfferingId] = useState<string | null>(null)
  const [chosenIso, setChosenIso] = useState<string | null>(null)
  const [clients, setClients] = useState<ClientForm[]>([createEmptyClient()])
  const [notes, setNotes] = useState('')
  const [submitting, startTransition] = useTransition()

  const offering = useMemo(
    () => snapshot.offerings.find((item) => item.id === offeringId) ?? null,
    [offeringId, snapshot.offerings],
  )

  function selectOffering(id: string | null) {
    const nextOffering = snapshot.offerings.find((item) => item.id === id) ?? null
    const count = nextOffering?.people_count ?? 1
    setOfferingId(id)
    setClients((current) => Array.from({ length: count }, (_, index) => current[index] ?? createEmptyClient()))
    setChosenIso(null)
  }

  function goToStep(nextStep: number) {
    setStep(Math.max(0, Math.min(3, nextStep)))
    if (nextStep > 0) scrollToBooking()
  }

  function detailsComplete() {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return clients.every((client, index) =>
      client.first_name.trim()
      && client.last_name.trim()
      && (index > 0 || emailPattern.test(client.email.trim())),
    )
  }

  function handleSubmit() {
    if (!offering || !chosenIso) return
    const payload: SubmitPayload = {
      offering_id: offering.id,
      starts_at: chosenIso,
      notes: notes.trim() || null,
      clients: clients.map((client, index) => ({
        first_name: client.first_name.trim(),
        last_name: client.last_name.trim(),
        email: client.email.trim() || (index === 0 ? '' : null),
        phone: client.phone.trim() || null,
      })),
    }

    startTransition(async () => {
      const result = await submitBooking(payload)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.email_warning) toast.warning(result.email_warning)
      else toast.success('Your booking request has been sent')
      router.push(`/book/confirmation/${result.booking_id}`)
    })
  }

  return (
    <div className="booking-experience">
      {step === 0 ? (
        <CatalogStep
          snapshot={snapshot}
          selectedServiceIds={selectedServiceIds}
          setSelectedServiceIds={setSelectedServiceIds}
          peopleFilter={peopleFilter}
          setPeopleFilter={setPeopleFilter}
          offeringId={offeringId}
          setOfferingId={selectOffering}
          onBook={() => goToStep(1)}
        />
      ) : (
        <section className="booking-wizard" id="booking-panel" aria-label="Booking request">
          <div className="booking-wizard__top">
            <button type="button" onClick={() => goToStep(0)} className="booking-wizard__close">
              <ArrowLeft aria-hidden="true" /> Back to services
            </button>
            <Stepper step={step} />
          </div>

          <div key={step} className="booking-stage">
            {step === 1 && offering && (
              <AvailabilityStep
                key={offering.id}
                offering={offering}
                timezone={timezone}
                chosenIso={chosenIso}
                setChosenIso={setChosenIso}
              />
            )}
            {step === 2 && offering && (
              <DetailsStep
                offering={offering}
                clients={clients}
                setClients={setClients}
                notes={notes}
                setNotes={setNotes}
              />
            )}
            {step === 3 && offering && chosenIso && (
              <ReviewStep
                offering={offering}
                startsAt={chosenIso}
                timezone={timezone}
                clients={clients}
                notes={notes}
                onEdit={goToStep}
              />
            )}
          </div>

          <div className="booking-wizard__footer">
            <Button
              type="button"
              variant="ghost"
              onClick={() => goToStep(step - 1)}
              disabled={submitting}
              className="booking-back-button"
            >
              <ArrowLeft aria-hidden="true" /> Back
            </Button>
            <div className="booking-wizard__total">
              <span>Total</span>
              <strong>{offering ? money(offering.price_amount) : '—'}</strong>
              <small>CAD · no payment due now</small>
            </div>
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => goToStep(step + 1)}
                disabled={(step === 1 && !chosenIso) || (step === 2 && !detailsComplete())}
                className="booking-next-button"
              >
                Continue <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="booking-next-button"
              >
                {submitting ? 'Submitting request…' : 'Submit booking request'}
                {!submitting && <ArrowRight aria-hidden="true" />}
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="booking-stepper" aria-label={`Step ${step + 1} of 4: ${STEP_LABELS[step]}`}>
      {STEP_LABELS.map((label, index) => (
        <li key={label} data-active={index === step} data-complete={index < step}>
          <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
          <small>{label}</small>
        </li>
      ))}
    </ol>
  )
}

function CatalogStep({
  snapshot,
  selectedServiceIds,
  setSelectedServiceIds,
  peopleFilter,
  setPeopleFilter,
  offeringId,
  setOfferingId,
  onBook,
}: {
  snapshot: PublicSnapshot
  selectedServiceIds: string[]
  setSelectedServiceIds: (ids: string[]) => void
  peopleFilter: 'all' | '1' | '2+'
  setPeopleFilter: (value: 'all' | '1' | '2+') => void
  offeringId: string | null
  setOfferingId: (id: string | null) => void
  onBook: () => void
}) {
  const serviceById = useMemo(
    () => new Map(snapshot.services.map((service) => [service.id, service])),
    [snapshot.services],
  )
  const selectedOffering = snapshot.offerings.find((offering) => offering.id === offeringId) ?? null

  const matchesPeople = (offering: PublicOffering) =>
    peopleFilter === 'all'
    || (peopleFilter === '1' && offering.people_count === 1)
    || (peopleFilter === '2+' && offering.people_count >= 2)

  const matchingOfferings = snapshot.offerings
    .filter((offering) => matchesPeople(offering)
      && selectedServiceIds.every((serviceId) => offering.service_ids.includes(serviceId)))
    .sort((left, right) => left.price_amount - right.price_amount || left.duration_minutes - right.duration_minutes)

  function serviceIsCompatible(serviceId: string) {
    if (selectedServiceIds.includes(serviceId)) return true
    return snapshot.offerings.some((offering) =>
      matchesPeople(offering)
      && [...selectedServiceIds, serviceId].every((id) => offering.service_ids.includes(id)),
    )
  }

  function toggleService(serviceId: string) {
    if (!serviceIsCompatible(serviceId)) return
    const next = selectedServiceIds.includes(serviceId)
      ? selectedServiceIds.filter((id) => id !== serviceId)
      : [...selectedServiceIds, serviceId]
    setSelectedServiceIds(next)

    const currentOffering = snapshot.offerings.find((offering) => offering.id === offeringId)
    if (currentOffering && !next.every((id) => currentOffering.service_ids.includes(id))) setOfferingId(null)
  }

  function changePeople(value: 'all' | '1' | '2+') {
    setPeopleFilter(value)
    const current = snapshot.offerings.find((offering) => offering.id === offeringId)
    if (current) {
      const remainsValid = value === 'all'
        || (value === '1' && current.people_count === 1)
        || (value === '2+' && current.people_count >= 2)
      if (!remainsValid) setOfferingId(null)
    }
  }

  return (
    <div className="catalog-builder">
      <div className="catalog-builder__toolbar">
        <div>
          <span className="catalog-builder__count">{selectedServiceIds.length || 'Any'}</span>
          <p>{selectedServiceIds.length === 1 ? 'service selected' : 'services selected'}</p>
        </div>
        <div className="people-filter" role="group" aria-label="Group size">
          <span><Users aria-hidden="true" /> Group size</span>
          {(['all', '1', '2+'] as const).map((value) => (
            <button key={value} type="button" data-selected={peopleFilter === value} onClick={() => changePeople(value)}>
              {value === 'all' ? 'Any' : value === '1' ? 'Solo' : 'Together'}
            </button>
          ))}
        </div>
        {(selectedServiceIds.length > 0 || peopleFilter !== 'all') && (
          <button
            type="button"
            className="catalog-clear"
            onClick={() => {
              setSelectedServiceIds([])
              setPeopleFilter('all')
              setOfferingId(null)
            }}
          >
            Clear choices
          </button>
        )}
      </div>

      <div className="service-groups">
        {snapshot.service_groups.map((group, groupIndex) => {
          const services = snapshot.services.filter((service) => service.service_group_id === group.id)
          if (!services.length) return null
          return (
            <section key={group.id} className="service-group">
              <header>
                <span>{String(groupIndex + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{group.name}</h3>
                  {group.description && <p>{group.description}</p>}
                </div>
              </header>
              <div className="service-grid">
                {services.map((service) => {
                  const selected = selectedServiceIds.includes(service.id)
                  const compatible = serviceIsCompatible(service.id)
                  return (
                    <button
                      type="button"
                      key={service.id}
                      className="service-card"
                      data-selected={selected}
                      data-incompatible={!compatible}
                      disabled={!compatible}
                      onClick={() => toggleService(service.id)}
                      aria-pressed={selected}
                    >
                      <span className="service-card__check">{selected && <Check aria-hidden="true" />}</span>
                      <div>
                        <h4>{service.name}</h4>
                        <span className="service-card__time"><Clock3 aria-hidden="true" /> {minutesLabel(service.time_requirement_minutes)}</span>
                      </div>
                      {service.description && <p>{service.description}</p>}
                      {!compatible && <small>Not available with your current choices</small>}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <section className="matching-sessions" aria-live="polite">
        <header>
          <div>
            <p className="public-kicker">Sessions that fit</p>
            <h3>{matchingOfferings.length} {matchingOfferings.length === 1 ? 'way' : 'ways'} to experience your choices</h3>
          </div>
          <p>Each session is a complete bookable package. Select one to see the combined total.</p>
        </header>

        {matchingOfferings.length ? (
          <div className="offering-grid">
            {matchingOfferings.map((offering) => {
              const selected = offering.id === offeringId
              const serviceNames = offering.service_ids
                .map((id) => serviceById.get(id)?.name)
                .filter((name): name is string => Boolean(name))
              return (
                <button
                  type="button"
                  key={offering.id}
                  className="offering-card"
                  data-selected={selected}
                  onClick={() => setOfferingId(selected ? null : offering.id)}
                  aria-pressed={selected}
                >
                  {offering.image_urls[0] ? (
                    <span
                      className="offering-card__image"
                      role="img"
                      aria-label={offering.name}
                      style={{ backgroundImage: `url(${JSON.stringify(offering.image_urls[0]).slice(1, -1)})` }}
                    />
                  ) : (
                    <span className="offering-card__image offering-card__image--colour" aria-hidden="true" />
                  )}
                  <span className="offering-card__choice">{selected ? <Check aria-hidden="true" /> : 'Select'}</span>
                  <span className="offering-card__body">
                    <span className="offering-card__eyebrow">{peopleLabel(offering.people_count)}</span>
                    <strong>{offering.name}</strong>
                    {offering.description && <span className="offering-card__description">{offering.description}</span>}
                    <span className="offering-card__services">{serviceNames.join(' · ')}</span>
                    <span className="offering-card__meta">
                      <span><Clock3 aria-hidden="true" /> {offeringTiming(offering)}</span>
                      <b>{money(offering.price_amount)}</b>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="catalog-no-match">
            <Filter aria-hidden="true" />
            <div><h4>No session contains this combination yet.</h4><p>Remove one choice to see compatible sessions.</p></div>
          </div>
        )}
      </section>

      <div className="catalog-bookbar" data-ready={Boolean(selectedOffering)}>
        {selectedOffering ? (
          <>
            <div className="catalog-bookbar__name">
              <span>Your session</span>
              <strong>{selectedOffering.name}</strong>
            </div>
            <div className="catalog-bookbar__facts">
              <span><Clock3 aria-hidden="true" /> {offeringTiming(selectedOffering)}</span>
              <span><Users aria-hidden="true" /> {peopleLabel(selectedOffering.people_count)}</span>
              {selectedOffering.break_required && <span><Coffee aria-hidden="true" /> Break included</span>}
            </div>
            <div className="catalog-bookbar__price"><span>Total</span><strong>{money(selectedOffering.price_amount)}</strong></div>
            <Button type="button" onClick={onBook} className="catalog-bookbar__button">
              Book now <ArrowRight aria-hidden="true" />
            </Button>
          </>
        ) : (
          <p><Sparkles aria-hidden="true" /> Select a session above to see its complete time and price.</p>
        )}
      </div>
    </div>
  )
}

function AvailabilityStep({
  offering,
  timezone,
  chosenIso,
  setChosenIso,
}: {
  offering: PublicOffering
  timezone: string
  chosenIso: string | null
  setChosenIso: (iso: string | null) => void
}) {
  const today = dateKeyInTimeZone(new Date(), timezone)
  const initialTo = addDaysToDateKey(today, 30)
  const [draftFrom, setDraftFrom] = useState(today)
  const [draftTo, setDraftTo] = useState(initialTo)
  const [range, setRange] = useState({ from: today, to: initialTo })
  const [days, setDays] = useState<DayAvailability[] | null>(null)
  const [resultTimezone, setResultTimezone] = useState(timezone)
  const [maxDate, setMaxDate] = useState(addDaysToDateKey(today, 90))
  const [error, setError] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState<'any' | 'morning' | 'afternoon' | 'evening'>('any')
  const [dayFilter, setDayFilter] = useState<'any' | 'weekday' | 'weekend'>('any')

  useEffect(() => {
    let cancelled = false

    getAvailableSlots(offering.id, range.from, range.to).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDays(result.days)
      setResultTimezone(result.timezone)
      setMaxDate(result.max_advance_date)
    })

    return () => { cancelled = true }
  }, [offering.id, range.from, range.to, setChosenIso])

  function slotHour(iso: string) {
    const hour = new Intl.DateTimeFormat('en-CA', {
      timeZone: resultTimezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso)).find((part) => part.type === 'hour')?.value
    return Number(hour ?? 0)
  }

  const visibleDays = (days ?? [])
    .filter((day) => dayFilter === 'any'
      || (dayFilter === 'weekday' && day.weekday >= 1 && day.weekday <= 5)
      || (dayFilter === 'weekend' && (day.weekday === 0 || day.weekday === 6)))
    .map((day) => ({
      ...day,
      slot_isos: day.slot_isos.filter((iso) => {
        const hour = slotHour(iso)
        return timeFilter === 'any'
          || (timeFilter === 'morning' && hour < 12)
          || (timeFilter === 'afternoon' && hour >= 12 && hour < 17)
          || (timeFilter === 'evening' && hour >= 17)
      }),
    }))
    .filter((day) => day.slot_isos.length > 0)

  return (
    <div className="wizard-grid">
      <div className="wizard-main">
        <div className="wizard-heading">
          <p className="public-kicker">Step 2 · Schedule</p>
          <h2>Find a time that fits.</h2>
          <p>Every time shown is available and long enough for your complete session.</p>
        </div>

        <form
          className="availability-filters"
          onSubmit={(event) => {
            event.preventDefault()
            if (draftFrom <= draftTo) {
              setDays(null)
              setError(null)
              setChosenIso(null)
              setRange({ from: draftFrom, to: draftTo })
            }
          }}
        >
          <div>
            <Label htmlFor="date-from">From</Label>
            <Input id="date-from" type="date" min={today} max={maxDate} value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="date-to">To</Label>
            <Input id="date-to" type="date" min={draftFrom} max={maxDate} value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="day-filter">Days</Label>
            <select id="day-filter" value={dayFilter} onChange={(e) => setDayFilter(e.target.value as typeof dayFilter)}>
              <option value="any">Any day</option><option value="weekday">Weekdays</option><option value="weekend">Weekends</option>
            </select>
          </div>
          <div>
            <Label htmlFor="time-filter">Time</Label>
            <select id="time-filter" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as typeof timeFilter)}>
              <option value="any">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option>
            </select>
          </div>
          <Button type="submit" variant="outline"><Filter aria-hidden="true" /> Update</Button>
        </form>

        {error && <div className="availability-message availability-message--error">{error}</div>}
        {!days && !error && (
          <div className="availability-loading"><Skeleton className="h-14 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
        )}
        {days && !error && (
          visibleDays.length ? (
            <div className="availability-table-wrap">
              <table className="availability-table">
                <caption>{visibleDays.length} dates with times available</caption>
                <thead><tr><th>Date</th><th>Available start times</th></tr></thead>
                <tbody>
                  {visibleDays.map((day) => (
                    <tr key={day.date}>
                      <th scope="row">
                        <span>{new Intl.DateTimeFormat('en-CA', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day.date}T12:00:00Z`))}</span>
                        <strong>{new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day.date}T12:00:00Z`))}</strong>
                      </th>
                      <td>
                        <div className="availability-times">
                          {day.slot_isos.map((iso) => (
                            <button
                              type="button"
                              key={iso}
                              data-selected={chosenIso === iso}
                              onClick={() => setChosenIso(chosenIso === iso ? null : iso)}
                            >
                              {formatInTimeZone(iso, resultTimezone, { hour: 'numeric', minute: '2-digit' })}
                              {chosenIso === iso && <Check aria-hidden="true" />}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="availability-message">
              <CalendarDays aria-hidden="true" />
              <div><strong>No times match these filters.</strong><p>Try a wider date range or another time of day.</p></div>
            </div>
          )
        )}
      </div>
      <BookingSummary offering={offering} startsAt={chosenIso} timezone={resultTimezone} />
    </div>
  )
}

function DetailsStep({
  offering,
  clients,
  setClients,
  notes,
  setNotes,
}: {
  offering: PublicOffering
  clients: ClientForm[]
  setClients: React.Dispatch<React.SetStateAction<ClientForm[]>>
  notes: string
  setNotes: (notes: string) => void
}) {
  function setClient(index: number, key: keyof ClientForm, value: string) {
    setClients((current) => current.map((client, clientIndex) => clientIndex === index ? { ...client, [key]: value } : client))
  }

  return (
    <div className="wizard-grid">
      <div className="wizard-main">
        <div className="wizard-heading">
          <p className="public-kicker">Step 3 · Details</p>
          <h2>{clients.length > 1 ? 'Tell us who is coming.' : 'A little about you.'}</h2>
          <p>These details help us review and respond to your request.</p>
        </div>

        <div className="client-forms">
          {clients.map((client, index) => (
            <fieldset key={index} className="client-form">
              <legend>{clients.length === 1 ? 'Your details' : index === 0 ? 'Primary contact' : `Guest ${index + 1}`}</legend>
              <div className="client-form__row">
                <div><Label htmlFor={`first-${index}`}>First name *</Label><Input id={`first-${index}`} autoComplete={index === 0 ? 'given-name' : 'off'} value={client.first_name} onChange={(e) => setClient(index, 'first_name', e.target.value)} /></div>
                <div><Label htmlFor={`last-${index}`}>Last name *</Label><Input id={`last-${index}`} autoComplete={index === 0 ? 'family-name' : 'off'} value={client.last_name} onChange={(e) => setClient(index, 'last_name', e.target.value)} /></div>
              </div>
              <div className="client-form__row">
                <div><Label htmlFor={`email-${index}`}>Email {index === 0 && '*'}</Label><Input id={`email-${index}`} type="email" autoComplete={index === 0 ? 'email' : 'off'} value={client.email} onChange={(e) => setClient(index, 'email', e.target.value)} /></div>
                <div><Label htmlFor={`phone-${index}`}>Phone</Label><Input id={`phone-${index}`} type="tel" autoComplete={index === 0 ? 'tel' : 'off'} value={client.phone} onChange={(e) => setClient(index, 'phone', e.target.value)} /></div>
              </div>
            </fieldset>
          ))}
          <div className="booking-notes">
            <Label htmlFor="booking-notes">Appointment notes</Label>
            <Textarea id="booking-notes" rows={5} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Accessibility needs, allergies, questions, gift context, or anything else that would help us prepare." />
            <small>{notes.length} / 2000</small>
          </div>
        </div>
      </div>
      <BookingSummary offering={offering} />
    </div>
  )
}

function ReviewStep({
  offering,
  startsAt,
  timezone,
  clients,
  notes,
  onEdit,
}: {
  offering: PublicOffering
  startsAt: string
  timezone: string
  clients: ClientForm[]
  notes: string
  onEdit: (step: number) => void
}) {
  const endAt = new Date(new Date(startsAt).getTime() + offering.duration_minutes * 60_000).toISOString()
  return (
    <div className="review-layout">
      <div className="wizard-heading">
        <p className="public-kicker">Step 4 · Review</p>
        <h2>One last look.</h2>
        <p>Nothing is charged today. Your request will be reviewed and confirmed by email.</p>
      </div>
      <div className="review-card">
        <ReviewSection title="Your experience" onEdit={() => onEdit(0)}>
          <h3>{offering.name}</h3>
          <p>{offeringTiming(offering)} · {peopleLabel(offering.people_count)}</p>
          <strong>{money(offering.price_amount)} CAD</strong>
        </ReviewSection>
        <ReviewSection title="Date & time" onEdit={() => onEdit(1)}>
          <h3>{formatInTimeZone(startsAt, timezone, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
          <p>{formatInTimeZone(startsAt, timezone, { hour: 'numeric', minute: '2-digit' })}–{formatInTimeZone(endAt, timezone, { hour: 'numeric', minute: '2-digit' })}</p>
        </ReviewSection>
        <ReviewSection title={clients.length > 1 ? 'Guests' : 'Your details'} onEdit={() => onEdit(2)}>
          {clients.map((client, index) => (
            <div key={index} className="review-client">
              <h3>{client.first_name} {client.last_name}</h3>
              {client.email && <p><Mail aria-hidden="true" /> {client.email}</p>}
              {client.phone && <p>{client.phone}</p>}
            </div>
          ))}
          {notes && <blockquote>{notes}</blockquote>}
        </ReviewSection>
      </div>
      <div className="review-assurance"><CheckCircle2 aria-hidden="true" /><p><strong>This is a booking request.</strong> Your selected time is held as pending until it is confirmed.</p></div>
    </div>
  )
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="review-section">
      <header><span>{title}</span><button type="button" onClick={onEdit}>Edit</button></header>
      <div>{children}</div>
    </section>
  )
}

function BookingSummary({ offering, startsAt, timezone }: { offering: PublicOffering; startsAt?: string | null; timezone?: string }) {
  return (
    <aside className="booking-summary">
      <span className="booking-summary__label">Your selection</span>
      <h3>{offering.name}</h3>
      {offering.description && <p>{offering.description}</p>}
      <dl>
        <div><dt><Clock3 aria-hidden="true" /> Duration</dt><dd>{minutesLabel(offering.duration_minutes)}</dd></div>
        <div><dt><Users aria-hidden="true" /> Guests</dt><dd>{peopleLabel(offering.people_count)}</dd></div>
        {offering.break_required && <div><dt><Coffee aria-hidden="true" /> Pause</dt><dd>{offering.break_minutes} min included</dd></div>}
        {startsAt && timezone && <div><dt><CalendarDays aria-hidden="true" /> Selected</dt><dd>{formatInTimeZone(startsAt, timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</dd></div>}
      </dl>
      <div className="booking-summary__price"><span>Total</span><strong>{money(offering.price_amount)}</strong><small>CAD</small></div>
      <p className="booking-summary__note"><MapPin aria-hidden="true" /> Final location details arrive with your confirmation.</p>
    </aside>
  )
}
