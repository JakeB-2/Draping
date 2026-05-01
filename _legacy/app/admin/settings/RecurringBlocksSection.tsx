'use client'

import { useState, useTransition } from 'react'
import { format } from 'date-fns'
import { CalendarIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { createRecurringBlock, deleteRecurringBlock } from '@/lib/actions/recurring-blocks'
import type { RecurringBlock } from '@/lib/availability'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type FormState = {
  label: string
  weekdays: number[]
  startTime: string
  endTime: string
  validFrom: Date | undefined
  validUntil: Date | undefined
}

const DEFAULT_FORM: FormState = {
  label: '',
  weekdays: [],
  startTime: '12:00',
  endTime: '13:00',
  validFrom: undefined,
  validUntil: undefined,
}

function formatWeekdays(days: number[]): string {
  if (days.length === 7) return 'Every day'
  const sorted = [...days].sort((a, b) => a - b)
  // Check for contiguous range
  if (sorted.length >= 3) {
    let contiguous = true
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) { contiguous = false; break }
    }
    if (contiguous) {
      return `${WEEKDAY_FULL[sorted[0]]}–${WEEKDAY_FULL[sorted[sorted.length - 1]]}`
    }
  }
  return sorted.map((d) => WEEKDAYS[d]).join(', ')
}

export default function RecurringBlocksSection({
  initialBlocks,
}: {
  initialBlocks: RecurringBlock[]
}) {
  const [blocks, setBlocks] = useState(initialBlocks)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleWeekday(day: number) {
    setForm((p) => ({
      ...p,
      weekdays: p.weekdays.includes(day)
        ? p.weekdays.filter((d) => d !== day)
        : [...p.weekdays, day],
    }))
  }

  function handleAdd() {
    if (form.weekdays.length === 0) {
      setError('Select at least one weekday.')
      return
    }
    if (!form.startTime || !form.endTime) {
      setError('Start and end times are required.')
      return
    }
    if (form.startTime >= form.endTime) {
      setError('End time must be after start time.')
      return
    }
    if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
      setError('Valid until must be after valid from.')
      return
    }
    setError(null)

    const input = {
      label: form.label || undefined,
      weekdays: form.weekdays,
      start_time: form.startTime,
      end_time: form.endTime,
      valid_from: form.validFrom ? format(form.validFrom, 'yyyy-MM-dd') : undefined,
      valid_until: form.validUntil ? format(form.validUntil, 'yyyy-MM-dd') : undefined,
    }

    startTransition(async () => {
      const err = await createRecurringBlock(input)
      if (err) { setError(err); return }

      setBlocks((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          weekdays: form.weekdays,
          start_time: form.startTime,
          end_time: form.endTime,
          valid_from: input.valid_from ?? null,
          valid_until: input.valid_until ?? null,
        },
      ])
      setForm(DEFAULT_FORM)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const err = await deleteRecurringBlock(id)
      if (!err) setBlocks((prev) => prev.filter((b) => b.id !== id))
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recurring Blocked Times</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recurring blocks set.</p>
        ) : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <div className="space-y-0.5">
                  <span className="font-medium">
                    {formatWeekdays(b.weekdays)} · {b.start_time}–{b.end_time}
                  </span>
                  {(b.valid_from || b.valid_until) && (
                    <p className="text-xs text-muted-foreground">
                      {b.valid_from && `From ${b.valid_from}`}
                      {b.valid_from && b.valid_until && ' · '}
                      {b.valid_until && `Until ${b.valid_until}`}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(b.id)}
                  disabled={isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Weekday selector */}
        <div className="space-y-1.5">
          <Label className="text-sm">Days of week</Label>
          <div className="flex gap-1 flex-wrap">
            {WEEKDAYS.map((label, day) => (
              <Toggle
                key={day}
                size="sm"
                pressed={form.weekdays.includes(day)}
                onPressedChange={() => toggleWeekday(day)}
                className="w-9"
              >
                {label}
              </Toggle>
            ))}
          </div>
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-sm">Start time</Label>
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">End time</Label>
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
            />
          </div>
        </div>

        {/* Optional date range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-sm">
              Valid from{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                  {form.validFrom
                    ? format(form.validFrom, 'PPP')
                    : <span className="text-muted-foreground">No start boundary</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.validFrom}
                  onSelect={(d) => setForm((p) => ({ ...p, validFrom: d }))}
                />
                {form.validFrom && (
                  <div className="border-t p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setForm((p) => ({ ...p, validFrom: undefined }))}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label className="text-sm">
              Valid until{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 size-4 text-muted-foreground" />
                  {form.validUntil
                    ? format(form.validUntil, 'PPP')
                    : <span className="text-muted-foreground">No end boundary</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.validUntil}
                  onSelect={(d) => setForm((p) => ({ ...p, validUntil: d }))}
                />
                {form.validUntil && (
                  <div className="border-t p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setForm((p) => ({ ...p, validUntil: undefined }))}
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Label */}
        <div className="space-y-1">
          <Label className="text-sm">
            Label{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            placeholder="e.g. Lunch break"
            value={form.label}
            onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={handleAdd} disabled={isPending} size="sm">
            {isPending ? 'Saving…' : 'Add Recurring Block'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
