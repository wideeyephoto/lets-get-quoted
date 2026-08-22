// Turns real account data into the "Recommended for You" picks and the
// browsable template rails on the campaigns page. This is the only place that
// decides WHICH of the 11 campaign-templates.ts starters to lead with and WHY
// — everything it reads comes from data the account already has (bookings,
// quotes, recurring plans, reviews, services, the seasonal calendar), so a
// card's count and "why recommended" text are always real or absent, never a
// guess dressed up as one.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAvailableBookingDays } from '@/lib/booking';
import { listServices, mostRecentServiceAgeDays } from '@/lib/services';
import { countCompletedJobsAwaitingReview } from '@/lib/reviews';
import { googleReviewUrl } from '@/lib/review-routing';
import { getSiteContent } from '@/lib/site-content';
import { planCalendar, climateZoneForState, stateFromAddress, type PlannedBeat } from '@/lib/marketing-calendar';
import {
  matchesAudience,
  campaignAudienceForBeat,
  LAPSED_DAYS,
  AUDIENCE_DEFS,
  type CampaignAudience,
  type CampaignChannel,
} from '@/lib/campaign-audiences';
import type { CampaignRecipient, Reach } from '@/lib/campaigns';
import type { CampaignDraft } from '@/lib/marketing-draft-data';
import {
  TEMPLATES,
  buildFillScheduleCopy,
  buildReconnectCopy,
  buildWeMissYouCopy,
  buildRewardRepeatCopy,
  buildRequestReviewsCopy,
  buildFollowUpQuotesCopy,
  buildSeasonalCopy,
  buildMaintenanceReminderCopy,
  buildAnnounceServiceCopy,
  buildReferralCopy,
  type TemplateId,
  type TemplateCategory,
  type TemplateMeta,
} from '@/lib/campaign-templates';

const DAY = 24 * 60 * 60 * 1000;

export type TemplateCard = {
  id: TemplateId;
  title: string;
  category: TemplateCategory | null;
  icon: TemplateId;
  oneLiner: string;
  audienceLabel: string;
  channelLabel: string;
  /** null = "can't count this yet" — never fabricated. */
  recipientCount: number | null;
  /** Real supporting fact only, else null. Always null when disabledReason is set. */
  whyText: string | null;
  sendTimeHint: string | null;
  /** Non-null => card renders disabled with this text instead of being hidden. */
  disabledReason: string | null;
  /** null iff disabledReason != null. */
  draft: CampaignDraft | null;
};

export type CampaignRecommendations = {
  recommended: TemplateCard[]; // <=3
  quickWins: TemplateCard[];
  seasonal: TemplateCard[]; // one instance per in-window, email-capable beat
  grow: TemplateCard[];
  all: TemplateCard[]; // all 11 in fixed catalog order, for "View all templates"
};

const AUDIENCE_LABEL = Object.fromEntries(AUDIENCE_DEFS.map((def) => [def.id, def.label])) as Record<CampaignAudience, string>;
const CHANNEL_LABEL: Record<CampaignChannel, string> = { email: 'Email', sms: 'Text', both: 'Email + text' };

