import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeUsPhone } from '@/lib/phone';
import {
  beginMarketingEmailUsage,
  commitMarketingEmailUsage,
  marketingEmailMode,
  releaseMarketingEmailUsage,
  type MarketingEmailLease,
} from '@/lib/billing/marketing-email-usage';
import { releaseUsageOverage, type UsageOverageHold } from '@/lib/billing/usage-overage';
import { listClientsWithStats } from '@/lib/clients';
import { sendCampaignSms } from '@/lib/sms';
import { sendCampaignEmail } from '@/lib/email';
import { loadSuppressedEmails } from '@/lib/email-suppression';
import { isMailable } from '@/lib/email-quality';
import { isReferralConfigured, mintReferralCode, referralLink } from '@/lib/referral';

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
  /**
   * clients.id.
   *
   * Two things need it now. The SMS path keys its per-recipient idempotency on
   * it, and a send mints this customer's own referral link from it. It never
   * reaches the browser: the composer's live reach counts are computed on the
   * server and only the totals cross over.
   */
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  smsReady: boolean;
  emailReady: boolean;
  jobCount: number;
  lastJobAt: string | null;
  isLead?: boolean;
  /** Has a phone number on file at all — not the same as `smsReady` (needs consent too). */
  hasPhone: boolean;
  /** Has an email on file at all — not the same as `emailReady` (needs to be deliverable and not suppressed too). */
  hasEmail: boolean;
  /** Has an email, but it unsubscribed or bounced before. */
  emailSuppressed: boolean;
  /** Has an email, but it doesn't look deliverable (malformed or a placeholder). */
  emailUndeliverable: boolean;
};

// The set of phone numbers this account has explicit, affirmative SMS marketing consent for.
// Marketing broadcasts fail closed: ONLY numbers with verified affirmative marketing opt-in
// evidence (and not transactional touchpoints or unverified backfills like crew_backfill) are eligible.
export const AFFIRMATIVE_MARKETING_SOURCES = new Set([
  'marketing_opt_in',
  'campaign_opt_in',
  'promo_opt_in',
  'web_form_marketing_opt_in',
  'broadcast_marketing_consent',
]);

async function loadOptedInPhones(supabase: SupabaseClient, accountId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('sms_consent')
    .select('phone_number, source')
    .eq('account_id', accountId)
    .eq('status', 'opted_in');

  if (!data) return new Set();

  const marketingPhones = data
    .filter((row) => {
      const src = (row.source || '').toLowerCase().trim();
      return AFFIRMATIVE_MARKETING_SOURCES.has(src);
    })
    .map((row) => row.phone_number as string);

  return new Set(marketingPhones);
}

