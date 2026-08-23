// Who a campaign goes to, and what a campaign is.
//
// Split out of campaigns.ts because that module reaches the database and the
// SMS sender, which transitively imports the Supabase server client — so any
// client component that wanted a single audience LABEL pulled server-only code
// into the browser bundle and failed the build. Nothing here touches a network
// or a database; it is safe on either side.

export type CampaignChannel = 'email' | 'sms' | 'both';
export type CampaignAudience = 'all' | 'past' | 'repeat' | 'lapsed';

// A customer with no job in this many days is "lapsed" — the segment worth a
// "we're booking again / here's an offer" nudge.
export const LAPSED_DAYS = 120;
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
  /** Legacy storage name. This is SMS queue acceptance, not carrier sent. */
  sms_sent: number;
  failed_count: number;
  skipped_count: number;
  /**
   * The seasonal topic this came from, when it came from one. Optional on the
   * type as well as nullable in the table: a database that hasn't had the
   * migration yet returns rows without the key at all.
   */
  beat_id?: string | null;
  created_at: string;
};

export const AUDIENCE_DEFS: { id: CampaignAudience; label: string; hint: string }[] = [
  { id: 'past', label: 'Past customers', hint: 'Everyone who booked at least one job' },
  { id: 'repeat', label: 'Repeat customers', hint: 'Two or more jobs — your best fans' },
  { id: 'lapsed', label: 'Lapsed customers', hint: `Booked before, but nothing in ${LAPSED_DAYS}+ days` },
  { id: 'all', label: 'Everyone', hint: 'Every client in your list' },
];

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

/**
 * Beat audiences and campaign audiences are different vocabularies, and only
 * two of the three translate.
 *
 * 'maintenance-due' has NO equivalent: nothing in this product tracks when a
 * customer's service is next due. Mapping it to "past customers" would put a
 * confident, wrong number next to the one topic that actually earns money, so
 * it maps to null and the card says plainly that we can't count it yet.
 */
export function campaignAudienceForBeat(audience: string): CampaignAudience | null {
  if (audience === 'everyone') return 'all';
  if (audience === 'past-service') return 'past';
  return null;
}
