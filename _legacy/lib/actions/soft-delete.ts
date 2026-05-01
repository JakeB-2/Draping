'use server'

import { createClient } from '@/lib/supabase/server'

export async function softDelete(table: string, id: string): Promise<string | undefined> {
  const supabase = await createClient()
  const { error } = await supabase.from(table as never).delete().eq('id', id)
  if (error) return error.message
}