export async function loadRecipients(supabase: SupabaseClient, accountId: string): Promise<CampaignRecipient[]> {
  const [clients, optedIn, suppressed, { data: leads }] = await Promise.all([
    listClientsWithStats(supabase, accountId),
    loadOptedInPhones(supabase, accountId),
    loadSuppressedEmails(supabase, accountId),
    supabase
      .from('leads')
      .select('id, name, phone, email, status, converted_job, created_at')
      .eq('account_id', accountId)
      .is('converted_job', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const clientList: CampaignRecipient[] = clients.map((client) => {
    const phone = client.phone ? normalizeUsPhone(client.phone) : null;
    const email = client.email;
    const hasEmail = Boolean(email);
    const emailSuppressed = hasEmail && suppressed.has((email as string).trim().toLowerCase());
    const emailUndeliverable = hasEmail && !isMailable(email);
    return {
      id: client.id,
      name: client.name,
      phone,
      email,
      smsReady: Boolean(phone && optedIn.has(phone)),
      emailReady: hasEmail && !emailSuppressed && !emailUndeliverable,
      jobCount: client.jobCount,
      lastJobAt: client.lastJobAt,
      isLead: false,
      hasPhone: Boolean(phone),
      hasEmail,
      emailSuppressed,
      emailUndeliverable,
    };
  });

  const existingEmails = new Set(clientList.map((c) => (c.email || '').trim().toLowerCase()).filter(Boolean));
  const existingPhones = new Set(clientList.map((c) => c.phone).filter(Boolean));

  const leadList: CampaignRecipient[] = (leads || [])
    .filter((lead) => {
      const p = lead.phone ? normalizeUsPhone(lead.phone) : null;
      const e = (lead.email || '').trim().toLowerCase();
      if (e && existingEmails.has(e)) return false;
      if (p && existingPhones.has(p)) return false;
      return Boolean(p || e);
    })
    .map((lead) => {
      const phone = lead.phone ? normalizeUsPhone(lead.phone) : null;
      const email = lead.email;
      const hasEmail = Boolean(email);
      const emailSuppressed = hasEmail && suppressed.has((email as string).trim().toLowerCase());
      const emailUndeliverable = hasEmail && !isMailable(email);
      return {
        id: `lead_${lead.id}`,
        name: lead.name,
        phone,
        email,
        smsReady: Boolean(phone && optedIn.has(phone)),
        emailReady: hasEmail && !emailSuppressed && !emailUndeliverable,
        jobCount: 0,
        lastJobAt: null,
        isLead: true,
        hasPhone: Boolean(phone),
        hasEmail,
        emailSuppressed,
        emailUndeliverable,
      };
    });

  return [...clientList, ...leadList];
}

export type Reach = {
  total: number;
  email: number;
  sms: number;
  either: number;
  /** No email and no phone at all — nothing to reach them on. */
  missingContact: number;
  /** Has a phone on file that isn't consented for marketing texts. */
  optedOut: number;
  /** Has an email on file that's suppressed (unsubscribed/bounced) or undeliverable. */
  excluded: number;
};

// A reach breakdown for one already-filtered audience slice. The three
// diagnostic counts are independent facts about the SAME group, not a
// partition of it — a recipient can be both missingContact (no phone) and
// simultaneously irrelevant to `excluded` (no email to suppress). Callers must
// present them as separate notes, not as pieces that sum to `total - either`.
export function summarizeReach(matched: CampaignRecipient[]): Reach {
  return {
    total: matched.length,
    email: matched.filter((recipient) => recipient.emailReady).length,
    sms: matched.filter((recipient) => recipient.smsReady).length,
    either: matched.filter((recipient) => recipient.emailReady || recipient.smsReady).length,
    missingContact: matched.filter((recipient) => !recipient.hasEmail && !recipient.hasPhone).length,
    optedOut: matched.filter((recipient) => recipient.hasPhone && !recipient.smsReady).length,
    excluded: matched.filter((recipient) => recipient.emailSuppressed || recipient.emailUndeliverable).length,
  };
}

/**
 * The second substituted token. See personalize, and campaign-guard's allow set.
 *
 * TWO REGEXES, DELIBERATELY. .test() on a /g regex advances lastIndex and picks
 * up from there on the next call — and this constant is module-level, shared by
 * every concurrent send in the process. The detection one is therefore NOT
 * global: a stale lastIndex would make a body that plainly contains the token
 * read as though it did not, and a couple of hundred customers would get a
 * referral email with no link in it, with nothing logged and nothing to see.
 *
 * The substitution one has to be global (replace every occurrence) and is safe
 * to share, because String.prototype.replace resets lastIndex itself.
 */
// WHITESPACE-TOLERANT, TO MATCH THE GUARD. unknownPlaceholders trims the token
// it captures, so the composer tells the owner that "{ referral_link }" and
// "{ name }" are fine — while the sender matched neither and posted the braces
// to the customer. The guard is the promise; these are what keep it.
const NAME_TOKEN = /\{\s*name\s*\}/gi;
const REFERRAL_TOKEN_PRESENT = /\{\s*referral_link\s*\}/i;
const REFERRAL_TOKEN = /\{\s*referral_link\s*\}/gi;

function personalize(text: string, recipient: CampaignRecipient, referral: string | null): string {
  const firstName = (recipient.name || 'there').trim().split(/\s+/)[0] || 'there';
  const named = text.replace(NAME_TOKEN, firstName);
  // Never left in braces. A customer receiving a literal {referral_link} is the
  // exact failure the campaign guard exists to prevent, and by this point the
  // guard is long past — so the worst case here is a missing link, never a
  // visible token.
  return named.replace(REFERRAL_TOKEN, referral ?? '');
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type CampaignSendResult = {
  recipientCount: number;
  emailSent: number;
  smsQueued: number;
  failed: number;
  skipped: number;
};

// Broadcast the message to the chosen audience over the chosen channel(s).
// Best-effort per recipient: one bad email/text is counted and skipped, never
// sinking the run. Records the campaign (with outcome counts) when done.
export async function sendCampaign(
  supabase: SupabaseClient,
  accountId: string,
  input: {
    channel: CampaignChannel;
    audience: CampaignAudience;
    subject: string;
    body: string;
    businessName: string;
    mailingAddress: string | null;
    beatId?: string | null;
    /**
     * Where a referral link should point, when the message asks for one.
     *
     * The BASE only — each recipient's own code is minted below. Null when the
     * account has no published booking page, in which case {referral_link}
     * resolves to nothing rather than to somebody else's page.
     */
    referralBookingUrl?: string | null;
    /**
     * Whether this account is actually running referrals — i.e. the owner has
     * saved a thank-you offer.
     *
     * THE OFF-SWITCH, and it has to be enforced HERE. The Referrals screen tells
     * the owner that clearing their offer stops referral links going out. The
     * template stops offering the token, but a body they had already written (or
     * edited) still carries it, and this is the only place that can refuse to
     * mint. False falls back to the plain booking link rather than a dangling
     * sentence.
     */
    referralTracked?: boolean;
  },
): Promise<CampaignSendResult> {
  const wantEmail = input.channel === 'email' || input.channel === 'both';
  const wantSms = input.channel === 'sms' || input.channel === 'both';

  if (wantSms) {
    const { requireActiveDedicatedMessagingSender } = await import('@/lib/messaging-number-provisioning');
    const { createAdminClient } = await import('@/lib/auth');
    await requireActiveDedicatedMessagingSender(accountId, createAdminClient());
  }

  const now = Date.now();

  // Resolved ONCE, before the batch loop. Minting is pure and cheap, but
  // deciding whether to mint at all is a couple of environment reads, and this
  // runs 250 times otherwise.
  const wantsReferral = REFERRAL_TOKEN_PRESENT.test(input.body) || REFERRAL_TOKEN_PRESENT.test(input.subject);
  const referralBase = input.referralBookingUrl ?? null;
  const canMint = wantsReferral && referralBase !== null && Boolean(input.referralTracked) && isReferralConfigured();
  const referralFor = (recipient: CampaignRecipient): string | null => {
    if (!wantsReferral) return null;
    if (!canMint) return referralBase;
    try {
      return referralLink(referralBase as string, mintReferralCode(accountId, recipient.id));
    } catch (error) {
      // A code that cannot be minted must cost the attribution, never the send.
      console.error('Referral code mint failed:', error instanceof Error ? error.message : error);
      return referralBase;
    }
  };

  const targets = (await loadRecipients(supabase, accountId))
    .filter((recipient) => matchesAudience(recipient, input.audience, now))
    .slice(0, MAX_RECIPIENTS);

  let emailSent = 0;
  let smsQueued = 0;
  let failed = 0;
  let skipped = 0;

  // This UUID is both the durable history identity and the namespace for every
  // text in the run. A retry inside this invocation can therefore return the
  // existing queue event instead of creating a second carrier send.
  const runId = randomUUID();
  const initialRow = {
    id: runId,
    account_id: accountId,
    channel: input.channel,
    audience: input.audience,
    subject: wantEmail ? input.subject : null,
    body: input.body,
    recipient_count: targets.length,
    email_sent: 0,
    // Legacy column name: for SMS this is queue acceptance, never carrier sent.
    sms_sent: 0,
    failed_count: 0,
    skipped_count: 0,
  };

  let { error: historyError } = await supabase
    .from('campaigns')
    .insert((input.beatId ? { ...initialRow, beat_id: input.beatId } : initialRow) as typeof initialRow);
  if (historyError && input.beatId) {
    console.error('Campaign insert with beat_id failed, retrying without:', historyError.message);
    ({ error: historyError } = await supabase.from('campaigns').insert(initialRow));
  }
  if (historyError) {
    throw new Error('Campaign history could not be created, so no messages were queued.');
  }

  // Metering is dark by default. The service-role client is built only when the
  // meter is on, and imported lazily so a disabled meter changes neither this
  // module's import graph nor what a campaign send costs.
  const meterMode = marketingEmailMode();
  let ledger: SupabaseClient | null = null;
  if (meterMode !== 'off') {
    const { createAdminClient } = await import('@/lib/auth');
    ledger = createAdminClient();
  }

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
        const referral = referralFor(recipient);
        if (canEmail) {
          // Hold a credit before the send, spend it once the provider accepts,
          // give it back on anything else. One reservation per recipient because
          // commit_usage_reservation has no unit count -- see
          // lib/billing/marketing-email-usage.ts.
          let lease: MarketingEmailLease | null = null;
          let heldOverage: UsageOverageHold | null = null;
          let mayEmail = true;
          if (ledger) {
            const decision = await beginMarketingEmailUsage(
              ledger,
              { accountId, sendKey: `${runId}:${recipient.email as string}` },
              { mode: meterMode },
            );
            if (decision.outcome === 'refused') {
              // Counted as a failure so the shortfall appears in the result the
              // contractor is shown. Silently skipping would report a campaign
              // as fully sent when part of it never went.
              mayEmail = false;
              failed++;
            } else if (decision.outcome === 'allowed') {
              lease = decision.lease;
            } else if (decision.outcome === 'allowed_overage') {
              // Charged against the workspace's own overage cap rather than its
              // allowance. Nothing is held in the credit ledger, so the only
              // thing to undo is the accrual, if the send then fails.
              heldOverage = decision.overage;
            }
          }
          if (mayEmail) {
            try {
              await sendCampaignEmail({
                recipientEmail: recipient.email as string,
                businessName: input.businessName,
                subject: personalize(input.subject, recipient, referral),
                body: personalize(input.body, recipient, referral),
                accountId,
                mailingAddress: input.mailingAddress,
              });
              emailSent++;
              if (ledger && lease) await commitMarketingEmailUsage(ledger, lease);
            } catch (error) {
              failed++;
              console.error('Campaign email failed:', error instanceof Error ? error.message : error);
              if (ledger && lease) await releaseMarketingEmailUsage(ledger, lease, 'send_failed');
              if (ledger && heldOverage) {
                await releaseUsageOverage(ledger, { accountId, ...heldOverage });
              }
            }
          }
        }
        if (canSms) {
          try {
            await sendCampaignSms({
              phone: recipient.phone as string,
              businessName: input.businessName,
              body: personalize(input.body, recipient, referral),
              accountId,
              idempotencyKey: `campaign:${runId}:${recipient.id}:sms`,
            });
            smsQueued++;
          } catch (error) {
            failed++;
            console.error('Campaign SMS failed:', error instanceof Error ? error.message : error);
          }
        }
      }),
    );
  }

  const outcome = {
    email_sent: emailSent,
    // See initialRow: the physical name is retained for compatibility while
    // every producer/domain/UI surface calls this queue acceptance.
    sms_sent: smsQueued,
    failed_count: failed,
    skipped_count: skipped,
  };
  const { error: outcomeError } = await supabase
    .from('campaigns')
    .update(outcome)
    .eq('account_id', accountId)
    .eq('id', runId);
  if (outcomeError) {
    // Delivery intents already exist and must never be replayed merely because
    // a reporting projection failed. The zeroed pre-created row remains an
    // operator-visible reconciliation target.
    console.error(`Campaign ${runId} outcome projection failed:`, outcomeError.message);
  }

  return { recipientCount: targets.length, emailSent, smsQueued, failed, skipped };
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
