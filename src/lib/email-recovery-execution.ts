import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateEmailOptions, Resend } from 'resend';

export type EmailProvider = Pick<Resend, 'key' | 'fetchRequest'>;
export type SavedEmailClaim = {
  action: string; id: string; token: string; key: string; payload: CreateEmailOptions; retry_before: string;
  phase: 'primary' | 'fallback'; reason?: string; provider_id?: string;
};
export type RecoveryExecution = { runToken: string };
export type EmailAttemptResult = {
  data: { id: string } | null; error: { message: string; name?: string } | null; retrySeconds?: number;
};

export async function assertRecoveryMaySubmit(admin: SupabaseClient, accountId: string, recovery?: RecoveryExecution) {
  if (!recovery) return;
  const { data, error } = await admin.rpc('email_recovery_can_submit', { p_run_token: recovery.runToken, p_account_id: accountId });
  if (error || data !== true) throw new Error('Email recovery paused or run lease expired');
}

export async function finishEmailAttempt(admin: SupabaseClient, source: 'document' | 'lifecycle' | 'customer',
  claim: SavedEmailClaim, accountId: string, result: EmailAttemptResult, recovery?: RecoveryExecution) {
  const providerId = result.error ? null : result.data?.id || null;
  const args = { p_id: claim.id, p_account_id: accountId, p_token: claim.token, p_provider_id: providerId,
    p_error: result.error?.message || (providerId ? null : 'Provider did not confirm an email ID') };
  if (recovery) {
    return await admin.rpc('finish_email_recovery_send', { ...args, p_source: source,
      p_error_name: result.error?.name ?? null, p_retry_seconds: result.retrySeconds ?? null, p_run_token: recovery.runToken });
  }
  const rpcName = source === 'document' ? 'finish_document_email_send'
    : source === 'lifecycle' ? 'finish_contractor_lifecycle_send'
    : 'finish_customer_email_send';
  return await admin.rpc(rpcName, args);
}
