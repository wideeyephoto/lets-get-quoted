import { normalizeUsPhone } from '@/lib/phone';

/**
 * What the owner owes, derived rather than stored.
 *
 * There is no referrals table. Every fact this list needs is already on the
 * lead: who sent them (triage.referredBy, verified at intake), whether the work
 * was won (leads.status), and whether they have been thanked
 * (leads.referral_settled_at). So the queue is a reduce over rows the leads
 * board already loads in full — no join, no ledger, no index, no N+1.
 *
 * Pure on purpose: no Supabase import, no clock, no environment. The page reads
 * the rows, this decides what they mean, and the test can hand it plain objects.
 */

export type ReferralStage = 'introduced' | 'booked' | 'thanked';

/**
 * Which table a referred request came from.
 *
 * Two rails reach a contractor from a referral link and they are stored in
 * different places: an ordinary booking becomes a lead, and a Quick Stop
 * becomes an extra_stop_requests row that never becomes a lead at all. Both are
 * revenue, so both belong in this queue — but settling has to stamp the right
 * table, so each row remembers where it came from.
 */
export type ReferralSource = 'lead' | 'quick_stop';

/**
 * A Quick Stop's own status vocabulary, mapped onto the referral lifecycle.
 *
 * Money changes hands when the customer pays the offer, which is what moves a
 * request to 'confirmed' — so that, and everything downstream of it, is won.
 * A refund undoes it. The in-between states are still live negotiations and
 * owe nobody anything yet.
 */
export function quickStopReferralStatus(status: string): 'won' | 'lost' | 'open' {
  if (['confirmed', 'en_route', 'arrived', 'completed'].includes(status)) return 'won';
  if (
    [
      'contractor_declined',
      'offer_expired',
      'customer_declined',
      'customer_canceled',
      'contractor_canceled',
      'no_show_confirmed',
      'refunded',
    ].includes(status)
  ) {
    return 'lost';
  }
  return 'open';
}

/**
 * The minimum a caller must supply. A subset of Lead, so a real row fits.
 *
 * `status` is the CALLER's job to normalise: it must already be one of the lead
 * vocabulary's 'won' / 'lost' / anything-else, so a Quick Stop is passed through
 * quickStopReferralStatus above before it gets here. That keeps this module
 * knowing one lifecycle rather than two.
 */
export type ReferralQueueLead = {
  id: string;
  /** Defaults to 'lead' — the rail that existed first. */
  source?: ReferralSource;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  client_id: string | null;
  created_at: string;
  referral_settled_at?: string | null;
};

export type ReferralRow = {
  /**
   * Every lead this one referred person filed.
   *
   * A list rather than an id because settling has to stamp all of them at once:
   * a homeowner who asks twice is one debt, and marking one lead thanked while
   * the other still reads "owed" is how somebody gets paid twice.
   */
  leadIds: string[];
  /** extra_stop_requests ids in the same group. Settling stamps both tables. */
  stopIds: string[];
  referrerClientId: string;
  referrerName: string;
  referredName: string;
  stage: ReferralStage;
  /** When they first got in touch. */
  introducedAt: string;
  settledAt: string | null;
};

export type ReferralQueue = {
  /** Won the work, nobody has been thanked yet. This is the list that matters. */
  owed: ReferralRow[];
  /** Introduced, not booked yet. Nothing is owed — it is here so the owner can
   *  see the referral arrived at all, which is most of what makes them keep asking. */
  waiting: ReferralRow[];
  thanked: ReferralRow[];
};

/**
 * Every handle that might identify this person — not just the best one.
 *
 * IT USED TO RETURN ONLY THE FIRST, and that quietly created double debts. Two
 * leads collapse only if the same signal is first on both, and the premise that
 * client_id is always there is false twice over: findOrCreateClientId looks up
 * by phone only when a phone was supplied and by email only when an email was,
 * with no cross-match, so a phone-only lead and an email-only lead from the same
 * person become two client rows; and createLead's client link is best-effort and
 * swallowed, so a lead whose link failed keeps client_id null while its sibling
 * has one. Either way the same referrer appeared twice for the same person, and
 * settling one did not settle the other.
 */
function signalsOf(lead: ReferralQueueLead): string[] {
  const out: string[] = [];
  if (lead.client_id) out.push(`client:${lead.client_id}`);
  const phone = lead.phone ? normalizeUsPhone(lead.phone) : null;
  if (phone) out.push(`phone:${phone}`);
  const email = lead.email?.trim().toLowerCase();
  if (email) out.push(`email:${email}`);
  return out;
}

