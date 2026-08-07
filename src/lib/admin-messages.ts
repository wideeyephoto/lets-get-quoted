import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * What we have already sent an account, in one list.
 *
 * "Did they get the invoice email?" was unanswerable in the console. The data
 * was there — email_events even ships an index on (account_id, occurred_at
 * desc), built for exactly this view — and nothing read it.
 *
 * TWO HONEST LIMITS, both surfaced in the UI rather than left for somebody to
 * discover:
 *
 *   Email attribution is tag-dependent. lib/email.ts passes account_id on
 *   invoice, client_quote and quote_followup sends; magic_link, daily_digest,
 *   lead_notification, contact_message and support_case_* carry only a `kind`,
 *   so those rows land with account_id null and cannot appear here. The column
 *   is `on delete set null`, so a null is also what an email to a since-deleted
 *   account looks like — the two are indistinguishable, which is why this reads
 *   as "not attributed" rather than "not sent".
 *
 *   SMS coverage is narrower still. sms_events is written only by the payment
 *   and crew senders; the rest of lib/sms.ts — appointment reminders, arrival
 *   notices, quote follow-ups, Quick Stop status — sends without logging. So
 *   "did they get the reminder text" is not a question this page declines to
 *   answer, it is one nothing in the product can answer yet.
 *
 * A message history that quietly omitted those would be worse than none: staff
 * would read an absent row as "we never sent it" and tell a customer so.
 */

export type MessageChannel = 'email' | 'sms';

export type AccountMessage = {
  id: string;
  channel: MessageChannel;
  /** What kind of message: the email `kind` tag, or the SMS `event_type`. */
  kind: string;
  recipient: string;
  status: string;
  errorReason: string | null;
  occurredAt: string;
  /** Only SMS carries the body. Email events record delivery, not content. */
  body: string | null;
};

/** Which statuses are a problem, per channel — they do not share a vocabulary. */
export function messageFailed(message: AccountMessage): boolean {
  if (message.channel === 'email') return message.status === 'bounced' || message.status === 'complained';
  return message.status === 'failed' || message.status === 'opted_out';
}

type EmailRow = {
  id: string;
  kind: string | null;
  recipient: string;
  status: string;
  error_reason: string | null;
  occurred_at: string;
};

type SmsRow = {
  id: string;
  event_type: string;
  phone_number: string;
  status: string;
  error_reason: string | null;
  body: string | null;
  created_at: string;
  sent_at: string | null;
};

/**
 * Newest-first, merged across both channels.
 *
 * Each side is fetched at `limit` and the merge is trimmed back to it, so a
 * chatty channel cannot crowd the other out of the window — fetching
 * limit/2 each would hide recent emails on an account with a lot of texts.
 *
 * Never throws: this is one panel on a page with a dozen, and a failure here
 * must not take the account page down with it.
 */
export async function listAccountMessages(
  admin: SupabaseClient,
  accountId: string,
  limit = 40,
): Promise<AccountMessage[]> {
  const [emailRes, smsRes] = await Promise.all([
    admin
      .from('email_events')
      .select('id, kind, recipient, status, error_reason, occurred_at')
      .eq('account_id', accountId)
      .order('occurred_at', { ascending: false })
      .limit(limit),
    admin
      .from('sms_events')
      .select('id, event_type, phone_number, status, error_reason, body, created_at, sent_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);
  if (emailRes.error) console.error('listAccountMessages (email) failed:', emailRes.error);
  if (smsRes.error) console.error('listAccountMessages (sms) failed:', smsRes.error);

  const messages: AccountMessage[] = [
    ...((emailRes.data ?? []) as EmailRow[]).map((row) => ({
      id: `email:${row.id}`,
      channel: 'email' as const,
      kind: row.kind || 'unknown',
      recipient: row.recipient,
      status: row.status,
      errorReason: row.error_reason,
      occurredAt: row.occurred_at,
      body: null,
    })),
    ...((smsRes.data ?? []) as SmsRow[]).map((row) => ({
      id: `sms:${row.id}`,
      channel: 'sms' as const,
      kind: row.event_type,
      recipient: row.phone_number,
      status: row.status,
      errorReason: row.error_reason,
      // Dated by when it actually went out where we know that, falling back to
      // when the row was made. A queued text that never sent has no sent_at,
      // and dating it by that would drop it out of the ordering entirely.
      occurredAt: row.sent_at ?? row.created_at,
      body: row.body,
    })),
  ];

  return messages
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

/** Human labels for the message kinds these two tables actually record. */
export const MESSAGE_KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice',
  client_quote: 'Quote',
  quote_followup: 'Quote follow-up',
  payment_requested: 'Payment request',
  payment_paid: 'Payment received',
  payment_failed: 'Payment failed',
  payment_refunded: 'Refund',
  crew_assigned: 'Crew assignment',
  crew_schedule: 'Crew schedule',
  unknown: 'Unknown',
};

export function messageKindLabel(kind: string): string {
  return MESSAGE_KIND_LABEL[kind] ?? kind.replace(/_/g, ' ');
}
