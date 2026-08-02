import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';
import { listClientsWithStats } from '@/lib/clients';
import { sendCampaignSms } from '@/lib/sms';
import { sendCampaignEmail } from '@/lib/email';
import { loadSuppressedEmails } from '@/lib/email-suppression';
import { isMailable } from '@/lib/email-quality';

export type CampaignChannel = 'email' | 'sms' | 'both';
export type CampaignAudience = 'all' | 'past' | 'repeat' | 'lapsed';

// A customer with no job in this many days is "lapsed" — the segment worth a
// "we're booking again / here's an offer" nudge.
export const LAPSED_DAYS = 120;
// Bound one send so a server action never runs long enough to time out. A single
// contractor's list is well under this; larger lists get the most-recent slice.
const MAX_RECIPIENTS = 250;
// Send in small concurrent batches — fast enough, gentle on the SMS/email APIs.
const BATCH_SIZE = 8;
const DAY = 24 * 60 * 60 * 1000;

export type Campaign = {
  id: string;
  account_id: string;
  channel: CampaignChannel;
  audience: string;
  subject: string | null;
  body: string;
  recipient_count: number;
  email_sent: number;
  sms_sent: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
};

export const AUDIENCE_DEFS: { id: CampaignAudience; label: string; hint: string }[] = [
  { id: 'past', label: 'Past customers', hint: 'Everyone who booked at least one job' },
  { id: 'repeat', label: 'Repeat customers', hint: 'Two or more jobs — your best fans' },
  { id: 'lapsed', label: 'Lapsed customers', hint: `Booked before, but nothing in ${LAPSED_DAYS}+ days` },
  { id: 'all', label: 'Everyone', hint: 'Every client in your list' },
];

// Slim, contact-free descriptor the composer uses for live reach counts, plus
// the fields the send path needs. `smsReady` means an opted-in consent row;
// `emailReady` means the client has an email that has NOT unsubscribed (marketing
// opt-out), mirroring how SMS gates on consent.
export type CampaignRecipient = {
  name: string | null;
  phone: string | null;
  email: string | null;
  smsReady: boolean;
  emailReady: boolean;
  jobCount: number;
  lastJobAt: string | null;
};

export function matchesAudience(
  recipient: { jobCount: number; lastJobAt: string | null },
  audience: CampaignAudience,
  now: number,
): boolean {
  switch (audience) {
    case 'all':
      return true;
    case 'past':
      return recipient.jobCount >= 1;
    case 'repeat':
      return recipient.jobCount >= 2;
    case 'lapsed':
      if (recipient.jobCount < 1) return false;
      if (!recipient.lastJobAt) return true;
      return now - new Date(recipient.lastJobAt).getTime() >= LAPSED_DAYS * DAY;
    default:
      return false;
  }
}

// The set of phone numbers this account has explicit SMS consent for. Marketing
// texts go ONLY to opted-in numbers — stricter than transactional sends, which
// merely skip opt-outs. Stored normalized, matching how consent rows are keyed.
async function loadOptedInPhones(supabase: SupabaseClient, accountId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('sms_consent')
    .select('phone_number')
    .eq('account_id', accountId)
    .eq('status', 'opted_in');
  return new Set((data ?? []).map((row) => row.phone_number as string));
}

