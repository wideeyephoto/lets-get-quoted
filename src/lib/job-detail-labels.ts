import type { InvoiceStatus } from './invoices';
import type { PaymentStatus } from './payments';
import type { Cost } from './jobs';
import type { JobFeedEvent } from './job-feed';

// Display labels for a job's money and activity, shared by the full job page
// and the Focus pane on the pipeline. These were module-private inside
// dashboard/jobs/[id]/page.tsx; two surfaces describing the same event with
// different words is the worst bug class on this screen, because there's no way
// to tell which one is lying.

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  requested: 'Awaiting payment',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  paid: 'Paid',
  void: 'Void',
};

export const COST_TYPE_ICON: Record<Cost['type'], string> = {
  material: '🧱',
  labor: '👷',
  sub: '🤝',
  receipt: '🧾',
  other: '📦',
};

export const FEED_VISIBILITY_LABEL: Record<JobFeedEvent['visibility'], string> = {
  internal: 'Internal',
  client: 'Client visible',
  client_financial: 'Client financial',
};

export const FEED_KIND_LABEL: Record<string, string> = {
  job_created: 'Job',
  job_update: 'Update',
  job_scheduled: 'Schedule',
  job_started: 'Started',
  job_completed: 'Completed',
  appointment_reminder: 'Reminder',
  appointment_confirmed: 'Confirmed',
  review_feedback: 'Private feedback',
  cost_added: 'Cost',
  payment_requested: 'Payment request',
  payment_paid: 'Payment received',
  payment_failed: 'Payment issue',
  payment_refunded: 'Refund',
  payment_disputed: 'Chargeback',
  dispute_won: 'Chargeback won',
  dispute_lost: 'Chargeback lost',
  invoice_created: 'Invoice',
  invoice_signoff_link: 'Client sign-off',
  invoice_sent: 'Invoice sent',
  invoice_signed: 'Invoice signed',
  invoice_paid: 'Invoice paid',
  payment_cancelled: 'Payment cancelled',
  invoice_voided: 'Invoice cancelled',
  client_link_created: 'Client link',
  client_link_revoked: 'Client link',
  review_requested: 'Review request',
  quote_followup: 'Quote follow-up',
};

export const FEED_KIND_ICON: Record<string, string> = {
  job_created: '+',
  job_update: 'i',
  job_scheduled: 'S',
  job_started: '▶',
  job_completed: '✓',
  cost_added: '$',
  payment_requested: '$',
  payment_paid: '✓',
  payment_failed: '!',
  payment_refunded: '↩',
  payment_disputed: '⚠',
  dispute_won: '✓',
  dispute_lost: '⚠',
  invoice_created: 'I',
  invoice_signoff_link: '✓',
  invoice_sent: 'I',
  invoice_signed: '✓',
  invoice_paid: '✓',
  payment_cancelled: '×',
  invoice_voided: '×',
  client_link_created: '↗',
  client_link_revoked: '×',
  review_requested: '⭐',
  quote_followup: '↻',
};

export function marginTier(margin: number): 'margin-good' | 'margin-ok' | 'margin-bad' {
  if (margin >= 0.35) return 'margin-good';
  if (margin >= 0.2) return 'margin-ok';
  return 'margin-bad';
}

export function formatFeedTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export type CompleteJobWarningInput = {
  clientName: string;
  /** Automations → "Ask for a review automatically". The account default. */
  autoReviewRequest: boolean;
  /** A Google review link is saved. Without one the auto-ask sends nothing. */
  reviewUrlConfigured: boolean;
  /** This job already has a review_requested feed entry — the ask fires once. */
  alreadyRequested: boolean;
  /** How the ask would reach them: SMS when there's a mobile, else email. */
  channel: 'text' | 'email' | null;
  /**
   * The per-job pill on the complete button, when the owner has set it.
   * Absent means "whatever the account setting says", which is what every
   * caller meant before the pill existed.
   */
  sendReview?: boolean;
};

/**
 * Whether pressing complete right now actually sends a review request.
 *
 * The pill overrides the ACCOUNT setting — that is the point of it, and it
 * works in both directions: ask on this one job even though automatic asks are
 * off, or skip it on this one job even though they are on.
 *
 * What the pill cannot override is the three things that make a send
 * impossible rather than unwanted. Those are not preferences, and a toggle that
 * claims to turn one of them into a send would be lying about what the button
 * does.
 */
export function willAskForReview(input: CompleteJobWarningInput): boolean {
  const wants = input.sendReview ?? input.autoReviewRequest;
  return wants && input.reviewUrlConfigured && !input.alreadyRequested && input.channel !== null;
}

export type ReviewPillState =
  | { canAsk: true; defaultOn: boolean; channel: 'text' | 'email' }
  /**
   * Nothing can be sent on this job, and the pill says which of the three.
   *
   * `fix` is present only when the owner can do something about it from here.
   * "Already asked" and "no phone or email" are facts about this job; a missing
   * review link is a five-second errand, and the reason it was worth wiring up
   * is that the sentence used to send people to the wrong place — see below.
   */
  | { canAsk: false; reason: string; fix?: { href: string; label: string } };

