import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import type { CreateEmailOptions, Resend } from 'resend';

type LifecycleEvent = { account_id: string; meta: unknown };
type SendResult = { data: { id: string } | null; error: { message: string } | null; skipped?: string };

// The activity feed remains useful for historical sends, but new sends are
// authoritative in the ledger even when best-effort feed writes fail.
export async function loadLifecycleSendHistory(admin: SupabaseClient, accountIds: string[]): Promise<LifecycleEvent[]> {
  const { data: legacy, error: legacyError } = await admin.from('account_events')
    .select('account_id, meta').in('account_id', accountIds).eq('kind', 'contractor_lifecycle_email_sent');
  if (legacyError || !legacy || legacy.length >= 1000) throw new Error('Lifecycle history unavailable or truncated; no emails sent.');
  const { data: sends, error } = await admin.from('contractor_lifecycle_sends')
    .select('account_id, step_id, accepted_at').in('account_id', accountIds).eq('state', 'accepted');
  if (error || !sends || sends.length >= 1000) throw new Error('Lifecycle send ledger unavailable or truncated; no emails sent.');
  return [...legacy, ...sends.map(send => ({
    account_id: send.account_id,
    meta: { step_id: send.step_id, sent_at: send.accepted_at },
  }))];
}

export async function sendLifecycleMessage(
  admin: SupabaseClient,
  resend: Resend,
  message: CreateEmailOptions,
  accountId: string,
  stepId: string,
): Promise<SendResult> {
  if (!resend.key) throw new Error('Lifecycle provider credential unavailable; no email submitted.');
  const { data: claim, error } = await admin.rpc('claim_contractor_lifecycle_send', {
    p_account_id: accountId, p_step_id: stepId, p_payload: message,
    p_provider_scope: createHash('sha256').update(resend.key).digest('hex'),
  });
  if (error || !claim) throw new Error('Lifecycle send claim unavailable; no email submitted.');
  if (['already_sent', 'busy', 'blocked'].includes(claim.action)) {
    return { data: null, error: null, skipped: claim.reason || claim.action };
  }
  if (claim.action === 'review') {
    return { data: null, error: { message: `Lifecycle send requires review: ${claim.reason || claim.id}` } };
  }
  if (claim.action !== 'send' || !claim.id || !claim.token || !claim.key || !claim.payload
    || !Number.isFinite(Date.parse(claim.retry_before))) {
    throw new Error('Invalid lifecycle send claim; no email submitted.');
  }

  let result: SendResult;
  try {
    if (Date.now() >= Date.parse(claim.retry_before)) throw new Error('Lifecycle retry window expired before submission');
    // Use the persisted snapshot even if templates or the business name changed.
    // SDK v3 exposes fetchRequest for the provider idempotency HTTP header.
    result = await resend.fetchRequest<{ id: string }>('/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resend.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': claim.key },
      body: JSON.stringify(claim.payload),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    result = { data: null, error: { message: cause instanceof Error ? cause.message : 'Provider outcome unknown' } };
  }

  const providerId = result.error ? null : result.data?.id || null;
  const { data: finished, error: finishError } = await admin.rpc('finish_contractor_lifecycle_send', {
    p_id: claim.id, p_account_id: accountId, p_token: claim.token,
    p_provider_id: providerId, p_error: result.error?.message || (providerId ? null : 'Provider did not confirm an email ID'),
  });
  if (finishError || finished !== true) {
    throw new Error(`Lifecycle send outcome requires reconciliation: ${claim.id}`);
  }
  return providerId ? { data: { id: providerId }, error: null }
    : { data: null, error: result.error || { message: 'Provider did not confirm an email ID' } };
}
