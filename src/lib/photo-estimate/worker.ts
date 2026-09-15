import type { SupabaseClient } from '@supabase/supabase-js';
import { getPhotoEstimate } from './repository';

/**
 * Recovers runs that are stuck in 'processing' state past their lease expiry.
 */
export async function recoverExpiredRuns(
  supabase: SupabaseClient
) {
  const { data: expiredRuns, error } = await supabase
    .from('photo_estimate_runs')
    .select('id, attempt_count')
    .eq('status', 'processing')
    .lt('lease_expires_at', new Date().toISOString());

  if (error) {
    console.error('Failed to list expired runs:', error);
    return;
  }

  for (const run of expiredRuns) {
    // If we've tried too many times, mark as failed
    if (run.attempt_count >= 3) {
      await supabase
        .from('photo_estimate_runs')
        .update({
          status: 'failed',
          error_category: 'timeout_exceeded',
          updated_at: new Date().toISOString()
        })
        .eq('id', run.id);
    } else {
      // Revert to pending for another attempt
      await supabase
        .from('photo_estimate_runs')
        .update({
          status: 'pending',
          lease_token: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', run.id);
    }
  }
}

/**
 * Claims a pending run and returns it. Returns null if none available.
 */
export async function claimPendingRun(
  supabase: SupabaseClient,
  leaseDurationMs: number = 45000
) {
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

  // Find a pending run
  const { data: pendingRuns, error: findError } = await supabase
    .from('photo_estimate_runs')
    .select('id, attempt_count')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (findError || !pendingRuns || pendingRuns.length === 0) return null;

  const run = pendingRuns[0];

  // Try to claim it
  const { data: claimed, error: claimError } = await supabase
    .from('photo_estimate_runs')
    .update({
      status: 'processing',
      lease_token: leaseToken,
      lease_expires_at: leaseExpiresAt,
      attempt_count: run.attempt_count + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', run.id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (claimError || !claimed) return null; // Someone else got it

  return claimed;
}