function pluralPhrase(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function channelCount(reach: Record<CampaignAudience, Reach>, audience: CampaignAudience, channel: CampaignChannel): number {
  const bucket = reach[audience];
  if (channel === 'email') return bucket.email;
  if (channel === 'sms') return bucket.sms;
  return bucket.either;
}

function templateById(id: TemplateId): TemplateMeta {
  const meta = TEMPLATES.find((entry) => entry.id === id);
  if (!meta) throw new Error(`Unknown campaign template: ${id}`);
  return meta;
}

function buildCard(
  meta: TemplateMeta,
  opts: { recipientCount: number | null; whyText: string | null; disabledReason: string | null; draft: CampaignDraft | null },
): TemplateCard {
  const disabledReason = opts.disabledReason;
  return {
    id: meta.id,
    title: meta.title,
    category: meta.category,
    icon: meta.icon,
    oneLiner: meta.oneLiner,
    audienceLabel: AUDIENCE_LABEL[meta.defaultAudience],
    channelLabel: CHANNEL_LABEL[meta.defaultChannel],
    recipientCount: opts.recipientCount,
    whyText: disabledReason ? null : opts.whyText,
    sendTimeHint: meta.sendTimeHint,
    disabledReason,
    draft: disabledReason ? null : opts.draft,
  };
}

// Open quotes and completed-jobs-ever in one lightweight query. The open-quote
// predicate mirrors src/lib/insights.ts's OpenQuote filter exactly
// (status === 'new_lead' && Number(quoted_amount) > 0) — this is a standalone
// count, not a run of the whole buildInsights() pipeline.
async function loadJobSignals(supabase: SupabaseClient, accountId: string): Promise<{ openQuoteCount: number; completedCount: number }> {
  const { data, error } = await supabase.from('jobs').select('status, quoted_amount').eq('account_id', accountId);
  if (error || !data) return { openQuoteCount: 0, completedCount: 0 };
  const openQuoteCount = data.filter((job) => job.status === 'new_lead' && Number(job.quoted_amount) > 0).length;
  const completedCount = data.filter((job) => job.status === 'complete').length;
  return { openQuoteCount, completedCount };
}

// Active recurring plans, and how many of those are due in the next 14 days —
// the `recurring_plans_due_idx (account_id, active, next_run_date)` index
// makes this cheap even without a head-count query.
async function loadRecurringPlanSignal(supabase: SupabaseClient, accountId: string): Promise<{ activeCount: number; dueSoonCount: number }> {
  const cutoff = new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10);
  const { data, error } = await supabase.from('recurring_plans').select('next_run_date').eq('account_id', accountId).eq('active', true);
  if (error || !data) return { activeCount: 0, dueSoonCount: 0 };
  const dueSoonCount = data.filter((row) => typeof row.next_run_date === 'string' && row.next_run_date <= cutoff).length;
  return { activeCount: data.length, dueSoonCount };
}

