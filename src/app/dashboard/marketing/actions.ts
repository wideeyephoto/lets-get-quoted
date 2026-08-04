'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext, createAdminClient } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSiteContent, mergeSiteContent, slugifyBlogTitle } from '@/lib/site-content';
import { draftBlogPost } from '@/lib/blog-generate';
import { pickBlogCover } from '@/app/dashboard/sites/actions';
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
import { campaignDraftForBeat, type CampaignDraft } from '@/lib/marketing-draft-data';
import { sendCampaign, loadRecipients, loadSentBeats, BEAT_DONE_DAYS } from '@/lib/campaigns';
import { matchesAudience } from '@/lib/campaign-audiences';
import { campaignAudienceForBeat, type CampaignAudience, type CampaignChannel } from '@/lib/campaign-audiences';

import { sendCampaignEmail, renderCampaignEmailHtml } from '@/lib/email';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import type { CampaignFinding } from '@/lib/campaign-guard';
import { readCampaign } from '@/lib/campaign-guard-ai';

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
  }[];
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
  return buildCalendarView(supabase, accountId, monthsAhead);
}

type Supa = Awaited<ReturnType<typeof requireOwnerContext>>['supabase'];

async function buildCalendarView(supabase: Supa, accountId: string, monthsAhead: number): Promise<CalendarView> {
  const [{ data: account }, { data: site }, recipients, sentBeats] = await Promise.all([
    supabase.from('accounts').select('business_name, mailing_address').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, content, service_area').eq('account_id', accountId).maybeSingle(),
    loadRecipients(supabase, accountId),
    loadSentBeats(supabase, accountId),
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

  // Which topics already have a post drafted on the website. Matched on the
  // beat id stored with the post, so renaming a post never loses the link.
  const postedByBeat = new Map<string, string>();
  for (const post of content.blog.posts) {
    if (post.beatId && !postedByBeat.has(post.beatId)) postedByBeat.set(post.beatId, post.title);
  }

  const now = Date.now();
  const doneCutoff = now - BEAT_DONE_DAYS * 24 * 60 * 60 * 1000;

  return {
    zone,
    state,
    trade,
    businessName: site?.company_name || account?.business_name || 'your business',
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
        postedTitle: postedByBeat.get(entry.beat.id) ?? null,
      };
    }),
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

/**
 * Hand a topic to the composer.
 *
 * Called when the contractor hasn't drafted the topic yet — when they have, the
 * text they already read is passed straight across in the browser rather than
 * being written again. Re-drafting on the way to the composer would put
 * DIFFERENT words in the box from the ones they just approved, which is worse
 * than not offering the button.
 */
export async function campaignDraftForBeatAction(beatId: string): Promise<CampaignDraft | null> {
  const { supabase, accountId } = await requireOwnerContext();
  if (!(await checkRateLimit(createAdminClient(), `marketing-draft:${accountId}`, 40, 3600))) return null;
  return (await campaignDraftForBeat(supabase, accountId, beatId)) ?? null;
}

/**
 * Draft a blog post from a seasonal topic and save it to the website.
 *
 * It hands the TOPIC over, not the text: the beat drafter writes three short
 * paragraphs shaped like an email, and a page on their website wants six
 * hundred words with an excerpt and a cover photo. Reusing the email draft
 * would put a two-line note on their site and call it a post.
 *
 * Saved as status:'draft'. Nothing becomes public until the owner publishes it
 * in the builder, which is also where they can edit it.
 */
export async function createBlogPostFromBeatAction(
  beatId: string,
): Promise<{ ok: true; title: string } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOwnerContext();

  const beat = BEATS.find((entry) => entry.id === beatId);
  if (!beat) return { ok: false, message: 'That topic could not be found.' };
  if (!beat.channels.includes('blog')) {
    return { ok: false, message: 'That topic is written as an email, not a post.' };
  }
  if (!(await checkRateLimit(createAdminClient(), `blog-draft:${accountId}`, 20, 3600))) {
    return { ok: false, message: 'That is a lot of posts in an hour — give it a few minutes.' };
  }

  const { data: site } = await supabase
    .from('sites')
    .select('id, company_name, service_area, content')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) {
    return { ok: false, message: 'You need a website before you can post to it. Set one up under Website.' };
  }

  let draft;
  try {
    draft = await draftBlogPost({
      companyName: (site.company_name as string) || '',
      serviceArea: (site.service_area as string) || '',
      // The title is the topic; whyNow is the angle that makes it worth reading
      // this month rather than in general.
      topic: `${beat.title}. ${beat.whyNow}`.slice(0, 400),
    });
  } catch (error) {
    console.error('Blog post from beat failed:', error);
    return { ok: false, message: 'Could not write that post just now. Please try again.' };
  }

  const coverImage = await pickBlogCover(beat.title);

  // Read-modify-write, immediately before the update so the window is as small
  // as it can be. It cannot be closed entirely: the website builder holds the
  // whole content object in the browser, so a builder tab left open with unsaved
  // edits will overwrite this on its next save. Nothing server-side can prevent
  // that, which is why the success message sends them straight to the builder.
  const content = getSiteContent(site.content as Record<string, unknown> | null);
  const slugBase = slugifyBlogTitle(draft.title) || 'post';
  const existing = new Set(content.blog.posts.map((post) => post.slug));
  let slug = slugBase;
  let suffix = 2;
  while (existing.has(slug)) slug = `${slugBase}-${suffix++}`;

  const post = {
    // Same shape the biweekly cron uses — the builder's own id helper is local
    // to that component and not worth exporting for one caller.
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slug,
    title: draft.title,
    excerpt: draft.excerpt,
    body: draft.body,
    coverImage: coverImage || '',
    status: 'draft' as const,
    date: new Date().toISOString().slice(0, 10),
    publishAt: '',
    // What links the post back to the calendar card. Stored on the post rather
    // than matched on the title, so renaming it doesn't break the link.
    beatId: beat.id,
  };

  const { error } = await supabase
    .from('sites')
    .update({
      // mergeSiteContent preserves keys it doesn't know about, so an empty
      // object is the correct base for a site whose content is still null.
      content: mergeSiteContent((site.content as Record<string, unknown> | null) ?? {}, {
        blog: { ...content.blog, enabled: true, posts: [post, ...content.blog.posts] },
      }),
    })
    .eq('id', site.id);

  if (error) {
    console.error('Saving blog post from beat failed:', error.message);
    return { ok: false, message: 'The post was written but could not be saved. Please try again.' };
  }

  revalidatePath('/dashboard/sites');
  revalidatePath('/dashboard/marketing');
  return { ok: true, title: draft.title };
}

