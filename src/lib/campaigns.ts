import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';
import { listClientsWithStats } from '@/lib/clients';
import { sendCampaignSms } from '@/lib/sms';
import { sendCampaignEmail } from '@/lib/email';
import { loadSuppressedEmails } from '@/lib/email-suppression';
import { isMailable } from '@/lib/email-quality';

// The audience vocabulary and the Campaign shape live in campaign-audiences.ts
// so a client component can read a label without pulling this module — and with
// it the Supabase server client — into the browser bundle. Re-exported here so
// every existing caller keeps working; imported separately because a re-export
// does not bring the names into this module's own scope.
export {
  AUDIENCE_DEFS,
  LAPSED_DAYS,
  campaignAudienceForBeat,
  matchesAudience,
  type Campaign,
  type CampaignAudience,
  type CampaignChannel,
} from '@/lib/campaign-audiences';
import { matchesAudience, type Campaign, type CampaignAudience, type CampaignChannel } from '@/lib/campaign-audiences';

// Bound one send so a server action never runs long enough to time out. A single
// contractor's list is well under this; larger lists get the most-recent slice.
const MAX_RECIPIENTS = 250;
// Send in small concurrent batches — fast enough, gentle on the SMS/email APIs.
const BATCH_SIZE = 8;
const DAY = 24 * 60 * 60 * 1000;

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
  input: { channel: CampaignChannel; audience: CampaignAudience; subject: string; body: string; businessName: string; mailingAddress: string | null; beatId?: string | null },
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

  const row = {
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
  };

  // The messages are already gone by the time we get here, so the history row
  // must not be all-or-nothing. On a database without the beat_id migration the
  // insert fails on the unknown column and we would lose the record of a send
  // that really happened — write it again without the topic instead.
  const { error } = await supabase
    .from('campaigns')
    // Widened deliberately: the inferred literal type is built from this same
    // object, so adding a key conditionally reads as an excess property.
    .insert((input.beatId ? { ...row, beat_id: input.beatId } : row) as typeof row);
  if (error && input.beatId) {
    console.error('Campaign insert with beat_id failed, retrying without:', error.message);
    await supabase.from('campaigns').insert(row);
  }

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

/** When a seasonal topic was last sent, and to how many people. */
export type BeatSend = { beatId: string; lastSentAt: string; recipientCount: number };

/**
 * How long a send keeps a topic marked as done.
 *
 * Not forever, and this matters twice. A beat's window can run two months, so
 * "sent" in the first month must not make it look finished in the second — and
 * these are SEASONAL topics that come round every year, so a card that stayed
 * struck through would be wrong by the following autumn. Sixty days covers the
 * longest window and expires well before the season returns.
 */
export const BEAT_DONE_DAYS = 60;

/**
 * Which topics this account has already acted on.
 *
 * Returns an empty map on any error rather than throwing, so a database without
 * the beat_id migration simply shows every card as untouched — which is exactly
 * how the page behaved before it could remember anything.
 */
export async function loadSentBeats(supabase: SupabaseClient, accountId: string): Promise<Map<string, BeatSend>> {
  const sent = new Map<string, BeatSend>();
  const { data, error } = await supabase
    .from('campaigns')
    .select('beat_id, created_at, recipient_count')
    .eq('account_id', accountId)
    .not('beat_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return sent;

  for (const row of data ?? []) {
    const beatId = String((row as { beat_id?: unknown }).beat_id ?? '');
    // Newest first, so the first row for a topic is the most recent send.
    if (!beatId || sent.has(beatId)) continue;
    sent.set(beatId, {
      beatId,
      lastSentAt: String((row as { created_at: string }).created_at),
      recipientCount: Number((row as { recipient_count?: unknown }).recipient_count) || 0,
    });
  }
  return sent;
}

/**
 * What the list has been through lately.
 *
 * Two numbers, and neither is vanity. How recently they sent is the strongest
 * predictor of an unsubscribe — far stronger than anything in the message — and
 * the unsubscribe count is the only honest feedback signal we have: we do not
 * track opens or clicks, because that needs a tracking pixel and a vendor.
 */
export type ListHealth = {
  lastSentAt: string | null;
  daysSinceLastSend: number | null;
  unsubscribesSinceLastSend: number;
};

export async function loadListHealth(supabase: SupabaseClient, accountId: string): Promise<ListHealth> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1);

  const lastSentAt = !error && data && data.length > 0 ? String(data[0].created_at) : null;
  if (!lastSentAt) return { lastSentAt: null, daysSinceLastSend: null, unsubscribesSinceLastSend: 0 };

  // Whole days elapsed — "3 days ago" should not become "4" because of a clock
  // time. Floored, so anything inside 24 hours reads as today.
  const daysSinceLastSend = Math.max(0, Math.floor((Date.now() - new Date(lastSentAt).getTime()) / DAY));

  const { count, error: countError } = await supabase
    .from('email_suppression')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gt('created_at', lastSentAt);

  return {
    lastSentAt,
    daysSinceLastSend,
    unsubscribesSinceLastSend: countError ? 0 : count ?? 0,
  };
}
