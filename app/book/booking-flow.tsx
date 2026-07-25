'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  LoaderCircle,
  MapPin,
  RefreshCcw,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import { Textarea } from '@/components/ui/textarea'
import type { Quote } from '@/lib/booking-engine'
import { addDaysToDateKey, dateKeyInTimeZone, formatInTimeZone } from '@/lib/time-zone'
import {
  createInitialFlowState,
  lockedServiceIdsFor,
  selectOffering,
  setParticipantCount,
  setServiceAttendance,
} from './flow-state'
import {
  getPublicQuote,
  getPublicStarts,
  submitPublicBooking,
} from './actions'
import type {
  PublicBookingCatalog,
  PublicBookingOffering,
  PublicFlowState,
  PublicQuoteResult,
  PublicStartsResult,
} from './types'
import styles from './booking-flow.module.css'

type LoadingState = {
  quote: boolean
  starts: boolean
}

const EMPTY_LOADING: LoadingState = {
  quote: false,
  starts: false,
}

function formatMoney(amount: string) {
  const negative = amount.startsWith('-')
  const unsigned = negative ? amount.slice(1) : amount
  const [wholeRaw, fractionRaw = ''] = unsigned.split('.')
  const whole = (wholeRaw || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = `${fractionRaw}00`.slice(0, 2)
  return `${negative ? '−' : ''}$${whole}.${fraction}`
}

function isZeroMoney(amount: string) {
  return /^-?0+(?:\.0+)?$/.test(amount)
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder} min`
  return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

function fullDateLabel(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function timeLabel(iso: string, timezone: string) {
  return formatInTimeZone(iso, timezone, { hour: 'numeric', minute: '2-digit' })
}

function timeRangeLabel(startIso: string, durationMinutes: number, timezone: string) {
  const endIso = new Date(Date.parse(startIso) + durationMinutes * 60_000).toISOString()
  return `${timeLabel(startIso, timezone)} – ${timeLabel(endIso, timezone)}`
}

// A5: after a committed choice, bring the next actionable step into view once it mounts.
function scrollToSection(id: string) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

// The calendar is the primary date picker, so load the whole bookable
// horizon up front (the engine clips to the configured advance window).
function initialDateRange(timezone: string) {
  const today = dateKeyInTimeZone(new Date(), timezone)
  return { from: today, to: addDaysToDateKey(today, 90) }
}

export function BookingFlow({ catalog }: { catalog: PublicBookingCatalog }) {
  const router = useRouter()
  const initialRange = useMemo(() => initialDateRange(catalog.timezone), [catalog.timezone])
  const [state, setState] = useState<PublicFlowState>(() =>
    createInitialFlowState(initialRange.from, initialRange.to),
  )
  const [quoteResult, setQuoteResult] = useState<PublicQuoteResult | null>(null)
  const [startsResult, setStartsResult] = useState<PublicStartsResult | null>(null)
  const [loading, setLoading] = useState(EMPTY_LOADING)
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const [recoveryAlternatives, setRecoveryAlternatives] = useState<string[]>([])
  const [submitting, startSubmitting] = useTransition()

  const offering = useMemo(
    () => catalog.offerings.find((item) => item.id === state.offering_id) ?? null,
    [catalog.offerings, state.offering_id],
  )
  const matrix = useMemo(() => state.offering_id ? {
    offering_id: state.offering_id,
    participant_count: state.participant_count,
    attendance: state.attendance,
  } : null, [state.offering_id, state.participant_count, state.attendance])

  useEffect(() => {
    if (!matrix) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading((current) => ({ ...current, quote: true }))
      setQuoteResult(null)
      return getPublicQuote(matrix)
    }).then((result) => {
      if (!result || cancelled) return
      setQuoteResult(result)
      setLoading((current) => ({ ...current, quote: false }))
    })
    return () => { cancelled = true }
  }, [matrix])

  useEffect(() => {
    if (!matrix || !quoteResult?.ok) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading((current) => ({ ...current, starts: true }))
      setStartsResult(null)
      return getPublicStarts(matrix, state.date_range.from, state.date_range.to)
    }).then((result) => {
      if (!result || cancelled) return
      setStartsResult(result)
      setLoading((current) => ({ ...current, starts: false }))
      if (result.ok) {
        const currentStarts = new Set(result.data.days.flatMap((day) => day.start_isos))
        setState((current) => current.selected_start_iso && !currentStarts.has(current.selected_start_iso)
          ? { ...current, selected_start_iso: null }
          : current)
      }
    })
    return () => { cancelled = true }
  }, [
    matrix,
    quoteResult?.ok,
    state.date_range.from,
    state.date_range.to,
    availabilityRevision,
  ])

  function patchState(patch: Partial<PublicFlowState>) {
    setState((current) => ({ ...current, ...patch }))
  }

  function chooseOffering(nextOffering: PublicBookingOffering | null) {
    setState((current) => selectOffering(current, nextOffering))
    setQuoteResult(null)
    setStartsResult(null)
    setRecoveryAlternatives([])
    if (nextOffering) scrollToSection('step-matrix')
  }

  function chooseStart(iso: string) {
    const clearing = state.selected_start_iso === iso
    patchState({ selected_start_iso: clearing ? null : iso })
    setRecoveryAlternatives([])
    if (!clearing) scrollToSection('step-confirm')
  }

  function detailsComplete() {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return Boolean(
      state.primary.first_name.trim()
      && state.primary.last_name.trim()
      && emailPattern.test(state.primary.email.trim())
      && (state.participant_count === 1 || state.additional_display_name.trim()),
    )
  }

  function handleSubmit() {
    if (!matrix || !quoteResult?.ok || !state.selected_start_iso || !detailsComplete()) return
    startSubmitting(async () => {
      const result = await submitPublicBooking({
        matrix,
        starts_at: state.selected_start_iso!,
        expected_quote: {
          duration_minutes: quoteResult.data.duration_minutes,
          subtotal_amount: quoteResult.data.subtotal_amount,
          tax_amount: quoteResult.data.tax_amount,
          total_amount: quoteResult.data.total_amount,
        },
        primary: state.primary,
        additional_display_name: state.participant_count > 1
          ? state.additional_display_name.trim()
          : null,
        notes: state.notes.trim() || null,
        date_range: state.date_range,
        selected_window: null,
      })

      if (!result.ok) {
        toast.error(result.error)
        if (result.quote) {
          setQuoteResult({ ok: true, data: result.quote })
          patchState({ selected_start_iso: null })
        }
        if (result.alternatives) {
          setRecoveryAlternatives(result.alternatives)
          patchState({ selected_start_iso: null })
        }
        setAvailabilityRevision((current) => current + 1)
        return
      }

      if (result.email_warning) toast.warning(result.email_warning)
      else toast.success('Your booking request has been sent.')
      router.push(`/book/confirmation/${result.booking_id}`)
    })
  }

  return (
    <div className={styles.flow} id="booking-builder">
      {!offering ? (
        <EntryChoice offerings={catalog.offerings} onPickOffering={(picked) => chooseOffering(picked)} />
      ) : (
        <>
          <div className={styles.toolbar}>
            <span><CheckCircle2 aria-hidden="true" /> Tailor the details below — the exact price and times update live.</span>
            <button
              type="button"
              className={styles.resetButton}
              onClick={() => {
                setState(createInitialFlowState(initialRange.from, initialRange.to))
                setQuoteResult(null)
                setStartsResult(null)
                setRecoveryAlternatives([])
              }}
            >
              <RefreshCcw aria-hidden="true" /> Start over
            </button>
          </div>

          <div className={styles.builderGrid}>
            <div className={styles.builderMain}>
              <OfferingStep
                offerings={catalog.offerings}
                selected={offering}
                onChoose={chooseOffering}
              />

              <MatrixStep
                offering={offering}
                state={state}
                participantCap={catalog.participant_cap}
                onState={setState}
              />

              <QuoteStatus result={quoteResult} loading={loading.quote} currencyCode={catalog.currency_code} />

              {quoteResult?.ok && (
                <StartStep
                  state={state}
                  timezone={startsResult?.ok ? startsResult.data.timezone : catalog.timezone}
                  result={startsResult}
                  loading={loading.starts}
                  recoveryAlternatives={recoveryAlternatives}
                  onRange={(date_range) => patchState({ date_range, selected_start_iso: null })}
                  onStart={chooseStart}
                />
              )}

              {quoteResult?.ok && state.selected_start_iso && (
                <ConfirmationStep
                  state={state}
                  detailsComplete={detailsComplete()}
                  submitting={submitting}
                  onState={setState}
                  onSubmit={handleSubmit}
                />
              )}
            </div>

            <QuoteCard
              offering={offering}
              quote={quoteResult?.ok ? quoteResult.data : null}
              loading={loading.quote}
              selectedStartIso={state.selected_start_iso}
              timezone={startsResult?.ok ? startsResult.data.timezone : catalog.timezone}
              notice={catalog.quote_notice_text}
              currencyCode={catalog.currency_code}
            />
          </div>
        </>
      )}
    </div>
  )
}

function EntryChoice({
  offerings,
  onPickOffering,
}: {
  offerings: PublicBookingOffering[]
  onPickOffering: (offering: PublicBookingOffering) => void
}) {
  return (
    <section className={styles.entryChoice} aria-labelledby="booking-entry-heading">
      <div className={styles.sectionHeading}>
        <p>The catalog</p>
        <h3 id="booking-entry-heading">Pick an experience to start booking.</h3>
        <span>Every price and duration below comes from the live server — the exact total appears as you tailor attendance.</span>
      </div>
      <div className={styles.offeringGrid}>
        {offerings.map((offering) => (
          <button
            type="button"
            key={offering.id}
            className={styles.offeringCard}
            onClick={() => onPickOffering(offering)}
          >
            <span
              className={styles.offeringImage}
              style={offering.image_url ? { backgroundImage: `url(${offering.image_url})` } : undefined}
              aria-hidden="true"
            />
            <span className={styles.offeringBody}>
              <small>{offering.services.length} {offering.services.length === 1 ? 'service' : 'services'}</small>
              <strong>{offering.name}</strong>
              {offering.description && <p>{offering.description}</p>}
              <span>{offering.services.map((service) => service.name).join(' · ')}</span>
              {offering.from_price && (
                <em className={styles.entryPricing}>
                  From {formatMoney(offering.from_price)}
                  {offering.solo_duration_minutes ? ` · ${durationLabel(offering.solo_duration_minutes)}` : ''}
                </em>
              )}
            </span>
            <span className={styles.cardCheck}>Book now <ArrowRight aria-hidden="true" /></span>
          </button>
        ))}
      </div>
    </section>
  )
}

function StepHeader({ number, eyebrow, title, children }: {
  number: string
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <header className={styles.stepHeader}>
      <span>{number}</span>
      <div>
        <p>{eyebrow}</p>
        <h3>{title}</h3>
        <div>{children}</div>
      </div>
    </header>
  )
}

function DateRangeFields({
  range,
  maxDate,
  onRange,
}: {
  range: PublicFlowState['date_range']
  maxDate?: string
  onRange: (range: PublicFlowState['date_range']) => void
}) {
  const [draft, setDraft] = useState(range)
  return (
    <form
      className={styles.rangeForm}
      onSubmit={(event) => {
        event.preventDefault()
        if (draft.from <= draft.to) onRange(draft)
      }}
    >
      <div>
        <Label htmlFor="booking-from">From</Label>
        <Input
          id="booking-from"
          type="date"
          value={draft.from}
          max={maxDate}
          onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
        />
      </div>
      <div>
        <Label htmlFor="booking-to">To</Label>
        <Input
          id="booking-to"
          type="date"
          value={draft.to}
          min={draft.from}
          max={maxDate}
          onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
        />
      </div>
      <Button type="submit" variant="outline">Update dates</Button>
    </form>
  )
}

function dateKeyOfLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function OfferingStep({
  offerings,
  selected,
  onChoose,
}: {
  offerings: PublicBookingOffering[]
  selected: PublicBookingOffering
  onChoose: (offering: PublicBookingOffering | null) => void
}) {
  const [changing, setChanging] = useState(false)
  const compact = !changing
  return (
    <section className={styles.stepCard} id="step-offering">
      <StepHeader number="01" eyebrow="Experience" title="Your experience.">
        Durations and totals below always come from the live appointment book.
      </StepHeader>
      {compact ? (
        <div className={styles.selectedWindow}>
          <div>
            <strong>{selected.name}</strong>
            <small>{selected.services.map((service) => service.name).join(' · ')}</small>
          </div>
          {offerings.length > 1 && (
            <Button type="button" variant="outline" onClick={() => setChanging(true)}>
              Change experience
            </Button>
          )}
        </div>
      ) : (
        <div className={styles.offeringGrid}>
          {offerings.map((offering) => {
            const active = selected.id === offering.id
            return (
              <button
                type="button"
                key={offering.id}
                className={styles.offeringCard}
                data-selected={active}
                onClick={() => { setChanging(false); if (!active) onChoose(offering) }}
              >
                <span
                  className={styles.offeringImage}
                  style={offering.image_url ? { backgroundImage: `url(${offering.image_url})` } : undefined}
                  aria-hidden="true"
                />
                <span className={styles.offeringBody}>
                  <small>{offering.services.length} {offering.services.length === 1 ? 'service' : 'services'}</small>
                  <strong>{offering.name}</strong>
                  {offering.description && <p>{offering.description}</p>}
                  <span>{offering.services.map((service) => service.name).join(' · ')}</span>
                  {offering.from_price && (
                    <em className={styles.entryPricing}>
                      From {formatMoney(offering.from_price)}
                      {offering.solo_duration_minutes ? ` · ${durationLabel(offering.solo_duration_minutes)}` : ''}
                    </em>
                  )}
                </span>
                <span className={styles.cardCheck}>{active ? <Check aria-hidden="true" /> : 'Choose'}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

function MatrixStep({
  offering,
  state,
  participantCap,
  onState,
}: {
  offering: PublicBookingOffering
  state: PublicFlowState
  participantCap: number
  onState: React.Dispatch<React.SetStateAction<PublicFlowState>>
}) {
  const attendeeName = state.additional_display_name.trim() || 'Guest'
  const lockedIds = lockedServiceIdsFor(offering)
  return (
    <section className={styles.stepCard} id="step-matrix">
      <StepHeader number="02" eyebrow="Attendance" title="Who joins each part?">
        Each service needs at least one attendee. A package seat can be used by either person; a shared service may add a second-seat charge.
      </StepHeader>

      <div className={styles.attendeePanel}>
        <div className={styles.personBadge}>
          <span>1</span><div><strong>You</strong><small>Primary contact</small></div>
        </div>
        {state.participant_count === 1 && participantCap > 1 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onState((current) => setParticipantCount(current, 2, participantCap, lockedIds))}
          >
            <UserPlus aria-hidden="true" /> Add another attendee
          </Button>
        ) : state.participant_count > 1 ? (
          <div className={styles.additionalPerson}>
            <div className={styles.personBadge}>
              <span>2</span><div><strong>Additional attendee</strong><small>Name only—no contact record needed</small></div>
            </div>
            <div>
              <Label htmlFor="additional-name">Display name<RequiredMark /></Label>
              <Input
                id="additional-name"
                value={state.additional_display_name}
                maxLength={120}
                placeholder="Their name"
                onChange={(event) => onState((current) => ({
                  ...current,
                  additional_display_name: event.target.value,
                }))}
              />
            </div>
            <button
              type="button"
              className={styles.removePerson}
              onClick={() => onState((current) => setParticipantCount(current, 1, participantCap, lockedIds))}
            >
              <X aria-hidden="true" /> Remove
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.matrix}>
        <div className={styles.matrixHeader}>
          <span>Service</span><span>Who attends?</span>
        </div>
        {offering.services.map((service) => {
          const locked = service.requires_all_attendees
          const selected = state.attendance[service.id] ?? [0]
          const choices = state.participant_count === 1
            ? [{ indexes: [0], label: 'You' }]
            : [
                { indexes: [0], label: 'You' },
                { indexes: [1], label: attendeeName },
                { indexes: [0, 1], label: 'Both' },
              ]
          return (
            <div key={service.id} className={styles.matrixRow}>
              <div>
                <strong>{service.name}</strong>
                {service.description && <small>{service.description}</small>}
                {locked && state.participant_count > 1 && (
                  <small className={styles.matrixLockNote}>Everyone attending joins this service.</small>
                )}
              </div>
              <div role="radiogroup" aria-label={`Attendance for ${service.name}`}>
                {choices.map((choice) => {
                  const isBoth = choice.indexes.length === 2
                  const isEveryone = choice.indexes.length === state.participant_count
                  const unavailable = (isBoth && !service.supported_participant_counts.includes(2))
                    || (locked && !isEveryone)
                  const active = selected.length === choice.indexes.length
                    && selected.every((index, position) => index === choice.indexes[position])
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={unavailable}
                      title={locked && !isEveryone
                        ? 'This service requires all attendees.'
                        : unavailable ? 'This service does not have shared timing configured.' : undefined}
                      key={choice.indexes.join('-')}
                      data-selected={active}
                      onClick={() => onState((current) =>
                        setServiceAttendance(current, service.id, choice.indexes))}
                    >
                      {choice.label}{active && <Check aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function QuoteStatus({ result, loading, currencyCode }: { result: PublicQuoteResult | null; loading: boolean; currencyCode: string }) {
  if (loading) return <LoadingMessage label="Recalculating exact duration and price on the server…" />
  if (result && !result.ok) return <InlineError message={result.error} />
  if (!result?.ok) return null
  return (
    <div className={styles.quoteReady} aria-live="polite">
      <CheckCircle2 aria-hidden="true" />
      <div>
        <strong>Your exact configuration is ready.</strong>
        <span>{durationLabel(result.data.duration_minutes)} · {formatMoney(result.data.total_amount)} {currencyCode} total</span>
      </div>
    </div>
  )
}

function StartStep({
  state,
  timezone,
  result,
  loading,
  recoveryAlternatives,
  onRange,
  onStart,
}: {
  state: PublicFlowState
  timezone: string
  result: PublicStartsResult | null
  loading: boolean
  recoveryAlternatives: string[]
  onRange: (range: PublicFlowState['date_range']) => void
  onStart: (iso: string) => void
}) {
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [calendarDay, setCalendarDay] = useState<string | null>(null)
  const [showAllDays, setShowAllDays] = useState(false)
  const allDays = result?.ok ? result.data.days : []
  const visibleDays = showAllDays ? allDays : allDays.slice(0, 8)
  const nearby = recoveryAlternatives

  const openDayKeys = useMemo(() => new Set(allDays.map((day) => day.date)), [allDays])
  const calendarStarts = calendarDay
    ? allDays.find((day) => day.date === calendarDay)?.start_isos ?? []
    : []

  return (
    <section className={styles.stepCard} id="step-start">
      <StepHeader number="03" eyebrow="Date & time" title="When should it begin?">
        Every time below comes from a fresh server check for this exact attendance and duration.
      </StepHeader>

      <div className={styles.viewToggle} role="group" aria-label="Date display mode">
        <button type="button" data-active={view === 'calendar'} onClick={() => setView('calendar')}>
          <CalendarDays aria-hidden="true" /> Calendar
        </button>
        <button type="button" data-active={view === 'list'} onClick={() => setView('list')}>List</button>
      </div>

      {loading && <LoadingMessage label="Finding exact starts for this configuration…" />}
      {result && !result.ok && <InlineError message={result.error} />}

      {view === 'calendar' && result?.ok && !loading && allDays.length > 0 && (
        <div className={styles.calendarView}>
          <Calendar
            mode="single"
            selected={calendarDay ? new Date(`${calendarDay}T12:00:00`) : undefined}
            onSelect={(date) => setCalendarDay(date ? dateKeyOfLocalDate(date) : null)}
            disabled={(date) => !openDayKeys.has(dateKeyOfLocalDate(date))}
            startMonth={new Date(`${state.date_range.from}T12:00:00`)}
            endMonth={new Date(`${state.date_range.to}T12:00:00`)}
            captionLayout="label"
          />
          {calendarDay && calendarStarts.length > 0 ? (
            <div className={styles.windowDay}>
              <div>
                <strong>{dateLabel(calendarDay)}</strong>
                <small>{calendarStarts.length} available {calendarStarts.length === 1 ? 'start' : 'starts'}</small>
              </div>
              <div className={styles.timeButtons}>
                {calendarStarts.map((iso) => (
                  <StartButton key={iso} iso={iso} timezone={timezone} selected={state.selected_start_iso === iso} onStart={onStart} />
                ))}
              </div>
            </div>
          ) : (
            <p className={styles.calendarHint}>Pick a highlighted day to see its start times.</p>
          )}
        </div>
      )}

      {view === 'list' && (
        <>
          <DateRangeFields range={state.date_range} onRange={onRange} />
          {result?.ok && allDays.length > 0 && (
            <div className={styles.startDays}>
              {visibleDays.map((day) => (
                <div key={day.date}>
                  <strong>{dateLabel(day.date)}</strong>
                  <div className={styles.timeButtons}>
                    {day.start_isos.map((iso) => (
                      <StartButton key={iso} iso={iso} timezone={timezone} selected={state.selected_start_iso === iso} onStart={onStart} />
                    ))}
                  </div>
                </div>
              ))}
              {!showAllDays && allDays.length > visibleDays.length && (
                <Button type="button" variant="outline" onClick={() => setShowAllDays(true)}>
                  Show all {allDays.length} days
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {result?.ok && nearby.length > 0 && (
        <div className={styles.nearbyStarts}>
          <h4>That time changed—nearby options</h4>
          <div className={styles.nearbyGrid}>
            {nearby.map((iso) => (
              <button type="button" key={iso} data-selected={state.selected_start_iso === iso} onClick={() => onStart(iso)}>
                <strong>{fullDateLabel(iso, timezone)}</strong>
                <span>{timeLabel(iso, timezone)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result?.ok && allDays.length === 0 && (
        <EmptyMessage title="No exact starts in this range." body="Try a wider date range or a different attendance configuration." />
      )}
    </section>
  )
}

function StartButton({
  iso,
  timezone,
  selected,
  onStart,
}: {
  iso: string
  timezone: string
  selected: boolean
  onStart: (iso: string) => void
}) {
  return (
    <button type="button" data-selected={selected} onClick={() => onStart(iso)}>
      {timeLabel(iso, timezone)}{selected && <Check aria-hidden="true" />}
    </button>
  )
}

function ConfirmationStep({
  state,
  detailsComplete,
  submitting,
  onState,
  onSubmit,
}: {
  state: PublicFlowState
  detailsComplete: boolean
  submitting: boolean
  onState: React.Dispatch<React.SetStateAction<PublicFlowState>>
  onSubmit: () => void
}) {
  function setPrimary(key: keyof PublicFlowState['primary'], value: string) {
    onState((current) => ({ ...current, primary: { ...current.primary, [key]: value } }))
  }
  return (
    <section className={styles.stepCard} id="step-confirm">
      <StepHeader number="04" eyebrow="Details & confirmation" title="One last look.">
        Nothing is charged today. The atomic submission is the moment this time is claimed.
      </StepHeader>

      <div className={styles.detailsGrid}>
        <div>
          <Label htmlFor="first-name">First name<RequiredMark /></Label>
          <Input id="first-name" autoComplete="given-name" maxLength={60} value={state.primary.first_name} onChange={(event) => setPrimary('first_name', event.target.value)} />
        </div>
        <div>
          <Label htmlFor="last-name">Last name<RequiredMark /></Label>
          <Input id="last-name" autoComplete="family-name" maxLength={60} value={state.primary.last_name} onChange={(event) => setPrimary('last_name', event.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email<RequiredMark /></Label>
          <Input id="email" type="email" autoComplete="email" value={state.primary.email} onChange={(event) => setPrimary('email', event.target.value)} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" type="tel" autoComplete="tel" maxLength={40} value={state.primary.phone} onChange={(event) => setPrimary('phone', event.target.value)} />
        </div>
      </div>
      <div className={styles.notesField}>
        <Label htmlFor="booking-notes">Appointment notes (optional)</Label>
        <Textarea
          id="booking-notes"
          rows={4}
          maxLength={2000}
          value={state.notes}
          onChange={(event) => onState((current) => ({ ...current, notes: event.target.value }))}
          placeholder="Accessibility needs, allergies, gift context, or anything else that would help us prepare."
        />
        <small>{state.notes.length} / 2000</small>
      </div>

      <div className={styles.submitRow}>
        <div><CheckCircle2 aria-hidden="true" /><p><strong>This is a booking request.</strong> You will receive a separate confirmation after review.</p></div>
        <Button type="button" size="lg" disabled={!detailsComplete || submitting} onClick={onSubmit}>
          {submitting ? <><LoaderCircle className={styles.spin} aria-hidden="true" /> Submitting…</> : <>Submit booking request <ArrowRight aria-hidden="true" /></>}
        </Button>
      </div>
    </section>
  )
}

function QuoteCard({
  offering,
  quote,
  loading,
  selectedStartIso,
  timezone,
  notice,
  currencyCode,
}: {
  offering: PublicBookingOffering | null
  quote: Quote | null
  loading: boolean
  selectedStartIso: string | null
  timezone: string
  notice: string | null
  currencyCode: string
}) {
  return (
    <aside className={styles.quoteCard} aria-live="polite">
      <div className={styles.quoteCardTop}>
        <span>Live server quote</span>
        {loading && <LoaderCircle className={styles.spin} aria-label="Updating quote" />}
      </div>
      {!offering ? (
        <div className={styles.quotePlaceholder}>
          <Sparkles aria-hidden="true" />
          <strong>Your exact total appears here.</strong>
          <p>Choose an experience and attendance. The browser never calculates the price.</p>
        </div>
      ) : !quote ? (
        <div className={styles.quotePlaceholder}>
          <Clock3 aria-hidden="true" />
          <strong>{offering.name}</strong>
          <p>{loading ? 'Asking the server for exact timing and price…' : 'Complete a valid attendance selection.'}</p>
        </div>
      ) : (
        <>
          <div className={styles.quoteTitle}>
            <small>{offering.name}</small>
            <strong>{formatMoney(quote.total_amount)} <em>{currencyCode}</em></strong>
            <span><Clock3 aria-hidden="true" /> {durationLabel(quote.duration_minutes)}</span>
            {selectedStartIso && <span><CalendarDays aria-hidden="true" /> {fullDateLabel(selectedStartIso, timezone)}, {timeRangeLabel(selectedStartIso, quote.duration_minutes, timezone)}</span>}
          </div>
          <div className={styles.quoteLines}>
            <div><span>Package</span><strong>{formatMoney(quote.base_package_amount)}</strong></div>
            {quote.segments
              .filter((segment) => segment.kind === 'service' && !isZeroMoney(segment.addon_amount))
              .map((segment) => (
                <div key={`${segment.sort_order}-${segment.service_id}`}>
                  <span>{segment.service_name_snapshot} · additional seat</span>
                  <strong>{formatMoney(segment.addon_amount)}</strong>
                </div>
              ))}
            {quote.adjustments.map((adjustment, index) => (
              <div key={`${adjustment.kind}-${index}`}>
                <span>{adjustment.label}{adjustment.percent_snapshot !== null ? ` (${adjustment.percent_snapshot}%)` : ''}</span>
                <strong>{formatMoney(adjustment.amount)}</strong>
              </div>
            ))}
            <div className={styles.subtotalLine}><span>Subtotal</span><strong>{formatMoney(quote.subtotal_amount)}</strong></div>
            {!isZeroMoney(quote.tax_amount) && (
              <div><span>Tax ({quote.tax_rate_percent}%)</span><strong>{formatMoney(quote.tax_amount)}</strong></div>
            )}
            <div className={styles.totalLine}><span>Total</span><strong>{formatMoney(quote.total_amount)} {currencyCode}</strong></div>
          </div>
          {notice && (
            <p className={styles.quoteNotice} role="note">
              <Info aria-hidden="true" /> {notice}
            </p>
          )}
          <p className={styles.noPayment}><MapPin aria-hidden="true" /> No payment is collected online.</p>
        </>
      )}
    </aside>
  )
}

function LoadingMessage({ label }: { label: string }) {
  return <div className={styles.loadingMessage}><LoaderCircle className={styles.spin} aria-hidden="true" /> {label}</div>
}

function InlineError({ message }: { message: string }) {
  return <div className={styles.inlineError} role="alert"><Info aria-hidden="true" /><span>{message}</span></div>
}

function EmptyMessage({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className={styles.emptyMessage}>
      <CalendarDays aria-hidden="true" />
      <div><strong>{title}</strong><p>{body}</p>{action}</div>
    </div>
  )
}
