import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './auth';
import { executeDocumentEmailClaim } from './document-email-sends';
import { executeLifecycleEmailClaim } from './contractor-lifecycle-sends';
import type { EmailAttemptResult, EmailProvider } from './email-recovery-execution';

type Work = { source: 'document' | 'lifecycle'; send_id: string; account_id: string; work: 'resume' | 'review' | 'reconcile' };
type Options = { dryRun?: boolean; fetcher?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void> };

export function retryAfterSeconds(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) ? Math.min(82800, Math.max(300, seconds)) : undefined;
}

/** Exact stored HTTP body; no template, token, attachment or source-event regeneration. */
export function recoveryProvider(key: string, fetcher: typeof fetch, now: () => number,
  sleep: (ms: number) => Promise<void>, beforeRequest: () => Promise<void> = async () => {}): EmailProvider {
  let lastRequestAt: number | undefined;
  return { key, fetchRequest: async (_path, options) => {
    if (lastRequestAt !== undefined) await sleep(Math.max(0, 1000 - (now() - lastRequestAt)));
    await beforeRequest();
    lastRequestAt = now();
    const response = await fetcher('https://api.resend.com/emails', { ...options, redirect: 'error', signal: AbortSignal.timeout(30_000) });
    const retrySeconds = retryAfterSeconds(response.headers.get('retry-after'), now());
    let body: { id?: string; name?: string; message?: string };
    try { body = await response.json(); } catch { body = {}; }
    const result: EmailAttemptResult = response.ok && typeof body.id === 'string' && body.id.length > 0 && !body.name
      ? { data: { id: body.id }, error: null }
      : { data: null, error: { name: response.status === 429
        ? (['daily_quota_exceeded','monthly_quota_exceeded'].includes(body.name ?? '') ? body.name : 'http_429')
        : response.status >= 500 ? `http_${response.status}` : body.name || `http_${response.status}`,
        message: body.message || 'Provider did not confirm acceptance' }, retrySeconds };
    return result as never;
  } };
}

export async function runEmailRecovery(admin?: SupabaseClient, options: Options = {}) {
  const summary = { dryRun: options.dryRun === true, disabled: false, selected: 0, accepted: 0, reconciled: 0,
    review: 0, deferred: 0, failed: 0, bounded: true };
  if (!options.dryRun && process.env.EMAIL_RECOVERY_ENABLED !== 'true') return { ...summary, disabled: true };
  const db = admin ?? createAdminClient();
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const started = now();
  // Read-only preview intentionally precedes the run lease, provider and cron writes.
  if (options.dryRun) {
    const { data, error } = await db.rpc('due_email_recovery_work', { p_limit: 20 });
    if (error || !Array.isArray(data)) throw new Error('Email recovery preview unavailable');
    const work = data as Work[];
    return { ...summary, selected: work.length, due: work.filter(r => r.work === 'resume').length,
      review: work.filter(r => r.work === 'review').length, reconcile: work.filter(r => r.work === 'reconcile').length };
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Email recovery provider is not configured');
  const { data: runToken, error: leaseError } = await db.rpc('begin_email_recovery_run');
  if (leaseError) throw new Error('Email recovery run claim unavailable');
  if (!runToken) return { ...summary, deferred: 1 };
  let active: { source: string; id: string; token: string } | undefined;
  const provider = recoveryProvider(key, options.fetcher ?? fetch, now, sleep, async () => {
    if (!active || now() - started >= 85_000) throw new Error('Email recovery submission deadline reached');
    const { data, error } = await db.rpc('validate_email_recovery_submission', {
      p_source: active.source, p_id: active.id, p_token: active.token, p_run_token: runToken,
    });
    if (error || data !== true) throw new Error('Email recovery submission no longer eligible');
  });
  try {
    const { data, error } = await db.rpc('due_email_recovery_work', { p_limit: 20 });
    if (error || !Array.isArray(data)) throw new Error('Email recovery work unavailable');
    const work = data as Work[];
    summary.selected = work.length;
    for (const [index, item] of work.entries()) {
      // Leave time for two bounded provider requests (primary and definitive fallback).
      if (now() - started >= 50_000) { summary.deferred += work.length - index; break; }
      if (!['document', 'lifecycle'].includes(item.source) || !['resume', 'review', 'reconcile'].includes(item.work)) {
        throw new Error('Invalid recovery work record');
      }
      const { data: allowed, error: pauseError } = await db.rpc('email_recovery_can_submit', {
        p_run_token: runToken, p_account_id: item.account_id,
      });
      if (pauseError) throw new Error('Email recovery pause check unavailable');
      if (allowed !== true) { summary.deferred += work.length - index; break; }
      if (item.work === 'reconcile') {
        const { data: repaired, error: repairError } = await db.rpc('reconcile_email_recovery_acceptance', { p_id: item.send_id, p_run_token: runToken });
        if (repairError) throw new Error('Email acceptance reconciliation unavailable');
        if (repaired) summary.reconciled++; else summary.deferred++;
        continue;
      }
      const { data: claim, error: claimError } = await db.rpc('claim_email_recovery_send', {
        p_source: item.source, p_id: item.send_id, p_run_token: runToken,
        p_provider_scope: createHash('sha256').update(key).digest('hex'),
      });
      if (claimError || !claim) throw new Error('Email recovery claim unavailable');
      if (['blocked', 'review'].includes(claim.action)) {
        if (['accepted', 'cancelled', 'missing'].includes(claim.reason)) summary.deferred++; else summary.review++;
        continue;
      }
      if (claim.action === 'busy') { summary.deferred++; continue; }
      if (claim.action !== 'send' || claim.id !== item.send_id || claim.account_id !== item.account_id) throw new Error('Invalid recovery claim identity');
      active = { source: item.source, id: claim.id, token: claim.token };
      try {
        if (item.source === 'document') {
          await executeDocumentEmailClaim(db, provider, item.account_id, claim, { runToken });
          const { data: repaired, error: repairError } = await db.rpc('reconcile_email_recovery_acceptance', { p_id: item.send_id, p_run_token: runToken });
          if (repairError) throw new Error('Email acceptance reconciliation unavailable');
          if (repaired) summary.reconciled++;
        } else {
          const result = await executeLifecycleEmailClaim(db, provider, item.account_id, claim, { runToken });
          if (result.error || !result.data?.id) throw new Error('Lifecycle recovery acceptance unconfirmed');
        }
        summary.accepted++;
      } catch {
        // The executor saved retry/review state or left a fenced uncertain lease.
        // Stop the batch on failure; do not spend more requests during a provider outage.
        summary.failed++;
        summary.deferred += work.length - index - 1;
        break;
      }
    }
  } finally {
    const { error } = await db.rpc('end_email_recovery_run', { p_run_token: runToken });
    if (error) throw new Error('Email recovery run release unavailable');
  }
  return summary;
}
