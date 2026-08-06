import type { SupabaseClient } from '@supabase/supabase-js';
import { getSiteContent } from '@/lib/site-content';
import { BEATS, climateZoneForState, stateFromAddress, type Channel } from '@/lib/marketing-calendar';
import { draftMarketing, type MarketingDraft } from '@/lib/marketing-draft';
import type { CampaignChannel } from '@/lib/campaign-audiences';

/**
 * Assemble the context and draft one beat.
 *
 * Shared by the calendar page and the campaign composer's handoff, so the two
 * cannot drift into producing different messages for the same topic.
 */
export async function draftMarketingForAccount(
  supabase: SupabaseClient,
  accountId: string,
  beatId: string,
  channel: Channel,
): Promise<MarketingDraft | null> {
  const beat = BEATS.find((entry) => entry.id === beatId);
  if (!beat) return null;

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name, mailing_address').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, content, service_area').eq('account_id', accountId).maybeSingle(),
  ]);

  const content = getSiteContent(site?.content as Record<string, unknown> | null);
  const zone = climateZoneForState(stateFromAddress((account?.mailing_address as string | null) ?? site?.service_area ?? null));

  return draftMarketing({
    beat,
    channel,
    businessName: site?.company_name || account?.business_name || 'your business',
    trade: content.trade.trim() || null,
    zone,
    monthName: new Date().toLocaleString('en-US', { month: 'long' }),
    year: new Date().getFullYear(),
    serviceArea: (site?.service_area as string | null) ?? null,
  });
}

/** The draft shape the campaign composer takes. */
export type CampaignDraft = {
  // Widened from a fixed 'email' so a template starter (e.g. "Fill Next Week's
  // Schedule") can hand over 'both' or 'sms' — the AI beat drafter below still
  // only ever produces 'email', for the TCPA reason on campaignDraftForBeat.
  channel: CampaignChannel;
  audience: string;
  subject: string;
  /** Alternatives to choose between. Never measured — we don't track opens. */
  subjectOptions: string[];
  body: string;
  /** So a send can be recorded against the topic it came from. */
  beatId: string;
  /** Which template card produced this draft, shown in the composer banner. */
  templateName?: string;
  /** One-line "why this" shown alongside templateName. */
  templateExplanation?: string;
  /** Static display-only suggestion (e.g. "Tuesday mornings tend to open best") — not scheduling. */
  sendTimeHint?: string;
};

/**
 * A marketing beat, ready to drop into the composer.
 *
 * Email only. A marketing text needs its own written opt-in under the TCPA and
 * this app's consent ledger doesn't record one, so handing a marketing message
 * to the SMS channel would be building on consent nobody gave.
 *
 * Audience is left as 'all' for the person to change. Guessing who should
 * receive a message is the one decision here with real consequences, and it is
 * not one to make on somebody's behalf from a query parameter.
 */
export async function campaignDraftForBeat(
  supabase: SupabaseClient,
  accountId: string,
  beatId: string,
): Promise<CampaignDraft | undefined> {
  const draft = await draftMarketingForAccount(supabase, accountId, beatId, 'email');
  if (!draft) return undefined;
  return {
    channel: 'email',
    audience: 'all',
    subject: draft.subject,
    subjectOptions: draft.subjectOptions,
    body: [...draft.body, draft.callToAction].filter(Boolean).join('\n\n'),
    beatId,
  };
}
