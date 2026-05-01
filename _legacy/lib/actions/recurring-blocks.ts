'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type RecurringBlockInput = {
  label?: string
  weekdays: number[]
  start_time: string
  end_time: string
  valid_from?: string
  valid_until?: string
}

export async function createRecurringBlock(
  data: RecurringBlockInput,
): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('recurring_blocks').insert({
    label: data.label || null,
    weekdays: data.weekdays,
    start_time: data.start_time,
    end_time: data.end_time,
    valid_from: data.valid_from || null,
    valid_until: data.valid_until || null,
  })
  if (error) return error.message
  revalidatePath('/admin/settings')
}

export async function deleteRecurringBlock(id: string): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('recurring_blocks').delete().eq('id', id)
  if (error) return error.message
  revalidatePath('/admin/settings')
}
