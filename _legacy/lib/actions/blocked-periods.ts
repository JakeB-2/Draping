'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type BlockedPeriodInput = {
  start_at: string
  end_at: string
  reason?: string | null
}

export async function createBlockedPeriod(data: BlockedPeriodInput): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('blocked_periods').insert({
    start_at: data.start_at,
    end_at: data.end_at,
    reason: data.reason?.trim() || null,
  })
  if (error) return error.message
  revalidatePath('/admin/settings')
}

export async function deleteBlockedPeriod(id: string): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from('blocked_periods').delete().eq('id', id)
  if (error) return error.message
  revalidatePath('/admin/settings')
}