// ---------------------------------------------------------------------------
// Sending. Moved here wholesale when the calendar and the composer became one
// page — a topic and the send it turns into were never two destinations.
// ---------------------------------------------------------------------------

const CHANNELS: CampaignChannel[] = ['email', 'sms', 'both'];
const AUDIENCES: CampaignAudience[] = ['all', 'past', 'repeat', 'lapsed'];

// Resolve the sender identity shown in marketing email: the display name and the
// CAN-SPAM physical mailing address (contractor's own, else platform fallback).
async function resolveSenderIdentity(
  supabase: Supa,
  accountId: string,
): Promise<{ businessName: string; mailingAddress: string | null }> {
  const [{ data: account }, { data: site }] = await Promise.all([
    // Defensive select: mailing_address may not exist on an un-migrated DB, so
    // read it in its own query that can degrade instead of failing the action.
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const { data: addressRow } = await supabase.from('accounts').select('mailing_address').eq('id', accountId).maybeSingle();
  return {
    businessName: site?.company_name || account?.business_name || "Let's Get Quoted contractor",
    mailingAddress: resolveMarketingMailingAddress(addressRow?.mailing_address as string | null),
  };
}

export async function sendCampaignAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const channel = String(formData.get('channel') ?? '') as CampaignChannel;
  const audience = String(formData.get('audience') ?? '') as CampaignAudience;
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  // Only ever a topic id we recognise. It comes from the browser, and an
  // unchecked value here would write arbitrary text into the send history.
  const beatRaw = String(formData.get('beatId') ?? '').trim();
  const beatId = BEATS.some((beat) => beat.id === beatRaw) ? beatRaw : null;

  if (!CHANNELS.includes(channel)) throw new Error('Pick how you want to reach people.');
  if (!AUDIENCES.includes(audience)) throw new Error('Pick who this goes to.');
  if (!body) throw new Error('Write a message before sending.');
  if ((channel === 'email' || channel === 'both') && !subject) {
    throw new Error('Add a subject line for the email.');
  }

  const { businessName, mailingAddress } = await resolveSenderIdentity(supabase, accountId);
  // CAN-SPAM: a marketing email must carry a physical postal address. Block the
  // email broadcast until one is on file (their own, or a platform fallback).
  if ((channel === 'email' || channel === 'both') && !mailingAddress) {
    throw new Error('Add your business mailing address in Settings before sending marketing emails — it’s required by anti-spam law.');
  }
  const result = await sendCampaign(supabase, accountId, { channel, audience, subject, body, businessName, mailingAddress, beatId });

  revalidatePath('/dashboard/marketing');
  const params = new URLSearchParams({
    sent: String(result.emailSent + result.smsSent),
    recipients: String(result.recipientCount),
    skipped: String(result.skipped),
    failed: String(result.failed),
  });
  redirect(`/dashboard/marketing?${params.toString()}`);
}

// Send just the email version to the owner's own inbox so they can eyeball it
// before broadcasting. No audience, no SMS — a preview, not a send.
export async function sendTestEmailAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const subject = String(formData.get('subject') ?? '').trim() || 'Test message';
  const body = String(formData.get('body') ?? '').trim();
  if (!body) throw new Error('Write a message first.');

  const { data: userData } = await supabase.auth.getUser();
  const to = userData.user?.email;
  if (!to) throw new Error('No email on file to send a test to.');

  const { businessName, mailingAddress } = await resolveSenderIdentity(supabase, accountId);
  await sendCampaignEmail({ recipientEmail: to, businessName, subject: `[Test] ${subject}`, body, accountId, mailingAddress });

  revalidatePath('/dashboard/marketing');
  redirect('/dashboard/marketing?test=1');
}

