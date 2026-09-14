import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateEmailOptions, Resend } from 'resend';
import { resendTagValue } from './resend-tags';

const MARKETING_KINDS = new Set(['campaign', 'review_request', 'rebook_invite']);
const DELIVERY_BLOCKS = new Set(['hard_bounce', 'complaint', 'provider_suppressed']);

/** Bind independent transports to an explicit workspace before submitting. */
export async function sendAccountScopedEmail(admin: SupabaseClient, resend: Pick<Resend, 'emails'>,
  accountId: string, payload: CreateEmailOptions) {
  if (!accountId?.trim() || payload.tags?.some(tag => tag.name === 'account_id' && tag.value !== accountId)) {
    throw new Error('Email workspace could not be verified.');
  }
  const message = { ...payload, tags: [...(payload.tags ?? []).filter(tag => tag.name !== 'account_id'),
    { name: 'account_id', value: accountId }] };
  await assertEmailSendAllowed(admin, message);
  return resend.emails.send(message);
}

/** Final account-scoped gate, including each fallback attempt and cc/bcc. */
export async function assertEmailSendAllowed(admin: SupabaseClient, payload: CreateEmailOptions): Promise<void> {
  const accountId = resendTagValue(payload.tags, 'account_id');
  if (!accountId) return; // Platform/support mail has no tenant suppression scope.
  const addresses = [payload.to, payload.cc, payload.bcc].flat().filter(value => value != null);
  if (addresses.some(value => typeof value !== 'string' || /[\r\n]/.test(value))) {
    throw new Error('Email recipient list could not be verified.');
  }
  const recipients = [...new Set(addresses.map(value => (value!.match(/<([^<>]+)>\s*$/)?.[1] ?? value!).trim().toLowerCase()))];
  if (!recipients.length || recipients.length > 100 || recipients.some(value => !value)) throw new Error('Email recipient list could not be verified.');
  const { data, error } = await admin.from('email_suppression').select('email, reason')
    .eq('account_id', accountId).in('email', recipients);
  if (error || !data || data.length >= 1000) throw new Error('Email delivery preferences could not be checked. No email was submitted.');
  const marketing = MARKETING_KINDS.has(resendTagValue(payload.tags, 'kind') ?? '');
  if (data.some(row => marketing || DELIVERY_BLOCKS.has(row.reason))) {
    throw new Error(marketing ? 'A recipient has opted out or cannot receive this email.'
      : 'Email delivery to a recipient is blocked. Check the delivery history before sending again.');
  }
}
