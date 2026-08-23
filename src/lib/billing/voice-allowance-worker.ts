import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';

/**
 * Put each workspace's voice minutes in its ledger, once per billing period.
 *
 * SEPARATE FROM THE CANONICAL RESET, and that is the whole design. The paid-plan
 * monthly reset grants exactly four resources and hard-codes success as
 * `verified_lot_count = 4` — in a CHECK, in its selector, and in a runtime
 * raise. Adding voice to it would put every paid workspace's text, email, intake
 * and writing credits at risk to add a fifth. So this runs on its own, calls its
 * own RPC, and cannot fail that one.
 *
 * IDEMPOTENCY IS IN THE DATABASE, not here. `grant_voice_minute_allowance` keys
 * on workspace and period start, so calling it for a workspace that already has
 * this period's minutes is a no-op returning 0. That is what lets this sweep
 * every eligible workspace on every run rather than maintaining a queue: there
 * is no state to get wrong, and a run that overlaps its predecessor grants
 * nothing twice.
 *
 * WHAT COUNTS AS ELIGIBLE. A live entitlement with a current period. Whether
 * there is anything to grant — a base-plan inclusion, an active add-on, or
 * neither — is decided inside the RPC against rows it locks. Deciding it out
 * here would mean reading the same facts unlocked and acting on them later.
 */

export const VOICE_ALLOWANCE_WORKER_FLAG = 'LGQ_VOICE_ALLOWANCE_WORKER_ENABLED';

/** Bounded so one run cannot hold the database for an unbounded time. */
export const VOICE_ALLOWANCE_BATCH_SIZE = 200;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function voiceAllowanceWorkerEnabled(env: ServerEnvironment = process.env): boolean {
  return env[VOICE_ALLOWANCE_WORKER_FLAG] === '1';
}

export type VoiceAllowanceSummary = Readonly<{
  considered: number;
  granted: number;
  minutes: number;
  /** Already had this period's minutes, or had none to grant. Not a problem. */
  skipped: number;
  failed: number;
  batchSize: number;
  truncated: boolean;
}>;

type EntitlementRow = {
  account_id: string;
  period_start: string | null;
  period_end: string | null;
};

/**
 * Workspaces whose current period could carry voice minutes.
 *
 * Deliberately does NOT filter on having any — a workspace that bought the
 * add-on an hour ago should be picked up by the next run without this selector
 * needing to know about `workspace_purchased_capacity` too.
 */
export async function selectVoiceAllowanceCandidates(
  admin: SupabaseClient,
  now: Date,
  limit: number,
): Promise<EntitlementRow[]> {
  const iso = now.toISOString();
  const { data, error } = await admin
    .from('workspace_entitlements')
    .select('account_id, period_start, period_end')
    .neq('entitlement_state', 'archived')
    .lte('period_start', iso)
    .gt('period_end', iso)
    .order('account_id', { ascending: true })
    .limit(limit);

  if (error || !Array.isArray(data)) {
    if (error) console.error('voice allowance candidate read failed:', error);
    return [];
  }
  return data as EntitlementRow[];
}

export async function runVoiceAllowanceBatch(
  options: Readonly<{ batchSize?: number; now?: () => Date }> = {},
): Promise<VoiceAllowanceSummary> {
  const batchSize = options.batchSize ?? VOICE_ALLOWANCE_BATCH_SIZE;
  const now = (options.now ?? (() => new Date()))();
  const admin = createAdminClient();

  const candidates = await selectVoiceAllowanceCandidates(admin, now, batchSize);

  let granted = 0;
  let minutes = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    if (!row.period_start || !row.period_end) {
      // A live entitlement with no period is not something to guess a month
      // for. Counted as failed so it shows up rather than looking handled.
      failed += 1;
      continue;
    }
    try {
      const { data, error } = await admin.rpc('grant_voice_minute_allowance', {
        p_account_id: row.account_id,
        p_period_start: row.period_start,
        p_period_end: row.period_end,
      });
      if (error) {
        console.error('voice allowance grant failed:', row.account_id, error);
        failed += 1;
        continue;
      }
      const units = Number(data ?? 0);
      if (Number.isFinite(units) && units > 0) {
        granted += 1;
        minutes += units;
      } else {
        // Zero means already granted this period, or nothing to grant. Both are
        // the ordinary case and neither is worth alerting on.
        skipped += 1;
      }
    } catch (error) {
      console.error('voice allowance grant threw:', row.account_id, error);
      failed += 1;
    }
  }

  return Object.freeze({
    considered: candidates.length,
    granted,
    minutes,
    skipped,
    failed,
    batchSize,
    // A full batch means there may be more waiting. Said out loud, because a
    // silent cap reads as "everything was covered" when it was not.
    truncated: candidates.length >= batchSize,
  });
}
