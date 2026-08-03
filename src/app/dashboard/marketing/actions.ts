'use server';

import { requireOwnerContext, createAdminClient } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
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
import { draftMarketing, type MarketingDraft } from '@/lib/marketing-draft';

export type CalendarView = {
  zone: ClimateZone;
  /** Null when we couldn't tell where they are — shown, not hidden. */
  state: string | null;
  trade: string | null;
  businessName: string;
  planned: { beatId: string; title: string; whyNow: string; monthName: string; channel: Channel; audience: string }[];
};

/**
 * The months ahead, for this trade in this climate.
 *
 * The zone is derived from the account's own mailing address. When that can't be
 * read the panel SAYS SO rather than quietly assuming four seasons — a
 * contractor in Phoenix being offered furnace content should be able to see why.
 */
export async function marketingCalendarAction(monthsAhead = 3): Promise<CalendarView> {
  const { supabase, accountId } = await requireOwnerContext();

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name, mailing_address').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, content, service_area').eq('account_id', accountId).maybeSingle(),
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
  });

  return {
    zone,
    state,
    trade,
    businessName: site?.company_name || account?.business_name || 'your business',
    planned: planned.map((entry) => ({
      beatId: entry.beat.id,
      title: entry.beat.title,
      whyNow: entry.beat.whyNow,
      monthName: entry.monthName,
      channel: entry.channel,
      audience: entry.beat.audience,
    })),
  };
}

/**
 * Write one beat. Drafts only — nothing is saved, scheduled or sent.
 *
 * The contractor reads it, changes it, and hands it to the blog editor or the
 * campaign sender, both of which already have their own consent, unsubscribe and
 * postal-address rules. Those are not this function's business and it does not
 * try to shortcut them.
 */
export async function draftMarketingAction(
  beatId: string,
  channel: Channel,
): Promise<{ ok: true; draft: MarketingDraft } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  if (!(await checkRateLimit(createAdminClient(), `marketing-draft:${accountId}`, 40, 3600))) {
    return { ok: false, message: 'That is a lot of drafts in an hour — give it a few minutes.' };
  }

  const beat = BEATS.find((entry) => entry.id === beatId);
  if (!beat) return { ok: false, message: 'That topic could not be found.' };

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name, mailing_address').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, content, service_area').eq('account_id', accountId).maybeSingle(),
  ]);
  const content = getSiteContent(site?.content as Record<string, unknown> | null);
  const zone = climateZoneForState(stateFromAddress((account?.mailing_address as string | null) ?? site?.service_area ?? null));

  const draft = await draftMarketing({
    beat,
    channel,
    businessName: site?.company_name || account?.business_name || 'your business',
    trade: content.trade.trim() || null,
    zone,
    monthName: new Date().toLocaleString('en-US', { month: 'long' }),
    year: new Date().getFullYear(),
    serviceArea: (site?.service_area as string | null) ?? null,
  });

  if (!draft) {
    return {
      ok: false,
      // Two genuinely different causes, and the contractor can act on the second.
      message: 'Could not draft that just now — either the writer is unavailable, or what came back read like junk mail and was thrown out. Try again.',
    };
  }
  return { ok: true, draft };
}
