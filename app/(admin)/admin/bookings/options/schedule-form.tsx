'use client'

import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { saveSchedule, type ScheduleActionState } from './schedule-actions'

export type Day = {
  weekday_number: number
  is_open: boolean
  start_time: string | null
  end_time: string | null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const initial: ScheduleActionState = { ok: false, error: null }

function asHM(t: string | null) {
  if (!t) return ''
  return t.length >= 5 ? t.slice(0, 5) : t
}

export function ScheduleForm({ days }: { days: Day[] }) {
  const [state, formAction, pending] = useActionState(saveSchedule, initial)

  useEffect(() => {
    if (state.ok) toast.success('Schedule saved')
  }, [state])

  const byNumber = new Map(days.map((d) => [d.weekday_number, d]))
  const rows: Day[] = Array.from({ length: 7 }, (_, n) => byNumber.get(n) ?? {
    weekday_number: n,
    is_open: n >= 1 && n <= 5,
    start_time: '09:00',
    end_time: '17:00',
  })

  return (
    <form action={formAction} className="space-y-4">
      <ul className="border rounded-md divide-y">
        {rows.map((d) => (
          <DayRow key={d.weekday_number} day={d} />
        ))}
      </ul>
      {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} size="sm">
          {pending ? 'Saving…' : 'Save schedule'}
        </Button>
      </div>
    </form>
  )
}

function DayRow({ day }: { day: Day }) {
  const [open, setOpen] = useState(day.is_open)
  const n = day.weekday_number

  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 px-4 py-3">
      <div className="flex items-center justify-between sm:w-40">
        <span className="font-medium">{WEEKDAYS[n]}</span>
        <div className="flex items-center gap-2 sm:hidden">
          <span className="text-sm text-muted-foreground">{open ? 'Open' : 'Closed'}</span>
          <Switch
            name={`day-${n}-open`}
            checked={open}
            onCheckedChange={setOpen}
          />
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-2">
        <Switch
          name={`day-${n}-open`}
          checked={open}
          onCheckedChange={setOpen}
        />
        <span className="text-sm text-muted-foreground w-16">{open ? 'Open' : 'Closed'}</span>
      </div>
      <div className="flex items-center gap-2 flex-1">
        <Input
          name={`day-${n}-start`}
          type="time"
          defaultValue={asHM(day.start_time)}
          disabled={!open}
          className="max-w-[140px]"
          aria-label={`${WEEKDAYS[n]} start time`}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          name={`day-${n}-end`}
          type="time"
          defaultValue={asHM(day.end_time)}
          disabled={!open}
          className="max-w-[140px]"
          aria-label={`${WEEKDAYS[n]} end time`}
        />
      </div>
    </li>
  )
}
