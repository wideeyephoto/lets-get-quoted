
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateEmailOptions } from 'resend';
import { assertRecoveryMaySubmit, finishEmailAttempt, type EmailProvider, type EmailAttemptResult, type RecoveryExecution } from './email-recovery-execution';

export type CustomerEmailContext = {
  accountId: string;
  jobId?: string;
  kind: string;
  idempotencyKey: string;
};
export type CustomerEmailReceipt = { id: string; alreadyAccepted: boolean };
type Claim = { action: string; id: string; token: string; phase: 'primary' | 'fallback'; payload: CreateEmailOptions; key: string; retry_before: string };

function validClaim(value: Claim): boolean {
  return value?.action === 'send' && Boolean(value.id && value.token && value.key && value.payload)
    && ['primary', 'fallback'].includes(value.phase) && Number.isFinite(Date.parse(value.retry_before));
}

export async function sendCustomerEmail(
  admin: SupabaseClient, resend: EmailProvider, context: CustomerEmailContext, message: CreateEmailOptions,
): Promise<CustomerEmailReceipt> {
  if (!context.accountId || !context.kind || !context.idempotencyKey || !resend.key) {
    throw new Error('Email could not be submitted: context or provider configuration is unavailable.');
  }
  const payload = { ...message, attachments: message.attachments?.map(attachment => ({
    ...attachment,
    content: Buffer.isBuffer(attachment.content) ? attachment.content.toString('base64') : attachment.content,
  })) };
  const { data, error } = await admin.rpc('claim_customer_email_send', {
    p_account_id: context.accountId,
    p_job_id: context.jobId ?? null,
    p_kind: context.kind,
    p_idempotency_key: context.idempotencyKey,
    p_payload: payload,
    p_provider_scope: createHash('sha256').update(resend.key).digest('hex'),
  });
  if (error || !data) throw new Error('Email could not be submitted: send record is unavailable.');
  return executeCustomerEmailClaim(admin, resend, context.accountId, data);
}

export async function executeCustomerEmailClaim(admin: SupabaseClient, resend: EmailProvider, accountId: string, data: Claim & { provider_id?: string; reason?: string }, recovery?: RecoveryExecution): Promise<CustomerEmailReceipt> {
  if (data.action === 'already_sent' && data.provider_id) return { id: data.provider_id, alreadyAccepted: true };
  if (data.action === 'busy') throw new Error('This email is in progress or waiting to retry. Check its send record before trying again.');
  if (['blocked', 'review'].includes(data.action)) {
    throw new Error('This email needs delivery review before another attempt.');
  }
  if (!validClaim(data)) throw new Error('Email could not be submitted: invalid send record.');
  let claim: Claim = data;

  const submit = async (): Promise<EmailAttemptResult> => {
    try {
      await assertRecoveryMaySubmit(admin, accountId, recovery);
      if (Date.now() >= Date.parse(claim.retry_before)) throw new Error('Email retry window expired before submission');
      return await resend.fetchRequest<{ id: string }>('/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${resend.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': claim.key },
        body: JSON.stringify(claim.payload), signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      return { data: null, error: { name: 'application_error', message: cause instanceof Error ? cause.message : 'Provider outcome unknown' } };
    }
  };
  let result = await submit();
  if (claim.phase === 'primary' && !result.data && result.error?.name === 'validation_error') {
    const { data: fallback, error: fallbackError } = await admin.rpc('fallback_customer_email_send', {
      p_id: claim.id, p_account_id: accountId, p_token: claim.token,
      p_error_name: result.error.name, p_error_message: result.error.message,
    });
    if (fallbackError) throw new Error(`Email outcome requires reconciliation: ${fallbackError.message}`);
    if (fallback) {
      if (!validClaim(fallback) || fallback.id !== claim.id || fallback.token !== claim.token || fallback.phase !== 'fallback') {
        throw new Error(`Invalid fallback send record; review email ${claim.id}`);
      }
      claim = fallback;
      result = await submit();
    }
  }
  const providerId = result.error ? null : result.data?.id || null;
  
  const { data: finished, error: finishError } = await finishEmailAttempt(admin, 'customer', claim, accountId, result, recovery);
  
  if (finishError || finished !== true) throw new Error(`Email outcome requires reconciliation: ${finishError?.message || 'finish returned false'}`);
  if (!providerId) throw new Error(`Email acceptance was not confirmed. Check the send record before retrying: ${claim.id}`);
  return { id: providerId, alreadyAccepted: false };
}
