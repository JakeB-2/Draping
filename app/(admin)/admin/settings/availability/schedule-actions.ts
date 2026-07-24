'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '../../auth'

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const dayInputSchema = z.object({
  weekday_number: z.coerce.number().int().min(0).max(6),
  is_open: z.coerce.boolean(),
  start_time: z.string().regex(timeRegex).nullable(),
  end_time: z.string().regex(timeRegex).nullable(),
}).superRefine((day, ctx) => {
  if (day.is_open) {
    if (!day.start_time || !day.end_time) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Open days need start and end times' })
      return
    }
    if (day.start_time >= day.end_time) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be after start time' })
    }
  }
})

export type ScheduleActionState = { ok: boolean; error: string | null }

export async function saveSchedule(_prev: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const days = []
  for (let n = 0; n <= 6; n++) {
    const isOpen = formData.get(`day-${n}-open`) === 'on'
    const start = (formData.get(`day-${n}-start`) as string | null) || null
    const end = (formData.get(`day-${n}-end`) as string | null) || null
    const parsed = dayInputSchema.safeParse({
      weekday_number: n,
      is_open: isOpen,
      start_time: isOpen ? start : null,
      end_time: isOpen ? end : null,
    })
    if (!parsed.success) {
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][n]
      return { ok: false, error: `${dayName}: ${parsed.error.issues[0]?.message ?? 'invalid'}` }
    }
    days.push(parsed.data)
  }

  const { supabase } = await requireAdmin()
  const { error } = await supabase
    .from('weekly_schedule')
    .upsert(days, { onConflict: 'weekday_number' })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/settings/availability')
  revalidatePath('/admin/offerings')
  return { ok: true, error: null }
}
