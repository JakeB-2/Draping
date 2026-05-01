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

export async function getEmailTriggers(): Promise<EmailTrigger[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('booking_action_triggers')
    .select('id, action, label, template_id, is_active')
    .order('created_at')
  return (data ?? []) as EmailTrigger[]
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
  revalidatePath('/admin/email-triggers')
}
