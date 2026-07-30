import type { SupabaseClient } from '@supabase/supabase-js';

// Durable, cross-instance rate limiting backed by the `rate_limits` table +
// `check_rate_limit` SQL function (see schema.sql). Replaces the per-lambda
// in-memory Maps that reset on every cold start. Call with the service-role
// (admin) client on public routes.

// Best-client-IP from proxy headers. Vercel sets x-forwarded-for; take the first
// hop. Falls back to a constant so a missing header degrades to a shared bucket
// (still limits total volume) rather than no limit at all.
export function clientIpFrom(headers: { get(name: string): string | null }): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

// Returns true if the action is ALLOWED (still within the window's limit).
// Fails OPEN on a limiter error: a broken limiter must not lock out real
// customers on revenue paths. The caller decides how to fail for toll-fraud
// surfaces (see checkRateLimitStrict).
export async function checkRateLimit(
  admin: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('check_rate_limit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) return true; // fail open
    return data === true;
  } catch {
    return true;
  }
}

// Fail-CLOSED variant for money/toll-fraud surfaces (e.g. sending SMS to an
// attacker-supplied number): a limiter error blocks rather than allows.
export async function checkRateLimitStrict(
  admin: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('check_rate_limit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) return false; // fail closed
    return data === true;
  } catch {
    return false;
  }
}