/**
 * Leads that share ANY signal are one person; leads that share none are not.
 *
 * A lead carrying no signal at all stays in a group of its own — an anonymous
 * enquiry is its own person, never the same person as every other anonymous one.
 */
function groupByPerson(leads: ReferralQueueLead[]): ReferralQueueLead[][] {
  const parent = leads.map((_, index) => index);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const firstSeen = new Map<string, number>();
  leads.forEach((lead, index) => {
    for (const signal of signalsOf(lead)) {
      const prior = firstSeen.get(signal);
      if (prior === undefined) firstSeen.set(signal, index);
      else union(index, prior);
    }
  });

  const buckets = new Map<number, ReferralQueueLead[]>();
  leads.forEach((lead, index) => {
    const root = find(index);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(lead);
    else buckets.set(root, [lead]);
  });
  return [...buckets.values()];
}

/**
 * `leads` should already be filtered to referred ones; `referrerOf` supplies the
 * verified referrer for each (from triage.referredBy), and `nameOf` resolves a
 * client id to a display name.
 */
export function buildReferralQueue(
  leads: ReferralQueueLead[],
  referrerOf: (lead: ReferralQueueLead) => string | null,
  nameOf: (clientId: string) => string | null,
): ReferralQueue {
  // Grouped by referrer FIRST. The same person arriving twice through two
  // different friends is two referrals, and only one of them can be first.
  const byReferrer = new Map<string, ReferralQueueLead[]>();
  for (const lead of leads) {
    const referrer = referrerOf(lead);
    if (!referrer) continue;
    // NOBODY REFERS THEMSELVES. Every recipient of a referral campaign is sent
    // their own link, so the cheapest way to fake a reward is to click it and
    // book. The dedupe at intake is what makes this catchable: findOrCreateClientId
    // matches the booking back to the same client row the code was minted for.
    if (lead.client_id && lead.client_id === referrer) continue;
    const bucket = byReferrer.get(referrer);
    if (bucket) bucket.push(lead);
    else byReferrer.set(referrer, [lead]);
  }

  const rows: ReferralRow[] = [];
  for (const [referrerClientId, theirLeads] of byReferrer) {
    for (const bucket of groupByPerson(theirLeads)) {
      const ordered = [...bucket].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const settled = ordered.map((lead) => lead.referral_settled_at ?? null).filter((at): at is string => Boolean(at));
      // Won by ANY of this person's leads: they asked twice, one turned into
      // work, and the referrer earned it regardless of which inquiry it came from.
      const booked = ordered.some((lead) => lead.status === 'won');
      // Every inquiry went nowhere. Not owed, and not pending either — leaving
      // it under "introduced, not booked yet" makes a dead referral look like a
      // live one forever.
      const closed = ordered.every((lead) => lead.status === 'lost');
      if (!booked && closed && settled.length === 0) continue;

      rows.push({
        leadIds: ordered.filter((lead) => (lead.source ?? 'lead') === 'lead').map((lead) => lead.id),
        stopIds: ordered.filter((lead) => lead.source === 'quick_stop').map((lead) => lead.id),
        referrerClientId,
        // A referrer whose client row was merged away or deleted is still a real
        // debt — the name is what is missing, not the obligation.
        referrerName: nameOf(referrerClientId) || 'A past customer',
        referredName: ordered.find((lead) => lead.name)?.name || 'Someone they sent',
        stage: settled.length > 0 ? 'thanked' : booked ? 'booked' : 'introduced',
        introducedAt: ordered[0].created_at,
        // The earliest stamp: a group settled in one shot shares one timestamp,
        // and if they differ the first one is when the debt was actually paid.
        settledAt: settled.slice().sort()[0] ?? null,
      });
    }
  }

  // Oldest first in the two live lists: the debt you have been sitting on
  // longest is the one worth surfacing. Thanked reads newest-first, because
  // that one is a receipt, not a to-do.
  const byOldest = (a: ReferralRow, b: ReferralRow) => a.introducedAt.localeCompare(b.introducedAt);
  return {
    owed: rows.filter((row) => row.stage === 'booked').sort(byOldest),
    waiting: rows.filter((row) => row.stage === 'introduced').sort(byOldest),
    thanked: rows.filter((row) => row.stage === 'thanked').sort((a, b) => b.introducedAt.localeCompare(a.introducedAt)),
  };
}
