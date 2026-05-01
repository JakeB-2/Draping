import { createClient } from '@supabase/supabase-js'

/**
 * Anonymous, cookieless Supabase client for public-data reads.
 * Use this in `'use cache'` scopes (where `cookies()` would throw)
 * and for any read that should never depend on the visitor's session.
 */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
