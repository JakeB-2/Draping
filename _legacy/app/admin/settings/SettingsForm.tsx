'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type BookingSettings = {
  id: string
  slot_increment_minutes: number
  day_start_time: string
  day_end_time: string
  break_threshold_minutes: number
  break_duration_minutes: number
  pair_extra_minutes: number
  max_bookings_per_week: number | null
  max_consecutive_booking_days: number | null
}

export type WeeklyScheduleRow = {
  id: string
  weekday_number: number
  is_open: boolean
  start_time: string | null
  end_time: string | null
}

export default function SettingsForm({
  settings,
  schedule,
  weekdayLabels,
}: {
  settings: BookingSettings | null
  schedule: WeeklyScheduleRow[]
  weekdayLabels: string[]
}) {
  const [form, setForm] = useState({
    slot_increment_minutes: String(settings?.slot_increment_minutes ?? 15),
    day_start_time: settings?.day_start_time ?? '09:00',
    day_end_time: settings?.day_end_time ?? '19:00',
    break_threshold_minutes: String(settings?.break_threshold_minutes ?? 90),
    break_duration_minutes: String(settings?.break_duration_minutes ?? 15),
    pair_extra_minutes: String(settings?.pair_extra_minutes ?? 0),
    max_bookings_per_week: String(settings?.max_bookings_per_week ?? ''),
    max_consecutive_booking_days: String(settings?.max_consecutive_booking_days ?? ''),
  })
  const [scheduleState, setScheduleState] = useState(schedule)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function updateScheduleRow(weekday: number, field: 'is_open' | 'start_time' | 'end_time', value: string | boolean) {
    setScheduleState((prev) =>
      prev.map((row) => row.weekday_number === weekday ? { ...row, [field]: value } : row)
    )
  }

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    const supabase = createClient()

    const payload = {
      slot_increment_minutes: Number(form.slot_increment_minutes),
      day_start_time: form.day_start_time,
      day_end_time: form.day_end_time,
      break_threshold_minutes: Number(form.break_threshold_minutes),
      break_duration_minutes: Number(form.break_duration_minutes),
      pair_extra_minutes: Number(form.pair_extra_minutes),
      max_bookings_per_week: form.max_bookings_per_week !== '' ? Number(form.max_bookings_per_week) : null,
      max_consecutive_booking_days: form.max_consecutive_booking_days !== '' ? Number(form.max_consecutive_booking_days) : null,
    }

    if (settings?.id) {
      await supabase.from('booking_settings').update(payload).eq('id', settings.id)
    } else {
      await supabase.from('booking_settings').insert(payload)
    }

    await Promise.all(
      scheduleState.map((row) =>
        supabase.from('weekly_schedule').update({
          is_open: row.is_open,
          start_time: row.start_time,
          end_time: row.end_time,
        }).eq('id', row.id)
      )
    )

    setMessage('Settings saved.')
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Booking Rules</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {([
            { label: 'Slot Increment (min)', key: 'slot_increment_minutes' },
            { label: 'Pair Extra Time (min)', key: 'pair_extra_minutes' },
            { label: 'Break Threshold (min)', key: 'break_threshold_minutes' },
            { label: 'Break Duration (min)', key: 'break_duration_minutes' },
            { label: 'Max Bookings / Week', key: 'max_bookings_per_week' },
            { label: 'Max Consecutive Days', key: 'max_consecutive_booking_days' },
          ] as const).map(({ label, key }) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Input
                type="number"
                min={0}
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label>Day Start Time</Label>
            <Input
              type="time"
              value={form.day_start_time}
              onChange={(e) => setForm((p) => ({ ...p, day_start_time: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Day End Time</Label>
            <Input
              type="time"
              value={form.day_end_time}
              onChange={(e) => setForm((p) => ({ ...p, day_end_time: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {scheduleState.map((row) => (
            <div key={row.weekday_number} className="flex items-center gap-4">
              <div className="w-28 text-sm font-medium">{weekdayLabels[row.weekday_number]}</div>
              <Switch
                checked={row.is_open}
                onCheckedChange={(v) => updateScheduleRow(row.weekday_number, 'is_open', v)}
              />
              {row.is_open && (
                <>
                  <Input
                    type="time"
                    className="w-32"
                    value={row.start_time ?? '09:00'}
                    onChange={(e) => updateScheduleRow(row.weekday_number, 'start_time', e.target.value)}
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="time"
                    className="w-32"
                    value={row.end_time ?? '19:00'}
                    onChange={(e) => updateScheduleRow(row.weekday_number, 'end_time', e.target.value)}
                  />
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {message && <p className="text-sm text-green-600">{message}</p>}
      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  )
}
