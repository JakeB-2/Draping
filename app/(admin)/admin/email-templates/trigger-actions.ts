'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type EmailTrigger = {
  id: string
  action: string
  label: string
  template_id: string | null
  is_active: boolean
}

export async function updateEmailTrigger(
  id: string,
  patch: { template_id?: string | null; is_active?: boolean },
): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('booking_action_triggers')
    .update(patch)
    .eq('id', id)
  if (error) return error.message
  revalidatePath('/admin/email-templates')
}
