import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateEmailOptions } from 'resend';
import { assertEmailSendAllowed } from './email-send-policy';
import { assertRecoveryMaySubmit, finishEmailAttempt, type EmailProvider, type EmailAttemptResult, type RecoveryExecution } from './email-recovery-execution';

export type DocumentEmailContext = {
  accountId: string;
  jobId: string;
  jobRevision: string | undefined;
  invoiceId?: string;
  invoiceRevision?: string;
};
export type DocumentEmailReceipt = { id: string; alreadyAccepted: boolean };
type Claim = { action: string; id: string; token: string; phase: 'primary' | 'fallback'; payload: CreateEmailOptions; key: string; retry_before: string };

function validClaim(value: Claim): boolean {
  return value?.action === 'send' && Boolean(value.id && value.token && value.key && value.payload)
    && ['primary', 'fallback'].includes(value.phase) && Number.isFinite(Date.parse(value.retry_before));
}

export async function sendDocumentEmail(
  admin: SupabaseClient, resend: EmailProvider, context: DocumentEmailContext, message: CreateEmailOptions,
): Promise<DocumentEmailReceipt> {
  if (!context.accountId || !context.jobId || !context.jobRevision || (context.invoiceId && !context.invoiceRevision) || !resend.key) {
    throw new Error('Email could not be submitted: document revision or provider configuration is unavailable.');
  }
  // The SDK normally encodes Buffer attachments; our durable HTTP snapshot must
  // already contain the exact wire value so regenerated PDF metadata cannot vary.
  const payload = { ...message, attachments: message.attachments?.map(attachment => ({
    ...attachment,
    content: Buffer.isBuffer(attachment.content) ? attachment.content.toString('base64') : attachment.content,
  })) };
  const { data, error } = await admin.rpc('claim_document_email_send', {
    p_account_id: context.accountId, p_job_id: context.jobId, p_invoice_id: context.invoiceId ?? null,
    p_job_revision: context.jobRevision, p_invoice_revision: context.invoiceRevision ?? null,
    p_payload: payload, p_provider_scope: createHash('sha256').update(resend.key).digest('hex'),
  });
  if (error || !data) throw new Error('Email could not be submitted: send record is unavailable.');
  return executeDocumentEmailClaim(admin, resend, context.accountId, data);
}

export async function executeDocumentEmailClaim(admin: SupabaseClient, resend: EmailProvider, accountId: string, data: Claim & { provider_id?: string; reason?: string }, recovery?: RecoveryExecution): Promise<DocumentEmailReceipt> {
  if (data.action === 'already_sent' && data.provider_id) return { id: data.provider_id, alreadyAccepted: true };
  if (data.action === 'busy') throw new Error('This email is in progress or waiting to retry. Check its send record before trying again.');
  if (['blocked', 'review'].includes(data.action)) {
    const reasons: Record<string, string> = {
      document_unavailable: 'The document is unavailable.',
      account_ineligible: 'Email sending is unavailable for this account.',
      document_or_recipient_changed: 'The document or recipient changed. Reload it before sending.',
      invoice_changed_or_unavailable: 'The invoice changed or is unavailable. Reload it before sending.',
      invoice_closed: 'This invoice is already paid or void.',
      recipient_delivery_block: 'Delivery to this recipient is blocked. Check the address and delivery history.',
      previous_revision_unresolved: 'An earlier email needs delivery review before you can send this version.',
    };
    throw new Error(reasons[data.reason ?? ''] || 'This email needs delivery review before another attempt.');
  }
  if (!validClaim(data)) throw new Error('Email could not be submitted: invalid send record.');
  let claim: Claim = data;

  const submit = async (): Promise<EmailAttemptResult> => {
    try {
      await assertRecoveryMaySubmit(admin, accountId, recovery);
      await assertEmailSendAllowed(admin, claim.payload);
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
    const { data: fallback, error: fallbackError } = await admin.rpc('fallback_document_email_send', {
      p_id: claim.id, p_account_id: accountId, p_token: claim.token,
      p_error_name: result.error.name, p_error_message: result.error.message,
    });
    if (fallbackError) throw new Error(`Email outcome requires reconciliation: ${claim.id}`);
    if (fallback) {
      if (!validClaim(fallback) || fallback.id !== claim.id || fallback.token !== claim.token || fallback.phase !== 'fallback') {
        throw new Error(`Invalid fallback send record; review email ${claim.id}`);
      }
      claim = fallback;
      result = await submit();
    }
  }
  const providerId = result.error ? null : result.data?.id || null;
  const { data: finished, error: finishError } = await finishEmailAttempt(admin, 'document', claim, accountId, result, recovery);
  if (finishError || finished !== true) throw new Error(`Email outcome requires reconciliation: ${claim.id}`);
  if (!providerId) throw new Error(`Email acceptance was not confirmed. Check the send record before retrying: ${claim.id}`);
  return { id: providerId, alreadyAccepted: false };
}
