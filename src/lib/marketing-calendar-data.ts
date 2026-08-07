import type { SupabaseClient } from '@supabase/supabase-js';
import { getSiteContent } from '@/lib/site-content';
import {
  BEATS,
  climateZoneForState,
  planCalendar,
  stateFromAddress,
  type Channel,
  type ClimateZone,
  type PlannedBeat,
} from '@/lib/marketing-calendar';
import { loadRecipients, loadSentBeats, BEAT_DONE_DAYS } from '@/lib/campaigns';
import { matchesAudience, campaignAudienceForBeat } from '@/lib/campaign-audiences';

/**
 * The seasonal calendar, read for one account.
 *
 * MOVED OUT OF app/dashboard/marketing/actions.ts, which is a 'use server' file:
 * every export from one of those becomes a server action, so a plain helper
 * cannot live there and be called by anything but an action. The logged-out demo
 * needs exactly this function against fixture data, and marketingCalendarAction
 * cannot serve it — that one starts with requireOwnerContext and redirects to
 * /login. So the READ lives here, the action stays there and calls it.
 *
 * Same split as cash-forecast-data, milestones-data and selections-data: the
 * query is a library function, the action is a thin authenticated wrapper.
 */

export type CalendarView = {
  zone: ClimateZone;
  /** Null when we couldn't tell where they are — shown, not hidden. */
  state: string | null;
  trade: string | null;
  businessName: string;
  planned: {
    beatId: string;
    title: string;
    whyNow: string;
    monthName: string;
    channel: Channel;
    /** Every channel the topic supports, so the card offers each one. */
    channels: Channel[];
    audience: string;
    /** How many people the topic's audience actually reaches, when we can say. */
    reach: number | null;
    /** Set when this topic has been sent — ISO date and how many it went to. */
    sentAt: string | null;
    sentTo: number;
    /** Set when a blog post has already been drafted from this topic. */
    postedTitle: string | null;
    postedId: string | null;
  }[];
};

/**
 * The months ahead, for this trade in this climate.
 *
 * The zone is derived from the account's own mailing address. When that can't be
 * read the panel SAYS SO rather than quietly assuming four seasons — a
 * contractor in Phoenix being offered furnace content should be able to see why.
 */
export async function buildCalendarView(
  supabase: SupabaseClient,
  accountId: string,
  monthsAhead: number,
): Promise<CalendarView> {
  const [{ data: account }, { data: site }, recipients, sentBeats, { data: serviceRows }] = await Promise.all([
    supabase.from('accounts').select('business_name, mailing_address').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, content, service_area').eq('account_id', accountId).maybeSingle(),
    loadRecipients(supabase, accountId),
    loadSentBeats(supabase, accountId),
    // What they actually sell, so a beat from an adjacent trade has to be
    // earned rather than assumed — see Beat.needs in marketing-calendar.ts.
    supabase.from('services').select('name').eq('account_id', accountId).eq('active', true),
  ]);

  const content = getSiteContent(site?.content as Record<string, unknown> | null);
  const state = stateFromAddress((account?.mailing_address as string | null) ?? site?.service_area ?? null);
  const zone = climateZoneForState(state);
  const trade = content.trade.trim() || null;

  const planned: PlannedBeat[] = planCalendar({
    trade,
    zone,
    fromMonth: new Date().getMonth() + 1,
    monthsAhead,
    services: (serviceRows ?? []).map((row) => String((row as { name?: unknown }).name ?? '')),
  });

  // Which topics already have a post drafted on the website. Matched on the
  // beat id stored with the post, so renaming a post never loses the link.
  // The id comes along so the card can link to that exact post rather than to
  // the blog list, where finding it again is the owner's problem.
  const postedByBeat = new Map<string, { id: string; title: string }>();
  for (const post of content.blog.posts) {
    if (post.beatId && !postedByBeat.has(post.beatId)) postedByBeat.set(post.beatId, { id: post.id, title: post.title });
  }

  const now = Date.now();
  const doneCutoff = now - BEAT_DONE_DAYS * 24 * 60 * 60 * 1000;

  return {
    zone,
    state,
    trade,
    businessName: (site?.company_name as string) || (account?.business_name as string) || 'your business',
    planned: planned.map((entry) => {
      const campaignAudience = campaignAudienceForBeat(entry.beat.audience);
      const sent = sentBeats.get(entry.beat.id);
      // A send only marks the topic done for a while. These come round every
      // year, and a card struck through since last autumn would be wrong.
      const recentlySent = sent && new Date(sent.lastSentAt).getTime() >= doneCutoff ? sent : null;

      return {
        beatId: entry.beat.id,
        title: entry.beat.title,
        whyNow: entry.beat.whyNow,
        monthName: entry.monthName,
        channel: entry.channel,
        channels: entry.channels,
        audience: entry.beat.audience,
        reach: campaignAudience
          ? recipients.filter((recipient) => matchesAudience(recipient, campaignAudience, now) && recipient.emailReady).length
          : null,
        sentAt: recentlySent?.lastSentAt ?? null,
        sentTo: recentlySent?.recipientCount ?? 0,
        postedTitle: postedByBeat.get(entry.beat.id)?.title ?? null,
        postedId: postedByBeat.get(entry.beat.id)?.id ?? null,
      };
    }),
  };
}

// Re-exported so the one import BEATS was needed for keeps resolving for
// callers that used to get it via actions.ts.
export { BEATS };
