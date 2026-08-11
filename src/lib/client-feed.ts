/**
 * WHAT THE HOMEOWNER IS ALLOWED TO READ.
 *
 * The client job page rendered the job feed by filtering on a `visibility`
 * column and then printing whatever title and body the row happened to hold.
 * That is an opt-OUT model, and it leaked exactly the way opt-out models do.
 *
 * A homeowner reviewing a $3,500 quote was shown, on their own page:
 *
 *   "J-1004 created — Job was added for Dana Whitfield. Quoted amount: $3,500.
 *    Estimated hours: 6. Address: … Job description: … AI estimate shown to the
 *    customer: $30-$80. Timing: Needed ASAP. Contact preference: TEXT ONLY —
 *    asked not to be called."
 *
 * None of that was meant for them. The trail is worth naming because it is not
 * one careless string: the website intake form appends its triage notes to the
 * lead's message (HeroQuickForm), converting a lead to a job copies the message
 * into `jobs.scope` (convertLeadToJob), the job_created feed event prints the
 * scope through formatJobQuoteSummary, and that event was marked
 * `visibility: 'client'`. Four reasonable steps, one unreasonable page.
 *
 * Titles leaked the same way in a quieter register. "Client selected a service
 * date" is written from the contractor's chair; the client reading it is the
 * client.
 *
 * So this module inverts the default. A feed row reaches a customer only if its
 * `kind` is listed below, WITH a decision about its body: either the stored body
 * was written for the customer and passes (scrubbed), or it was machine-written
 * and we substitute our own line. A kind nobody has thought about renders
 * nothing, which is the correct failure.
 *
 * Deliberately pure and import-free so the rules can be tested exhaustively.
 */

export type FeedEventLike = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  amount: number | null;
  action_url: string | null;
  created_at: string;
};

export type ClientFeedItem = {
  id: string;
  title: string;
  body: string | null;
  amount: number | null;
  actionUrl: string | null;
  at: string;
};

type Rendering = {
  /** The customer-facing headline, replacing whatever the row stored. */
  title: string;
  /**
   * 'pass' — the stored body was written for this customer; it goes through
   *          the scrubber and is shown.
   * 'own'  — the stored body is machine-generated or internal. Dropped, and
   *          `note` (if any) is shown instead.
   */
  body: 'pass' | 'own';
  note?: string;
  /** False for rows whose stored action_url points at nothing a client can use. */
  keepAction?: boolean;
};

/**
 * The whole customer-visible vocabulary. Add a kind here, with a title in the
 * homeowner's language and an explicit decision about its body, or it does not
 * appear on their page.
 */
export const CLIENT_FEED_KINDS: Record<string, Rendering> = {
  // The job's own arrival. Its stored body is formatJobQuoteSummary output —
  // the contractor's internal précis — so it is always replaced.
  job_created: { title: 'Quote prepared', body: 'own', note: 'Your quote is ready to review above.' },
  quote_approved: { title: 'You approved the quote', body: 'own', note: 'Thanks — your contractor has been notified.' },

  job_scheduled: { title: 'Start date', body: 'pass' },
  job_started: { title: 'Work started', body: 'pass' },
  job_completed: { title: 'Work finished', body: 'pass' },
  job_update: { title: 'Update from your contractor', body: 'pass' },
  client_question: { title: 'You asked a question', body: 'pass' },

  milestone_submitted: { title: 'A stage was completed', body: 'pass' },

  selection_requested: { title: 'Choices to make', body: 'pass', keepAction: true },
  selection_chosen: { title: 'Your choice was saved', body: 'pass' },
  selection_question: { title: 'Your question was sent', body: 'pass' },

  change_order_sent: { title: 'A change to your quote', body: 'pass', keepAction: true },
  change_order_approved: { title: 'You approved the change', body: 'pass' },
  change_order_declined: { title: 'You declined the change', body: 'pass' },

  warranty_started: { title: 'Your warranty started', body: 'pass' },
  warranty_claim: { title: 'Warranty claim received', body: 'pass' },

  review_requested: { title: 'Review request', body: 'pass', keepAction: true },

  payment_requested: { title: 'Payment requested', body: 'pass', keepAction: true },
  payment_paid: { title: 'Payment received', body: 'pass' },
  payment_failed: { title: 'A payment didn’t go through', body: 'pass', keepAction: true },
  payment_cancelled: { title: 'Payment request cancelled', body: 'pass' },
  payment_refunded: { title: 'Refund issued', body: 'pass' },
  recurring_charge_skipped: { title: 'A scheduled charge was skipped', body: 'pass' },

  payment_plan_active: { title: 'Payment plan started', body: 'pass' },
  payment_plan_paid_off: { title: 'Paid in full', body: 'pass' },

  invoice_sent: { title: 'Invoice sent', body: 'pass', keepAction: true },
  invoice_signed: { title: 'You signed the invoice', body: 'pass' },
  invoice_paid: { title: 'Invoice paid', body: 'pass' },
  invoice_voided: { title: 'Invoice cancelled', body: 'pass' },
  invoice_signoff_link: { title: 'Invoice ready to sign', body: 'own', note: 'Open it to review and sign.', keepAction: true },
};