/**
 * What the email will actually look like.
 *
 * Rendered with the same function the send path uses, against the owner's own
 * address so the unsubscribe link in the preview is a real one for them. A
 * preview assembled from its own markup can be right while the email is wrong,
 * and the parts nobody would think to reproduce — the unsubscribe link, the
 * postal address — are the parts that make the send lawful.
 */
export async function previewCampaignEmailAction(subject: string, body: string): Promise<string> {
  const { supabase, accountId } = await requireOwnerContext();
  const trimmed = body.trim();
  if (!trimmed) return '';

  const { data: userData } = await supabase.auth.getUser();
  const { businessName, mailingAddress } = await resolveSenderIdentity(supabase, accountId);
  return renderCampaignEmailHtml({
    recipientEmail: userData.user?.email || 'you@example.com',
    businessName,
    subject: subject.trim() || '(no subject)',
    body: trimmed,
    accountId,
    mailingAddress,
  });
}

/**
 * The read half of Campaign Guard.
 *
 * The deterministic checks run in the browser on every keystroke — they are a
 * pure function and need no server. This is only the part that has to ask, and
 * it is rate-limited because it is the one thing here that costs money per use.
 */
export async function readCampaignAction(input: {
  channel: 'email' | 'sms' | 'both';
  subject: string;
  body: string;
}): Promise<CampaignFinding[]> {
  const { supabase, accountId } = await requireOwnerContext();
  if (!(await checkRateLimit(createAdminClient(), `campaign-guard:${accountId}`, 30, 3600))) return [];

  const { data: site } = await supabase.from('sites').select('content').eq('account_id', accountId).maybeSingle();
  const trade = getSiteContent(site?.content as Record<string, unknown> | null).trade.trim() || null;

  return readCampaign({
    trade,
    channel: input.channel,
    subject: String(input.subject ?? '').slice(0, 500),
    body: String(input.body ?? '').slice(0, 8000),
    monthName: new Date().toLocaleString('en-US', { month: 'long' }),
  });
}

// checkCampaign() and rankFindings() are NOT re-exported here. A 'use server'
// module may only export async functions, and both are pure — the composer
// imports them straight from @/lib/campaign-guard and runs them in the browser,
// which is the point: the cheap checks appear while you type, not after a round
// trip.