/**
 * What the review pill should offer on this job.
 *
 * Returns canAsk:false rather than an off-by-default toggle when a send is
 * impossible. An owner who flips a switch to ON and gets nothing has been told
 * something untrue by the interface, and they will not find out — the send is
 * silent either way.
 */
export function reviewPillState(input: CompleteJobWarningInput): ReviewPillState {
  const who = input.clientName?.trim() || 'the customer';
  if (!input.reviewUrlConfigured) {
    /**
     * NOT SETTINGS. This said "add one in Settings" and the profile has never
     * been there — it is linked in the website builder's Customer reviews card,
     * which is where resolveAccountReviewUrl reads it from
     * (site.content.testimonials.googlePlaceId) and what the send path's own
     * error message says. An owner following this sentence arrived at a page
     * with no such field and no way to know where to look next.
     */
    return {
      canAsk: false,
      reason: 'No Google review link saved yet — link your Google Business Profile and this turns on.',
      fix: { href: '/dashboard/sites#google-business-profile', label: 'Link your profile →' },
    };
  }
  if (input.alreadyRequested) {
    return { canAsk: false, reason: `${who} has already been asked for a review on this job.` };
  }
  if (!input.channel) {
    return { canAsk: false, reason: `${who} has no mobile or email on file, so there's nowhere to send it.` };
  }
  return { canAsk: true, defaultOn: input.autoReviewRequest, channel: input.channel };
}

/**
 * Whether completing is worth stopping to ask about.
 *
 * Only when a review request will really go out. Completion itself is undoable
 * from the feed, so with the pill off there is nothing here that cannot be
 * taken back — and a dialog that fires when nothing irreversible is about to
 * happen is how people learn to click through dialogs.
 */
export function completeJobNeedsConfirm(input: CompleteJobWarningInput): boolean {
  return willAskForReview(input);
}

/**
 * What marking a job complete is actually going to do, as a confirm dialog.
 *
 * Completing is undoable from the feed. The review request it can trigger is
 * NOT — it's a text to a customer, and the contractor should know it's about to
 * leave before they press the button, not after. So this states the outcome of
 * THIS account's settings rather than a generic "a review request may be sent":
 * a warning that fires when nothing will happen trains people to click through
 * warnings, which is worse than not warning at all.
 *
 * Every branch below is a real state the send path can be in — see
 * deliverJobReviewRequest, which bails on a missing review URL and is gated on
 * both the account toggle and a once-per-job check.
 */
export function completeJobConfirmMessage(input: CompleteJobWarningInput): string {
  const who = input.clientName?.trim() || 'the customer';
  const head = `Mark this job complete?\n\n${who} sees it close out on their job feed. You can undo it from the feed if you press it early.`;

  // The pill, when the owner has set it. Said in its own words rather than the
  // account setting's, because "automatic review asks are off" is the wrong
  // explanation for a switch they just turned off themselves.
  if (input.sendReview === false) {
    return `${head}\n\nReview is switched off for this one, so no review request goes out.`;
  }
  if (input.sendReview === true && !input.autoReviewRequest && input.reviewUrlConfigured && !input.alreadyRequested && input.channel) {
    return `${head}\n\n⭐ Review is switched on for this one, so ${who} will be ${input.channel === 'text' ? 'texted' : 'emailed'} a review request straight away — even though automatic asks are off. That send can't be recalled.`;
  }

  if (!input.autoReviewRequest) {
    return `${head}\n\nNo review request goes out — automatic review asks are off, so that stays a button you press yourself.`;
  }
  if (!input.reviewUrlConfigured) {
    return `${head}\n\nAutomatic review asks are on, but there's no Google review link saved yet, so nothing will be sent.`;
  }
  if (input.alreadyRequested) {
    return `${head}\n\n${who} has already been asked for a review on this job, so another one won't be sent.`;
  }
  if (!input.channel) {
    return `${head}\n\nAutomatic review asks are on, but ${who} has no mobile or email on file, so the review request can't be sent.`;
  }
  return `${head}\n\n⭐ ${who} will be ${input.channel === 'text' ? 'texted' : 'emailed'} a review request straight away. That send can't be recalled.`;
}

export function getFeedDisplayTitle(event: Pick<JobFeedEvent, 'kind' | 'title'>): string {
  if (event.kind === 'job_created') return 'Quote sent';
  if (event.kind === 'client_link_created') return 'Client view link created';
  if (event.kind === 'client_link_revoked') return 'Client view links revoked';
  return event.title || event.kind;
}

export function getFeedDisplayBody(event: Pick<JobFeedEvent, 'kind' | 'body'>): string | null {
  if (event.kind === 'client_link_created') return 'A client view link was created for this job.';
  if (event.kind === 'client_link_revoked') return 'Active client view links for this job were revoked.';
  return event.body;
}
