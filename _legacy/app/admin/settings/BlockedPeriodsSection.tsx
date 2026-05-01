'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { CalendarIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { createBlockedPeriod, deleteBlockedPeriod } from '@/lib/actions/blocked-periods'

type BlockedPeriod = { id: string; start_at: string; end_at: string; reason: string | null }

type FormState = {
  startDate: Date | undefined
  startTime: string
  endDate: Date | undefined
  endTime: string
  reason: string
  allDay: boolean
}

const DEFAULT_FORM: FormState = {
  startDate: undefined,
  startTime: '09:00',
  endDate: undefined,
  endTime: '17:00',
  reason: '',
  allDay: false,
}

function combineDateTime(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(date)
  d.setHours(h, m, 0, 0)
  return d
}

export default function BlockedPeriodsSection({
  initialPeriods,
}: {
  initialPeriods: BlockedPeriod[]
}) {
  const [periods, setPeriods] = useState(initialPeriods)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!form.startDate || !form.endDate) {
      setError('Start and end dates are required.')
      return
    }
    const startTime = form.allDay ? '00:00' : form.startTime
    const endTime = form.allDay ? '23:59' : form.endTime
    const start = combineDateTime(form.startDate, startTime)
    const end = combineDateTime(form.endDate, endTime)
    if (start >= end) {
      setError('End must be after start.')
      return
    }
    setError(null)

    startTransition(async () => {
      const err = await createBlockedPeriod({
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        reason: form.reason || null,
      })
      if (err) { setError(err); return }

      setPeriods((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          start_at: start.toISOString(),
          end_at: end.toISOString(),
          reason: form.reason || null,
        },
      ])
      setForm(DEFAULT_FORM)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const err = await deleteBlockedPeriod(id)
      if (!err) setPeriods((prev) => prev.filter((p) => p.id !== id))
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocked Periods & Time Off</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing periods */}
        {periods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blocked periods set.</p>
        ) : (
          <div className="space-y-2">
            {periods.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">
                    {format(new Date(p.start_at), 'd MMM yyyy, h:mm a')}
                    {' → '}
                    {format(new Date(p.end_at), 'd MMM yyyy, h:mm a')}
                  </span>
                  {p.reason && (
                    <span className="ml-2 text-muted-foreground">· {p.reason}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(p.id)}
                  disabled={isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* All day toggle */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="all-day"
            checked={form.allDay}
            onCheckedChange={(v) => setForm((p) => ({ ...p, allDay: v === true }))}
          />
          <Label htmlFor="all-day" className="text-sm cursor-pointer font-normal">
            All day
          </Label>
        </div>

        {/* Start / End columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Start */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Start</p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                    {form.startDate
                      ? format(form.startDate, 'PPP')
                      : <span className="text-muted-foreground">Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.startDate}
                    onSelect={(d) => setForm((p) => ({ ...p, startDate: d }))}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {!form.allDay && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
                />
              </div>
            )}
          </div>

          {/* End */}
          <div className="space-y-3">
            <p className="text-sm font-medium">End</p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                    {form.endDate
                      ? format(form.endDate, 'PPP')
                      : <span className="text-muted-foreground">Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.endDate}
                    onSelect={(d) => setForm((p) => ({ ...p, endDate: d }))}
                  />
                </PopoverContent>
              </Popover>
            </div>
            {!form.allDay && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-1">
          <Label className="text-sm">
            Reason{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            placeholder="e.g. Holiday, Annual leave"
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={handleAdd} disabled={isPending} size="sm">
            {isPending ? 'Saving…' : 'Add Blocked Period'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
