import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateEmailOptions, Resend } from 'resend';

const DELIVERY_BLOCKS = new Set(['hard_bounce', 'complaint', 'provider_suppressed']);
const MARKETING_ONLY = new Set(['unsubscribe_link', 'one_click_unsubscribe']);

/** Explicit platform recipients, never an inferred tenant or marketing scope. */
export async function sendPlatformTransactionalEmail(admin: SupabaseClient, client: Pick<Resend, 'emails'>, payload: CreateEmailOptions,
  options?: Parameters<Resend['emails']['send']>[1]) {
  const message = await preparePlatformTransactionalEmail(admin, payload);
  return options ? client.emails.send(message, options) : client.emails.send(message);
}

/** Run immediately before submission, including for bounded HTTP transports. */
export async function preparePlatformTransactionalEmail(admin: SupabaseClient, payload: CreateEmailOptions) {
  if (payload.tags?.some(tag => tag.name === 'account_id'
    || (tag.name === 'delivery_scope' && tag.value !== 'platform_transactional'))) {
    throw new Error('Platform email scope could not be verified.');
  }
  const addresses = [payload.to, payload.cc, payload.bcc].flat().filter(value => value != null);
  if (addresses.some(value => typeof value !== 'string' || /[\r\n]/.test(value))) throw new Error('Email recipients could not be verified.');
  const recipients = [...new Set(addresses.map(value => (value!.match(/<([^<>]+)>\s*$/)?.[1] ?? value!).trim().toLowerCase()))];
  if (!recipients.length || recipients.length > 100 || recipients.some(value => !value || /[\s<>]/.test(value))) throw new Error('Email recipients could not be verified.');
  // One primary-key lookup per recipient avoids row-cap ambiguity in To/Cc/Bcc.
  // Stop the entire submission if any lookup or delivery check fails.
  for (const email of recipients) {
    const { data, error } = await admin.from('platform_email_suppression').select('email, reason').eq('email', email).maybeSingle();
    if (error || data === undefined || (data && (data.email !== email || (!DELIVERY_BLOCKS.has(data.reason) && !MARKETING_ONLY.has(data.reason))))) {
      throw new Error('Email delivery status could not be checked. No email was submitted.');
    }
    if (data && DELIVERY_BLOCKS.has(data.reason)) throw new Error('Email delivery is blocked for a recipient.');
  }
  return { ...payload, tags: [...(payload.tags ?? []).filter(tag => tag.name !== 'delivery_scope'),
    { name: 'delivery_scope', value: 'platform_transactional' }] };
}
