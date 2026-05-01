import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client using the service role key.
 *
 * Use this for:
 *   - Public-facing server actions that read sensitive tables (bookings,
 *     clients) — keeps them off the anon key per the plan's dev-mode RLS
 *     guardrail.
 *   - Admin operations that must bypass RLS (snapshot publishing, etc.)
 *
 * NEVER import from a client component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
