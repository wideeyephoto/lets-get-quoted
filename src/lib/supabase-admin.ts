import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';

/**
 * Common no-store fetch wrapper for all Supabase admin database operations.
 * A database read is never a cacheable fetch.
 */
export const noStoreFetch: typeof fetch = (input, init) => (
  fetch(input, {
    ...init,
    cache: 'no-store',
    signal: init?.signal ?? AbortSignal.timeout(15000),
  })
);

/**
 * Creates an administrative Supabase client using the service role key.
 * Independent of request headers/cookies; safe for both server execution and background workers.
 */
export function createAdminClient() {
  return createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: noStoreFetch },
    }
  );
}
