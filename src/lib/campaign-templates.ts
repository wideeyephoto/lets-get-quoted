// The fixed catalog of campaign starters, and the deterministic (non-AI) copy
// that fills each one in. Pure — no database, no network, no OpenAI call —
// same contract as buildQuickStopPitch in src/lib/quick-stop-pitch.ts, so a
// starter's wording is exactly reproducible and never a language model's
// guess at what a contractor might want to say.
//
// campaign-recommendations.ts does the DB reads and eligibility/scoring on
// top of this catalog; this file only knows what the 11 templates ARE.

import type { CampaignAudience, CampaignChannel } from '@/lib/campaign-audiences';

export type TemplateCategory = 'quick-wins' | 'seasonal' | 'grow';

export type TemplateId =
  | 'fill-next-week'
  | 'reconnect'
  | 'reward-repeat'
  | 'request-reviews'
  | 'follow-up-quotes'
  | 'seasonal-promotion'
  | 'maintenance-reminder'
  | 'announce-service'
  | 'referral'
  | 'we-miss-you'
  | 'custom';

export type TemplateMeta = {
  id: TemplateId;
  title: string;
  /** null only for 'custom' — it isn't Quick Wins, Seasonal, or Grow, it's the escape hatch. */
  category: TemplateCategory | null;
  /** Key into ACTION_ICON_PATHS (src/components/action-icon.tsx) — same string as `id`. */
  icon: TemplateId;
  oneLiner: string;
  defaultAudience: CampaignAudience;
  defaultChannel: CampaignChannel;
  /** Static display text only — no scheduling infrastructure sits behind this. */
  sendTimeHint: string | null;
};

// Fixed order. Also doubles as the "All Templates" listing order and, grouped
// by category, the order each rail renders in.
export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'fill-next-week',
    title: "Fill Next Week's Schedule",
    category: 'quick-wins',
    icon: 'fill-next-week',
    oneLiner: 'Let past customers know you have room on the schedule next week.',
    defaultAudience: 'all',
    defaultChannel: 'both',
    sendTimeHint: 'Weekday mornings tend to get the fastest replies.',
  },
  {
    id: 'follow-up-quotes',
    title: 'Follow Up on Open Quotes',
    category: 'quick-wins',
    icon: 'follow-up-quotes',
    oneLiner: 'Nudge customers who have an open quote sitting unanswered.',
    defaultAudience: 'past',
    defaultChannel: 'email',
    sendTimeHint: 'A short, low-pressure note tends to work better than a long one.',
  },
  {
    id: 'maintenance-reminder',
    title: 'Maintenance Reminder',
    category: 'quick-wins',
    icon: 'maintenance-reminder',
    oneLiner: 'Remind customers on a recurring plan that their next visit is coming up.',
    defaultAudience: 'past',
    defaultChannel: 'email',
    sendTimeHint: 'Send a week or so before the visit, while there’s still time to reschedule.',
  },
  {
    id: 'reward-repeat',
    title: 'Reward Repeat Customers',
    category: 'quick-wins',
    icon: 'reward-repeat',
    oneLiner: 'Thank your repeat customers for coming back.',
    defaultAudience: 'repeat',
    defaultChannel: 'email',
    sendTimeHint: 'No rush — this reads well sent any day of the week.',
  },
  {
    id: 'seasonal-promotion',
    title: 'Seasonal Promotion',
    category: 'seasonal',
    icon: 'seasonal-promotion',
    oneLiner: "Reach out about seasonal work that's relevant right now.",
    defaultAudience: 'all',
    defaultChannel: 'email',
    sendTimeHint: 'Best sent early in the season, before schedules fill up.',
  },
  {
    id: 'reconnect',
    title: 'Reconnect With Past Customers',
    category: 'grow',
    icon: 'reconnect',
    oneLiner: "Check in with customers who haven't booked in a while.",
    defaultAudience: 'lapsed',
    defaultChannel: 'email',
    sendTimeHint: 'Tuesday through Thursday mornings tend to get read fastest.',
  },
  {
    id: 'we-miss-you',
    title: 'We Miss You',
    category: 'grow',
    icon: 'we-miss-you',
    oneLiner: "Win back customers who've been gone a long time.",
    defaultAudience: 'lapsed',
    defaultChannel: 'both',
    sendTimeHint: 'Keep it short — this is a nudge, not a pitch.',
  },
  {
    id: 'request-reviews',
    title: 'Request Customer Reviews',
    category: 'grow',
    icon: 'request-reviews',
    oneLiner: 'Ask happy customers for a review.',
    defaultAudience: 'past',
    defaultChannel: 'email',
    sendTimeHint: "Send within a few days of the job, while it's still fresh.",
  },
  {
    id: 'announce-service',
    title: 'Announce a New Service',
    category: 'grow',
    icon: 'announce-service',
    oneLiner: 'Tell past customers about a service you just added.',
    defaultAudience: 'all',
    defaultChannel: 'email',
    sendTimeHint: 'Pair this with a post on your website or socials for extra reach.',
  },
  {
    id: 'referral',
    title: 'Referral Campaign',
    category: 'grow',
    icon: 'referral',
    oneLiner: 'Ask your best customers to send friends and neighbors your way.',
    defaultAudience: 'repeat',
    defaultChannel: 'email',
    sendTimeHint: 'A personal ask travels better than a mass email — keep the tone warm.',
  },
  {
    id: 'custom',
    title: 'Custom Campaign',
    category: null,
    icon: 'custom',
    oneLiner: 'Start with a blank message and write it your way.',
    defaultAudience: 'past',
    defaultChannel: 'email',
    sendTimeHint: null,
  },
];