export async function loadRecipients(supabase: SupabaseClient, accountId: string): Promise<CampaignRecipient[]> {
  const [clients, optedIn, suppressed] = await Promise.all([
    listClientsWithStats(supabase, accountId),
    loadOptedInPhones(supabase, accountId),
    loadSuppressedEmails(supabase, accountId),
  ]);
  return clients.map((client) => {
    const phone = client.phone ? normalizeUsPhone(client.phone) : null;
    const email = client.email;
    return {
      name: client.name,
      phone,
      email,
      smsReady: Boolean(phone && optedIn.has(phone)),
      // Three gates, and the third is new: an address that cannot deliver, or
      // is a placeholder someone typed to get past a required field, must not
      // go into a BULK send. A campaign is where junk addresses do their real
      // damage — a hundred at once is a bounce spike, and a bounce spike is
      // what mailbox providers act on. Judged at send time rather than trusted
      // from intake, so addresses collected before the intake check, imported
      // from another CRM, or typed straight into a client record are all
      // covered by the same rule.
      emailReady:
        Boolean(email) &&
        !suppressed.has((email as string).trim().toLowerCase()) &&
        isMailable(email),
      jobCount: client.jobCount,
      lastJobAt: client.lastJobAt,
    };
  });
}

function personalize(text: string, recipient: CampaignRecipient): string {
  const firstName = (recipient.name || 'there').trim().split(/\s+/)[0] || 'there';
  return text.replace(/\{name\}/gi, firstName);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type CampaignSendResult = {
  recipientCount: number;
  emailSent: number;
  smsSent: number;
  failed: number;
  skipped: number;
};

// Broadcast the message to the chosen audience over the chosen channel(s).
// Best-effort per recipient: one bad email/text is counted and skipped, never
// sinking the run. Records the campaign (with outcome counts) when done.
export async function sendCampaign(
  supabase: SupabaseClient,
  accountId: string,
  input: { channel: CampaignChannel; audience: CampaignAudience; subject: string; body: string; businessName: string; mailingAddress: string | null },
): Promise<CampaignSendResult> {
  const now = Date.now();
  const wantEmail = input.channel === 'email' || input.channel === 'both';
  const wantSms = input.channel === 'sms' || input.channel === 'both';

  const targets = (await loadRecipients(supabase, accountId))
    .filter((recipient) => matchesAudience(recipient, input.audience, now))
    .slice(0, MAX_RECIPIENTS);

  let emailSent = 0;
  let smsSent = 0;
  let failed = 0;
  let skipped = 0;

  for (const batch of chunk(targets, BATCH_SIZE)) {
    await Promise.all(
      batch.map(async (recipient) => {
        // Email gating mirrors SMS: only reach addresses that haven't unsubscribed
        // (emailReady already folds in "has an email" + "not suppressed").
        const canEmail = wantEmail && recipient.emailReady;
        const canSms = wantSms && Boolean(recipient.phone) && recipient.smsReady;
        if (!canEmail && !canSms) {
          skipped++;
          return;
        }
        if (canEmail) {
          try {
            await sendCampaignEmail({
              recipientEmail: recipient.email as string,
              businessName: input.businessName,
              subject: personalize(input.subject, recipient),
              body: personalize(input.body, recipient),
              accountId,
              mailingAddress: input.mailingAddress,
            });
            emailSent++;
          } catch (error) {
            failed++;
            console.error('Campaign email failed:', error instanceof Error ? error.message : error);
          }
        }
        if (canSms) {
          try {
            await sendCampaignSms({
              phone: recipient.phone as string,
              businessName: input.businessName,
              body: personalize(input.body, recipient),
              accountId,
            });
            smsSent++;
          } catch (error) {
            failed++;
            console.error('Campaign SMS failed:', error instanceof Error ? error.message : error);
          }
        }
      }),
    );
  }

  await supabase.from('campaigns').insert({
    account_id: accountId,
    channel: input.channel,
    audience: input.audience,
    subject: wantEmail ? input.subject : null,
    body: input.body,
    recipient_count: targets.length,
    email_sent: emailSent,
    sms_sent: smsSent,
    failed_count: failed,
    skipped_count: skipped,
  });

  return { recipientCount: targets.length, emailSent, smsSent, failed, skipped };
}

// Past campaigns, newest first. Defensive: an un-migrated DB (no campaigns
// table) degrades to an empty history instead of throwing.
export async function listCampaigns(supabase: SupabaseClient, accountId: string): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as Campaign[];
}
