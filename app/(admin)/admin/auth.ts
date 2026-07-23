import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Authenticate every admin mutation at its actual entry point.
 * The admin layout is a convenience boundary, not an authorization boundary.
 */
export async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) throw new Error('Unauthorized')
  return { supabase, user }
}