export type TemplateCopy = { subject: string; body: string };

export function buildFillScheduleCopy(input: { businessName: string; openSlotCount: number; bookingUrl: string | null }): TemplateCopy {
  const slotsPhrase =
    input.openSlotCount > 0
      ? `We've got ${input.openSlotCount} opening${input.openSlotCount === 1 ? '' : 's'} on the schedule next week`
      : "We've got room opening up on the schedule soon";
  const cta = input.bookingUrl
    ? `Grab a spot here: ${input.bookingUrl}`
    : "Reply and let us know what day works and we'll get you booked.";
  return {
    subject: 'A few openings next week — want one?',
    body: [
      'Hi {name},',
      '',
      `${slotsPhrase}, and we'd rather fill it with people we already know than leave it empty.`,
      '',
      `If there's anything you've been meaning to get done, now's a good time. ${cta}`,
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

export function buildReconnectCopy(input: { businessName: string; bookingUrl: string | null }): TemplateCopy {
  const cta = input.bookingUrl ? `Book a spot whenever suits: ${input.bookingUrl}` : "Reply and we'll find a time that works.";
  return {
    subject: "It's been a while — how's everything holding up?",
    body: [
      'Hi {name},',
      '',
      `It's been a bit since your last job with ${input.businessName}, and we wanted to check in.`,
      '',
      `If anything's come up since then — or you're due for another visit — we'd love to help again. ${cta}`,
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

export function buildWeMissYouCopy(input: { businessName: string; bookingUrl: string | null }): TemplateCopy {
  const cta = input.bookingUrl ? `Come back any time: ${input.bookingUrl}` : "Reply any time and we'll get you sorted.";
  return {
    subject: 'We miss having you as a customer',
    body: [
      'Hi {name},',
      '',
      "It's been quite a while since we last worked with you, and honestly, we miss it.",
      '',
      `No pressure at all — just wanted you to know the door's open whenever you need us again. ${cta}`,
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

export function buildRewardRepeatCopy(input: { businessName: string }): TemplateCopy {
  return {
    subject: 'A thank-you for sticking with us',
    body: [
      'Hi {name},',
      '',
      `You've booked with ${input.businessName} more than once now, and that means a lot — most people don't come back a second time unless the first visit actually went well.`,
      '',
      "Reply to this and let us know what you need next — we'll make sure you're taken care of.",
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

export function buildRequestReviewsCopy(input: { businessName: string; reviewUrl: string }): TemplateCopy {
  return {
    subject: 'Got two minutes? We’d love your feedback',
    body: [
      'Hi {name},',
      '',
      `Thanks again for choosing ${input.businessName}. If you have a moment, a quick review would help other people find us — and it means a lot to a small business like ours.`,
      '',
      `Leave a review here: ${input.reviewUrl}`,
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

export function buildFollowUpQuotesCopy(input: { businessName: string }): TemplateCopy {
  return {
    subject: 'Still thinking it over? Happy to answer questions',
    body: [
      'Hi {name},',
      '',
      "We sent over a quote a little while back and wanted to check in — no rush, but if you have questions or want to adjust anything, just reply here.",
      '',
      "If you're ready to move forward, reply and we'll get you on the schedule.",
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

// Does NOT call draftMarketing()/campaignDraftForBeat() — that path hits
// OpenAI and can return null or drift in wording between two contractors on
// the same beat. This builds the email straight from the beat's own static
// title/whyNow, exactly the way buildQuickStopPitch builds from account
// fields: no model call, same words every time.
export function buildSeasonalCopy(input: { businessName: string; beatTitle: string; whyNow: string; monthName: string }): TemplateCopy {
  return {
    subject: `${input.beatTitle} — worth doing this ${input.monthName}`,
    body: [
      'Hi {name},',
      '',
      input.whyNow,
      '',
      "If you'd like us to take care of it, just reply and we'll get you booked in.",
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

export function buildMaintenanceReminderCopy(input: { businessName: string }): TemplateCopy {
  return {
    subject: 'Your next visit is coming up',
    body: [
      'Hi {name},',
      '',
      `Just a heads up that your next scheduled visit with ${input.businessName} is coming up soon.`,
      '',
      "Reply here if you need to reschedule, or if there's anything else you'd like us to take a look at while we're there.",
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

export function buildAnnounceServiceCopy(input: { businessName: string; serviceName: string }): TemplateCopy {
  return {
    subject: `We now offer ${input.serviceName}`,
    body: [
      'Hi {name},',
      '',
      `Wanted to let you know ${input.businessName} now offers ${input.serviceName} — since you've worked with us before, thought you'd want to be one of the first to know.`,
      '',
      "Reply if you'd like to hear more or get a quote.",
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}

export function buildReferralCopy(input: { businessName: string; bookingUrl: string | null }): TemplateCopy {
  const cta = input.bookingUrl ? `Send them here to get started: ${input.bookingUrl}` : 'Just have them reply to this or give us a call.';
  return {
    subject: 'Know someone who could use us?',
    body: [
      'Hi {name},',
      '',
      `If you know anyone who could use ${input.businessName} — a neighbor, a friend, family — we'd really appreciate the introduction.`,
      '',
      cta,
      '',
      `— ${input.businessName}`,
    ].join('\n'),
  };
}