export async function buildCampaignRecommendations(
  supabase: SupabaseClient,
  accountId: string,
  input: {
    recipients: CampaignRecipient[];
    reach: Record<CampaignAudience, Reach>;
    businessName: string;
    bookingUrl: string | null;
    /** The owner's referral thank-you, when they have set one. Its presence is
     *  what turns the referral template into a tracked, per-customer send. */
    referralReward?: string | null;
  },
): Promise<CampaignRecommendations> {
  const { recipients, reach, businessName, bookingUrl, referralReward } = input;
  const now = Date.now();
  const nowDate = new Date();
  const currentMonth = nowDate.getMonth() + 1;

  const [bookingDays, jobSignals, recurringSignal, awaitingReviewCount, services, siteRow, accountRow] = await Promise.all([
    bookingUrl ? getAvailableBookingDays(supabase, accountId) : Promise.resolve([]),
    loadJobSignals(supabase, accountId),
    loadRecurringPlanSignal(supabase, accountId),
    countCompletedJobsAwaitingReview(supabase, accountId),
    listServices(supabase, accountId),
    supabase
      .from('sites')
      .select('content, service_area')
      .eq('account_id', accountId)
      .maybeSingle()
      .then((r) => r.data as { content: Record<string, unknown> | null; service_area: string | null } | null),
    supabase
      .from('accounts')
      .select('mailing_address')
      .eq('id', accountId)
      .maybeSingle()
      .then((r) => r.data as { mailing_address: string | null } | null),
  ]);

  const sevenDaysOut = new Date(now + 7 * DAY).toISOString().slice(0, 10);
  const openSlotCount = bookingDays.filter((day) => day.dateKey <= sevenDaysOut).reduce((sum, day) => sum + day.slots.length, 0);
  const { openQuoteCount, completedCount } = jobSignals;
  const { activeCount: activePlanCount, dueSoonCount } = recurringSignal;

  const content = getSiteContent(siteRow?.content ?? null);
  const trade = content.trade.trim() || null;
  const zone = climateZoneForState(stateFromAddress(accountRow?.mailing_address ?? siteRow?.service_area ?? null));
  const reviewUrl = googleReviewUrl({ placeId: content.testimonials.googlePlaceId, listingUrl: content.testimonials.googleUrl });

  // Reconnect / We Miss You both live in the same 'lapsed' bucket; only one of
  // them is ever the "scored" representative, decided by how long the most
  // overdue lapsed customer has actually been gone (double the lapsed
  // threshold = "we miss you" territory rather than "reconnect" territory).
  const lapsedRecipients = recipients.filter((recipient) => matchesAudience(recipient, 'lapsed', now));
  const daysSinceLastJob = lapsedRecipients.map((recipient) =>
    recipient.lastJobAt ? Math.floor((now - new Date(recipient.lastJobAt).getTime()) / DAY) : Infinity,
  );
  const maxDaysSinceLastJob = daysSinceLastJob.length > 0 ? Math.max(...daysSinceLastJob) : 0;
  const weMissYouIsRepresentative = maxDaysSinceLastJob >= LAPSED_DAYS * 2;

  // -- Quick Wins --------------------------------------------------------

  const fillNextWeekMeta = templateById('fill-next-week');
  const fillNextWeekDisabled = bookingUrl ? null : 'Available after your booking page is published.';
  const fillNextWeekWhy = !fillNextWeekDisabled && openSlotCount > 0 ? `${pluralPhrase(openSlotCount, 'opening')} on the schedule next week` : null;
  const fillNextWeekScore = fillNextWeekDisabled ? 0 : Math.min(openSlotCount * 6, 15);
  const fillNextWeekCopy = buildFillScheduleCopy({ businessName, openSlotCount, bookingUrl });
  const fillNextWeekCard = buildCard(fillNextWeekMeta, {
    recipientCount: channelCount(reach, fillNextWeekMeta.defaultAudience, fillNextWeekMeta.defaultChannel),
    whyText: fillNextWeekWhy,
    disabledReason: fillNextWeekDisabled,
    draft: {
      channel: fillNextWeekMeta.defaultChannel,
      audience: fillNextWeekMeta.defaultAudience,
      subject: fillNextWeekCopy.subject,
      subjectOptions: [],
      body: fillNextWeekCopy.body,
      beatId: '',
      templateName: fillNextWeekMeta.title,
      templateExplanation: fillNextWeekMeta.oneLiner,
      sendTimeHint: fillNextWeekMeta.sendTimeHint ?? undefined,
    },
  });

  const followUpQuotesMeta = templateById('follow-up-quotes');
  const followUpQuotesDisabled = openQuoteCount > 0 ? null : 'Available when you have an open quote.';
  const followUpQuotesWhy = !followUpQuotesDisabled ? `${pluralPhrase(openQuoteCount, 'open quote')} waiting on a reply` : null;
  const followUpQuotesScore = followUpQuotesDisabled ? 0 : Math.min(openQuoteCount * 5, 20);
  const followUpQuotesCopy = buildFollowUpQuotesCopy({ businessName });
  const followUpQuotesCard = buildCard(followUpQuotesMeta, {
    recipientCount: channelCount(reach, followUpQuotesMeta.defaultAudience, followUpQuotesMeta.defaultChannel),
    whyText: followUpQuotesWhy,
    disabledReason: followUpQuotesDisabled,
    draft: {
      channel: followUpQuotesMeta.defaultChannel,
      audience: followUpQuotesMeta.defaultAudience,
      subject: followUpQuotesCopy.subject,
      subjectOptions: [],
      body: followUpQuotesCopy.body,
      beatId: '',
      templateName: followUpQuotesMeta.title,
      templateExplanation: followUpQuotesMeta.oneLiner,
      sendTimeHint: followUpQuotesMeta.sendTimeHint ?? undefined,
    },
  });

  const maintenanceReminderMeta = templateById('maintenance-reminder');
  const maintenanceReminderDisabled = activePlanCount > 0 ? null : 'Available once you set up a recurring plan.';
  const maintenanceReminderWhy =
    !maintenanceReminderDisabled && dueSoonCount > 0 ? `${pluralPhrase(dueSoonCount, 'visit')} due in the next two weeks` : null;
  const maintenanceReminderScore = maintenanceReminderDisabled ? 0 : Math.min(dueSoonCount * 6, 15);
  const maintenanceReminderCopy = buildMaintenanceReminderCopy({ businessName });
  const maintenanceReminderCard = buildCard(maintenanceReminderMeta, {
    recipientCount: channelCount(reach, maintenanceReminderMeta.defaultAudience, maintenanceReminderMeta.defaultChannel),
    whyText: maintenanceReminderWhy,
    disabledReason: maintenanceReminderDisabled,
    draft: {
      channel: maintenanceReminderMeta.defaultChannel,
      audience: maintenanceReminderMeta.defaultAudience,
      subject: maintenanceReminderCopy.subject,
      subjectOptions: [],
      body: maintenanceReminderCopy.body,
      beatId: '',
      templateName: maintenanceReminderMeta.title,
      templateExplanation: maintenanceReminderMeta.oneLiner,
      sendTimeHint: maintenanceReminderMeta.sendTimeHint ?? undefined,
    },
  });

  const rewardRepeatMeta = templateById('reward-repeat');
  const repeatCount = channelCount(reach, rewardRepeatMeta.defaultAudience, rewardRepeatMeta.defaultChannel);
  const rewardRepeatDisabled = repeatCount > 0 ? null : 'Available once you have a repeat customer.';
  const rewardRepeatWhy = !rewardRepeatDisabled ? `${pluralPhrase(repeatCount, 'repeat customer')} to thank` : null;
  const rewardRepeatScore = rewardRepeatDisabled ? 0 : Math.min(repeatCount * 1.2, 60);
  const rewardRepeatCopy = buildRewardRepeatCopy({ businessName });
  const rewardRepeatCard = buildCard(rewardRepeatMeta, {
    recipientCount: repeatCount,
    whyText: rewardRepeatWhy,
    disabledReason: rewardRepeatDisabled,
    draft: {
      channel: rewardRepeatMeta.defaultChannel,
      audience: rewardRepeatMeta.defaultAudience,
      subject: rewardRepeatCopy.subject,
      subjectOptions: [],
      body: rewardRepeatCopy.body,
      beatId: '',
      templateName: rewardRepeatMeta.title,
      templateExplanation: rewardRepeatMeta.oneLiner,
      sendTimeHint: rewardRepeatMeta.sendTimeHint ?? undefined,
    },
  });

  // -- Grow Your Business --------------------------------------------------

  const reconnectMeta = templateById('reconnect');
  const reconnectCount = channelCount(reach, reconnectMeta.defaultAudience, reconnectMeta.defaultChannel);
  const reconnectDisabled = reconnectCount > 0 ? null : "Available once you have a customer who hasn't booked in a while.";
  const reconnectWhy =
    !reconnectDisabled && !weMissYouIsRepresentative ? `${pluralPhrase(reconnectCount, 'customer')} haven't booked in ${LAPSED_DAYS}+ days` : null;
  const reconnectScore = reconnectDisabled || weMissYouIsRepresentative ? 0 : Math.min(reconnectCount, 80);
  const reconnectCopy = buildReconnectCopy({ businessName, bookingUrl });
  const reconnectCard = buildCard(reconnectMeta, {
    recipientCount: reconnectCount,
    whyText: reconnectWhy,
    disabledReason: reconnectDisabled,
    draft: {
      channel: reconnectMeta.defaultChannel,
      audience: reconnectMeta.defaultAudience,
      subject: reconnectCopy.subject,
      subjectOptions: [],
      body: reconnectCopy.body,
      beatId: '',
      templateName: reconnectMeta.title,
      templateExplanation: reconnectMeta.oneLiner,
      sendTimeHint: reconnectMeta.sendTimeHint ?? undefined,
    },
  });

  const weMissYouMeta = templateById('we-miss-you');
  const weMissYouCount = channelCount(reach, weMissYouMeta.defaultAudience, weMissYouMeta.defaultChannel);
  const weMissYouDisabled = weMissYouCount > 0 ? null : "Available once you have a customer who hasn't booked in a long time.";
  const weMissYouWhy =
    !weMissYouDisabled && weMissYouIsRepresentative
      ? `${pluralPhrase(weMissYouCount, 'customer')} haven't booked in ${LAPSED_DAYS * 2}+ days`
      : null;
  const weMissYouScore = weMissYouDisabled || !weMissYouIsRepresentative ? 0 : Math.min(weMissYouCount, 80);
  const weMissYouCopy = buildWeMissYouCopy({ businessName, bookingUrl });
  const weMissYouCard = buildCard(weMissYouMeta, {
    recipientCount: weMissYouCount,
    whyText: weMissYouWhy,
    disabledReason: weMissYouDisabled,
    draft: {
      channel: weMissYouMeta.defaultChannel,
      audience: weMissYouMeta.defaultAudience,
      subject: weMissYouCopy.subject,
      subjectOptions: [],
      body: weMissYouCopy.body,
      beatId: '',
      templateName: weMissYouMeta.title,
      templateExplanation: weMissYouMeta.oneLiner,
      sendTimeHint: weMissYouMeta.sendTimeHint ?? undefined,
    },
  });

  const requestReviewsMeta = templateById('request-reviews');
  let requestReviewsDisabled: string | null = null;
  if (completedCount === 0) requestReviewsDisabled = 'Available after your first completed job.';
  else if (!reviewUrl) requestReviewsDisabled = 'Add your Google review link in Settings first.';
  const requestReviewsWhy =
    !requestReviewsDisabled && awaitingReviewCount > 0 ? `${pluralPhrase(awaitingReviewCount, 'completed job')} not yet asked for a review` : null;
  const requestReviewsScore = requestReviewsDisabled ? 0 : Math.min(awaitingReviewCount * 3, 25);
  const requestReviewsCopy = requestReviewsDisabled ? null : buildRequestReviewsCopy({ businessName, reviewUrl: reviewUrl as string });
  const requestReviewsCard = buildCard(requestReviewsMeta, {
    recipientCount: channelCount(reach, requestReviewsMeta.defaultAudience, requestReviewsMeta.defaultChannel),
    whyText: requestReviewsWhy,
    disabledReason: requestReviewsDisabled,
    draft: requestReviewsCopy && {
      channel: requestReviewsMeta.defaultChannel,
      audience: requestReviewsMeta.defaultAudience,
      subject: requestReviewsCopy.subject,
      subjectOptions: [],
      body: requestReviewsCopy.body,
      beatId: '',
      templateName: requestReviewsMeta.title,
      templateExplanation: requestReviewsMeta.oneLiner,
      sendTimeHint: requestReviewsMeta.sendTimeHint ?? undefined,
    },
  });

  const announceServiceMeta = templateById('announce-service');
  const ageDays = mostRecentServiceAgeDays(services);
  const newestServiceName = services.length > 0 ? [...services].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0].name : null;
  const announceServiceDisabled = services.length > 0 ? null : 'Available once you add a service.';
  const announceServiceWhy =
    !announceServiceDisabled && ageDays !== null && ageDays <= 45 && newestServiceName
      ? `You added "${newestServiceName}" ${ageDays === 0 ? 'today' : `${pluralPhrase(ageDays, 'day')} ago`}`
      : null;
  const announceServiceScore = !announceServiceDisabled && ageDays !== null && ageDays <= 45 ? 35 : 0;
  const announceServiceCopy = buildAnnounceServiceCopy({ businessName, serviceName: newestServiceName || 'our newest service' });
  const announceServiceCard = buildCard(announceServiceMeta, {
    recipientCount: channelCount(reach, announceServiceMeta.defaultAudience, announceServiceMeta.defaultChannel),
    whyText: announceServiceWhy,
    disabledReason: announceServiceDisabled,
    draft: {
      channel: announceServiceMeta.defaultChannel,
      audience: announceServiceMeta.defaultAudience,
      subject: announceServiceCopy.subject,
      subjectOptions: [],
      body: announceServiceCopy.body,
      beatId: '',
      templateName: announceServiceMeta.title,
      templateExplanation: announceServiceMeta.oneLiner,
      sendTimeHint: announceServiceMeta.sendTimeHint ?? undefined,
    },
  });

  const referralMeta = templateById('referral');
  const referralCopy = buildReferralCopy({ businessName, bookingUrl, reward: referralReward ?? null });
  const referralCard = buildCard(referralMeta, {
    recipientCount: channelCount(reach, referralMeta.defaultAudience, referralMeta.defaultChannel),
    whyText: null,
    disabledReason: null,
    draft: {
      channel: referralMeta.defaultChannel,
      audience: referralMeta.defaultAudience,
      subject: referralCopy.subject,
      subjectOptions: [],
      body: referralCopy.body,
      beatId: '',
      templateName: referralMeta.title,
      templateExplanation: referralMeta.oneLiner,
      sendTimeHint: referralMeta.sendTimeHint ?? undefined,
    },
  });

  const customMeta = templateById('custom');
  const customCard = buildCard(customMeta, {
    recipientCount: channelCount(reach, customMeta.defaultAudience, customMeta.defaultChannel),
    whyText: null,
    disabledReason: null,
    draft: {
      channel: customMeta.defaultChannel,
      audience: customMeta.defaultAudience,
      subject: '',
      subjectOptions: [],
      body: '',
      beatId: '',
      templateName: customMeta.title,
      templateExplanation: customMeta.oneLiner,
      sendTimeHint: undefined,
    },
  });

  // -- Seasonal -------------------------------------------------------------
  // planCalendar already returns beats soonest-first; filtering to email-capable
  // ones here keeps a blog-only beat from ever becoming a campaign candidate.

  const seasonalMeta = templateById('seasonal-promotion');
  const plannedBeats: PlannedBeat[] = planCalendar({
    trade,
    zone,
    fromMonth: currentMonth,
    monthsAhead: 3,
    // Already loaded above for the other signals. A plumber with no heating
    // work in their price book stops being recommended a heating tune-up.
    services: services.map((service) => service.name),
  }).filter((planned) => planned.beat.channels.includes('email'));

  function buildSeasonalInstanceCard(planned: PlannedBeat): TemplateCard {
    const audience = campaignAudienceForBeat(planned.beat.audience);
    const recipientCount = audience ? channelCount(reach, audience, 'email') : null;
    const copy = buildSeasonalCopy({
      businessName,
      beatTitle: planned.beat.title,
      whyNow: planned.beat.whyNow,
      monthName: planned.monthName,
    });
    return {
      id: 'seasonal-promotion',
      title: planned.beat.title,
      category: 'seasonal',
      icon: 'seasonal-promotion',
      oneLiner: seasonalMeta.oneLiner,
      audienceLabel: audience ? AUDIENCE_LABEL[audience] : 'Audience decided in the editor',
      channelLabel: CHANNEL_LABEL.email,
      recipientCount,
      whyText: recipientCount !== null ? planned.beat.whyNow : null,
      sendTimeHint: seasonalMeta.sendTimeHint,
      disabledReason: null,
      draft: {
        channel: 'email',
        audience: audience ?? 'all',
        subject: copy.subject,
        subjectOptions: [],
        body: copy.body,
        beatId: planned.beat.id,
        templateName: planned.beat.title,
        templateExplanation: seasonalMeta.oneLiner,
        sendTimeHint: seasonalMeta.sendTimeHint ?? undefined,
      },
    };
  }

  const seasonalInstances = plannedBeats.map(buildSeasonalInstanceCard);
  // Only a beat that maps to a real audience can back a top-3 slot — a
  // maintenance-due beat's count is unknowable (see campaignAudienceForBeat),
  // so it's excluded from scoring even though it still shows in the rail.
  const eligiblePlannedIndex = plannedBeats.findIndex((planned) => campaignAudienceForBeat(planned.beat.audience) !== null);

  let seasonalPrimaryCard: TemplateCard;
  let seasonalScore = 0;
  let seasonalEligibleForScoring = false;

  if (plannedBeats.length === 0) {
    seasonalPrimaryCard = {
      id: 'seasonal-promotion',
      title: seasonalMeta.title,
      category: seasonalMeta.category,
      icon: 'seasonal-promotion',
      oneLiner: seasonalMeta.oneLiner,
      audienceLabel: AUDIENCE_LABEL.all,
      channelLabel: CHANNEL_LABEL.email,
      recipientCount: null,
      whyText: null,
      sendTimeHint: seasonalMeta.sendTimeHint,
      disabledReason: 'No seasonal topic fits your trade or area right now.',
      draft: null,
    };
  } else if (eligiblePlannedIndex >= 0) {
    seasonalPrimaryCard = seasonalInstances[eligiblePlannedIndex];
    seasonalScore = plannedBeats[eligiblePlannedIndex].month === currentMonth ? 45 : 25;
    seasonalEligibleForScoring = true;
  } else {
    seasonalPrimaryCard = seasonalInstances[0];
  }

  // -- Score, pick top 3, fall back to the fixed priority list -------------

  const candidates: Array<{ id: TemplateId; card: TemplateCard; score: number }> = [
    { id: 'fill-next-week', card: fillNextWeekCard, score: fillNextWeekScore },
    { id: 'follow-up-quotes', card: followUpQuotesCard, score: followUpQuotesScore },
    { id: 'maintenance-reminder', card: maintenanceReminderCard, score: maintenanceReminderScore },
    { id: 'reward-repeat', card: rewardRepeatCard, score: rewardRepeatScore },
    { id: 'reconnect', card: reconnectCard, score: reconnectScore },
    { id: 'we-miss-you', card: weMissYouCard, score: weMissYouScore },
    { id: 'request-reviews', card: requestReviewsCard, score: requestReviewsScore },
    { id: 'announce-service', card: announceServiceCard, score: announceServiceScore },
    { id: 'referral', card: referralCard, score: 0 },
  ];
  if (seasonalEligibleForScoring) candidates.push({ id: 'seasonal-promotion', card: seasonalPrimaryCard, score: seasonalScore });

  const recommended: TemplateCard[] = [];
  const recommendedIds = new Set<TemplateId>();
  const byScore = [...candidates].filter((c) => !c.card.disabledReason).sort((a, b) => b.score - a.score);
  for (const candidate of byScore) {
    if (recommended.length >= 3 || candidate.score <= 0) break;
    recommended.push(candidate.card);
    recommendedIds.add(candidate.id);
  }

  if (recommended.length < 3) {
    const fallbackOrder: TemplateId[] = [
      'fill-next-week',
      'follow-up-quotes',
      'maintenance-reminder',
      'reward-repeat',
      weMissYouIsRepresentative ? 'we-miss-you' : 'reconnect',
      'request-reviews',
      'seasonal-promotion',
      'announce-service',
      'referral',
    ];
    for (const id of fallbackOrder) {
      if (recommended.length >= 3) break;
      if (recommendedIds.has(id)) continue;
      const found = candidates.find((c) => c.id === id);
      if (found && !found.card.disabledReason) {
        recommended.push(found.card);
        recommendedIds.add(id);
      }
    }
  }

  // -- Bucket everything for the browsable rails ----------------------------

  const cardById: Record<Exclude<TemplateId, never>, TemplateCard> = {
    'fill-next-week': fillNextWeekCard,
    'follow-up-quotes': followUpQuotesCard,
    'maintenance-reminder': maintenanceReminderCard,
    'reward-repeat': rewardRepeatCard,
    'seasonal-promotion': seasonalPrimaryCard,
    reconnect: reconnectCard,
    'we-miss-you': weMissYouCard,
    'request-reviews': requestReviewsCard,
    'announce-service': announceServiceCard,
    referral: referralCard,
    custom: customCard,
  };

  return {
    recommended,
    quickWins: TEMPLATES.filter((meta) => meta.category === 'quick-wins').map((meta) => cardById[meta.id]),
    seasonal: seasonalInstances,
    grow: TEMPLATES.filter((meta) => meta.category === 'grow').map((meta) => cardById[meta.id]),
    all: TEMPLATES.map((meta) => cardById[meta.id]),
  };
}
