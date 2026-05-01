'use client'

import { useState, useTransition } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { format, addMinutes, isAfter, isBefore, startOfDay } from 'date-fns'
import { getDayAvailability, type DayAvailability } from '@/lib/actions/get-day-availability'
import { createBooking } from '@/lib/actions/create-booking'
import {
  isSlotAvailable, hasPendingOverlap,
  type RecurringBlock,
} from '@/lib/availability'

type Offering = {
  id: string; name: string; description: string | null
  duration_minutes: number; price_amount: number
  break_required: boolean; pair_allowed: boolean; is_active: boolean
}
type ServiceGroup = { id: string; name: string; description: string | null }
type BookingSettings = {
  slot_increment_minutes: number; day_start_time: string; day_end_time: string
}

type ClientInfo = {
  first_name: string
  last_name: string
  date_of_birth: string
  email: string
  phone_number: string
}

const TABS = ['client', 'services', 'datetime', 'confirm'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  client: 'Your Info',
  services: 'Services',
  datetime: 'Date & Time',
  confirm: 'Confirm',
}

type SlotInfo = { time: Date; available: boolean; hasPending: boolean }

function generateTimeSlots(
  date: Date,
  durationMinutes: number,
  settings: BookingSettings | null,
  availability: DayAvailability | null,
  recurringBlocks: RecurringBlock[],
): SlotInfo[] {
  const increment = settings?.slot_increment_minutes ?? 15
  const [startH, startM] = (settings?.day_start_time ?? '09:00').split(':').map(Number)
  const [endH, endM] = (settings?.day_end_time ?? '19:00').split(':').map(Number)

  const dayStart = new Date(date)
  dayStart.setHours(startH, startM, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(endH, endM, 0, 0)

  const bookings = availability?.bookings ?? []
  const blockedPeriods = availability?.blockedPeriods ?? []
  const confirmedBookings = bookings.filter((b) => b.status === 'confirmed')

  const slots: SlotInfo[] = []
  let cursor = dayStart
  while (!isAfter(addMinutes(cursor, durationMinutes), dayEnd)) {
    const slotStart = new Date(cursor)
    const slotEnd = addMinutes(slotStart, durationMinutes)
    const available = isSlotAvailable(slotStart, slotEnd, confirmedBookings, blockedPeriods, recurringBlocks)
    const pending = available && hasPendingOverlap(slotStart, slotEnd, bookings)
    slots.push({ time: slotStart, available, hasPending: pending })
    cursor = addMinutes(cursor, increment)
  }
  return slots
}

export default function BookingFlow({
  offerings,
  serviceGroups,
  settings,
  recurringBlocks,
}: {
  offerings: Offering[]
  serviceGroups: ServiceGroup[]
  settings: BookingSettings | null
  recurringBlocks: RecurringBlock[]
}) {
  const [tab, setTab] = useState<Tab>('client')
  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    first_name: '', last_name: '', date_of_birth: '', email: '', phone_number: '',
  })
  const [selectedOffering, setSelectedOffering] = useState<Offering | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [selectedTime, setSelectedTime] = useState<Date | null>(null)
  const [dayAvailability, setDayAvailability] = useState<DayAvailability | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [loadingSlots, startLoadingSlots] = useTransition()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [isWaitlist, setIsWaitlist] = useState(false)
  const [showWaitlistDialog, setShowWaitlistDialog] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timeSlots =
    selectedDate && selectedOffering
      ? generateTimeSlots(selectedDate, selectedOffering.duration_minutes, settings, dayAvailability, recurringBlocks)
      : []

  const clientValid =
    clientInfo.first_name.trim() &&
    clientInfo.last_name.trim() &&
    clientInfo.email.trim() &&
    clientInfo.phone_number.trim()

  function handleDateSelect(d: Date | undefined) {
    setSelectedDate(d)
    setSelectedTime(null)
    setDayAvailability(null)
    setAvailabilityError(null)
    if (!d) return
    startLoadingSlots(async () => {
      const result = await getDayAvailability(format(d, 'yyyy-MM-dd'))
      if (typeof result === 'string') {
        setAvailabilityError('Could not load availability for this date. Please try again.')
      } else {
        setDayAvailability(result)
      }
    })
  }

  async function submitBooking(waitlist: boolean) {
    if (!selectedOffering || !selectedTime) return
    setSubmitting(true)
    setError(null)

    const result = await createBooking({
      offeringId: selectedOffering.id,
      startsAt: selectedTime.toISOString(),
      durationMinutes: selectedOffering.duration_minutes,
      priceAmount: Number(selectedOffering.price_amount),
      breakRequired: selectedOffering.break_required,
      isWaitlist: waitlist,
      client: {
        first_name: clientInfo.first_name,
        last_name: clientInfo.last_name,
        email: clientInfo.email,
        phone_number: clientInfo.phone_number,
        date_of_birth: clientInfo.date_of_birth || null,
      },
    })

    setSubmitting(false)

    if ('pendingConflict' in result) {
      setError(null)
      setShowWaitlistDialog(true)
      return
    }
    if (!result.ok) {
      setError(result.error)
      return
    }
    setIsWaitlist(waitlist)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-4">
        <h1 className="text-2xl font-bold">
          {isWaitlist ? 'You\'re on the waitlist!' : 'Booking Requested!'}
        </h1>
        <p className="text-muted-foreground">
          Thanks {clientInfo.first_name}!{' '}
          {isWaitlist
            ? 'There is already an unconfirmed booking for this time. We have added you to the waitlist and will be in touch if the spot becomes available.'
            : 'Your appointment request has been received. You will hear from us to confirm your booking.'}
        </p>
        {selectedOffering && selectedTime && (
          <div className="text-sm text-muted-foreground">
            <p>{selectedOffering.name}</p>
            <p>{format(selectedTime, 'EEEE d MMMM yyyy')} at {format(selectedTime, 'h:mm a')}</p>
          </div>
        )}
        <Button asChild variant="outline">
          <a href="/">Back to home</a>
        </Button>
      </div>
    )
  }

  return (
    <>
      {/* Waitlist confirmation dialog */}
      <AlertDialog open={showWaitlistDialog} onOpenChange={setShowWaitlistDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This time already has a pending booking</AlertDialogTitle>
            <AlertDialogDescription>
              Someone else has already requested this time slot, but their booking hasn't been
              confirmed yet. You can join the waitlist — if their booking is cancelled or not
              confirmed, yours will be next in line.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowWaitlistDialog(false)}>
              Choose a different time
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowWaitlistDialog(false)
                await submitBooking(true)
              }}
            >
              Join the waitlist
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Book an Appointment</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Fill in your details and choose a service and time.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => { setTab(v as Tab); setError(null) }}>
          <TabsList className="w-full grid grid-cols-4">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>{TAB_LABELS[t]}</TabsTrigger>
            ))}
          </TabsList>

          {/* ── Tab 1: Client Info ── */}
          <TabsContent value="client" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Your Information</CardTitle>
                <CardDescription>We need a few details to confirm your booking.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={clientInfo.first_name}
                    onChange={(e) => setClientInfo((p) => ({ ...p, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={clientInfo.last_name}
                    onChange={(e) => setClientInfo((p) => ({ ...p, last_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={clientInfo.email}
                    onChange={(e) => setClientInfo((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={clientInfo.phone_number}
                    onChange={(e) => setClientInfo((p) => ({ ...p, phone_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={clientInfo.date_of_birth}
                    onChange={(e) => setClientInfo((p) => ({ ...p, date_of_birth: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>
            <div className="flex justify-end">
              <Button onClick={() => setTab('services')} disabled={!clientValid}>
                Next: Services
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab 2: Services ── */}
          <TabsContent value="services" className="mt-4 space-y-4">
            {serviceGroups.length === 0 && offerings.length === 0 && (
              <p className="text-muted-foreground text-sm">No services available yet. Check back soon.</p>
            )}
            {offerings.length > 0 && (
              <div className="space-y-3">
                {offerings.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={cn(
                      'w-full text-left rounded-lg border p-4 transition-colors',
                      selectedOffering?.id === o.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                    onClick={() => { setSelectedOffering(o); setSelectedTime(null) }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{o.name}</p>
                        {o.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{o.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">${Number(o.price_amount).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{o.duration_minutes} min</p>
                      </div>
                    </div>
                    {(o.break_required || o.pair_allowed) && (
                      <div className="flex gap-2 mt-2">
                        {o.break_required && <Badge variant="secondary">Break included</Badge>}
                        {o.pair_allowed && <Badge variant="secondary">Pairs welcome</Badge>}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setTab('client')}>Back</Button>
              <Button onClick={() => setTab('datetime')} disabled={!selectedOffering}>
                Next: Date & Time
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab 3: Date & Time ── */}
          <TabsContent value="datetime" className="mt-4 space-y-4">
            <Card>
              <CardContent className="pt-4 flex flex-col md:flex-row gap-6">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  disabled={(d) => isBefore(startOfDay(d), startOfDay(new Date()))}
                  className="rounded-md border"
                />
                {selectedDate && (
                  <div className="flex-1 space-y-3">
                    <p className="text-sm font-medium">
                      {loadingSlots
                        ? 'Loading available times…'
                        : `Available times for ${format(selectedDate, 'EEEE d MMM')}`}
                    </p>

                    {availabilityError && (
                      <p className="text-sm text-destructive">{availabilityError}</p>
                    )}

                    {!loadingSlots && !availabilityError && timeSlots.length === 0 && (
                      <p className="text-sm text-muted-foreground">No available times on this day.</p>
                    )}

                    {!loadingSlots && !availabilityError && timeSlots.length > 0 && (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {timeSlots.map((slot) => {
                            const isSelected =
                              selectedTime?.toISOString() === slot.time.toISOString()
                            return (
                              <button
                                key={slot.time.toISOString()}
                                type="button"
                                disabled={!slot.available}
                                onClick={() => setSelectedTime(slot.time)}
                                className={cn(
                                  'rounded border px-2 py-1.5 text-sm text-center transition-colors',
                                  !slot.available
                                    ? 'border-border bg-muted/80 text-muted-foreground line-through cursor-not-allowed select-none'
                                    : isSelected
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : slot.hasPending
                                        ? 'border-amber-400/60 bg-amber-50 hover:border-amber-500 dark:bg-amber-950/20'
                                        : 'border-border hover:border-primary/50',
                                )}
                                title={
                                  !slot.available
                                    ? 'This time is already booked'
                                    : slot.hasPending
                                      ? 'Has an unconfirmed booking — you can join the waitlist'
                                      : undefined
                                }
                              >
                                {format(slot.time, 'h:mm a')}
                              </button>
                            )
                          })}
                        </div>

                        {/* Legend */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {timeSlots.some((s) => !s.available) && (
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded border border-border bg-muted/80" />
                              Already booked
                            </span>
                          )}
                          {timeSlots.some((s) => s.hasPending) && (
                            <span className="flex items-center gap-1">
                              <span className="inline-block w-3 h-3 rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/20" />
                              Unconfirmed — waitlist available
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {/* End time display */}
                    {selectedTime && selectedOffering && (
                      <p className="text-sm text-muted-foreground">
                        Selected:{' '}
                        <span className="font-medium text-foreground">
                          {format(selectedTime, 'h:mm a')}
                          {' – '}
                          {format(addMinutes(selectedTime, selectedOffering.duration_minutes), 'h:mm a')}
                        </span>
                        {' · '}
                        {selectedOffering.duration_minutes} min
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setTab('services')}>Back</Button>
              <Button
                onClick={() => setTab('confirm')}
                disabled={!selectedDate || !selectedTime}
              >
                Next: Confirm
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab 4: Confirm ── */}
          <TabsContent value="confirm" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Confirm Your Booking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <span className="text-muted-foreground">Name</span>
                  <span>{clientInfo.first_name} {clientInfo.last_name}</span>
                  <span className="text-muted-foreground">Email</span>
                  <span>{clientInfo.email}</span>
                  <span className="text-muted-foreground">Phone</span>
                  <span>{clientInfo.phone_number}</span>
                  {selectedOffering && (
                    <>
                      <span className="text-muted-foreground">Service</span>
                      <span>{selectedOffering.name}</span>
                      <span className="text-muted-foreground">Duration</span>
                      <span>{selectedOffering.duration_minutes} minutes</span>
                      <span className="text-muted-foreground">Price</span>
                      <span>${Number(selectedOffering.price_amount).toFixed(2)}</span>
                    </>
                  )}
                  {selectedDate && selectedTime && selectedOffering && (
                    <>
                      <span className="text-muted-foreground">Date</span>
                      <span>{format(selectedDate, 'EEEE, d MMMM yyyy')}</span>
                      <span className="text-muted-foreground">Time</span>
                      <span>
                        {format(selectedTime, 'h:mm a')}
                        {' – '}
                        {format(addMinutes(selectedTime, selectedOffering.duration_minutes), 'h:mm a')}
                      </span>
                    </>
                  )}
                </div>
                {error && <p className="text-destructive text-sm">{error}</p>}
              </CardContent>
            </Card>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setTab('datetime')}>Back</Button>
              <Button onClick={() => submitBooking(false)} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Request Booking'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