/**
 * Sentences the intake machinery appends for the CONTRACTOR's benefit. Matched
 * at the start of a sentence, because that is how they are assembled — see the
 * `parts` array in HeroQuickForm and formatJobQuoteSummary in lib/jobs.
 */
const TRIAGE_SENTENCE: RegExp[] = [
  /^AI estimate\b/i,
  /^Contact preference\b/i,
  /^Timing\s*:/i,
  /^Timeline\s*:/i,
  /^Location given\b/i,
  /^Estimated hours\b/i,
  /^Quoted amount\b/i,
  /^Job was added for\b/i,
  /^Lead source\b/i,
  /^Verified phone\b/i,
];

const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

function scrubSentences(paragraph: string): string {
  // Split after a full stop so a triage sentence can be lifted out of a
  // paragraph that also holds the customer's own words.
  return paragraph
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !TRIAGE_SENTENCE.some((pattern) => pattern.test(sentence.trim())))
    .join(' ')
    .trim();
}

/**
 * Take a stored free-text blob and return only the part a customer should read
 * back: their own words, with the operational notes appended around them
 * removed, and their contact details un-echoed.
 *
 * Returns null when nothing is left — a scope that was ONLY triage notes has no
 * customer-facing version, and an empty section beats a redacted-looking one.
 */
export function clientSafeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(scrubSentences)
    .filter(Boolean)
    .join('\n\n')
    .replace(EMAIL, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return cleaned || null;
}

/** The feed, as the homeowner should see it. Unknown kinds render nothing. */
export function toClientFeed(events: FeedEventLike[]): ClientFeedItem[] {
  const items: ClientFeedItem[] = [];
  for (const event of events) {
    const rendering = CLIENT_FEED_KINDS[event.kind];
    if (!rendering) continue;
    const body = rendering.body === 'pass' ? clientSafeText(event.body) : rendering.note ?? null;
    items.push({
      id: event.id,
      title: rendering.title,
      body,
      amount: event.amount,
      actionUrl: rendering.keepAction ? event.action_url : null,
      at: event.created_at,
    });
  }
  return items;
}

/**
 * WHERE THE JOB ACTUALLY IS, in the customer's terms.
 *
 * The page badged a job "New request" — the raw `job_status` enum value — on a
 * screen that was simultaneously asking for a $1,750 deposit. Both statements
 * were true internally and together they read as incoherent. Status on this page
 * has one job: to agree with what is being asked of the person reading it.
 *
 * Ordered by what the customer must do next, not by how far the job has come:
 * the deposit outranks the start date because the deposit is what is blocking.
 */
export function clientJobStatus(input: {
  quoteApproved: boolean;
  depositDue: boolean;
  paymentDue: boolean;
  scheduleOpen: boolean;
  scheduledLabel: string | null;
  jobStatus: string;
}): { label: string; tone: 'awaiting' | 'progress' | 'done' } {
  if (input.jobStatus === 'archived') return { label: 'Closed', tone: 'done' };
  if (!input.quoteApproved) return { label: 'Quote awaiting your approval', tone: 'awaiting' };
  if (input.depositDue) return { label: 'Approved — deposit due', tone: 'awaiting' };
  if (input.scheduleOpen) return { label: 'Approved — choose a start date', tone: 'awaiting' };
  if (input.jobStatus === 'complete') {
    return input.paymentDue ? { label: 'Work finished — payment due', tone: 'awaiting' } : { label: 'Complete', tone: 'done' };
  }
  if (input.paymentDue) return { label: 'Payment due', tone: 'awaiting' };
  if (input.scheduledLabel) return { label: `Scheduled · ${input.scheduledLabel}`, tone: 'progress' };
  return { label: 'Approved — scheduling', tone: 'progress' };
}
