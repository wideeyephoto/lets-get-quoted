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
  edited_at?: string | null;
  /**
   * The structured record behind the sentence.
   *
   * Every writer of a job_feed row already stores one — the dates offered, the
   * date chosen, the range booked — and nothing read it. So the page printed
   * the prose instead, which is how a customer came to be shown "Schedule
   * options were texted to Dana Whitfield: 1. Tue, Aug 18 · 9:00 AM 2. Thu,
   * Aug 20 · 9:00 AM 3. Fri, Aug 21 · 9:00 AM" as one paragraph. The data was
   * there in a list the whole time. See shapeScheduled.
   */
  meta?: Record<string, unknown> | null;
};

/** Which of the three things this event is, for the eye rather than the reader. */
export type FeedTone =
  /** Green. Something is agreed, paid, or finished. */
  | 'good'
  /** Orange. Money is owed or a decision is waiting on the customer. */
  | 'due'
  /** Blue-sage. Scheduling and information — true, but not a task. */
  | 'info';

/** Named rather than drawn here: the glyphs live with the markup. See FeedIcon. */
export type FeedIconName =
  | 'check'
  | 'doc'
  | 'calendar'
  | 'card'
  | 'receipt'
  | 'message'
  | 'tools'
  | 'shield'
  | 'star'
  | 'alert';

export type ClientFeedItem = {
  id: string;
  title: string;
  body: string | null;
  amount: number | null;
  /**
   * The one word on the end of the strong row — "Approved", "Due", "Paid".
   * Null where a status would only restate the title.
   */
  status: string | null;
  tone: FeedTone;
  icon: FeedIconName;
  actionUrl: string | null;
  /**
   * What the button says. "Open" told somebody nothing about what they were
   * opening, on a row that might be a $1,750 payment request or a review form.
   */
  actionLabel: string | null;
  /**
   * Dates offered, already formatted, when this event IS an offer of dates.
   * Empty for every other kind — a list, because it was always a list.
   */
  options: string[];
  at: string;
  /**
   * When the contractor rewrote this update, if they did.
   *
   * Shown to the customer, not only to the person who changed it. If somebody
   * read "we'll be there Tuesday" and it now says Thursday, the person who
   * needs to know it moved is the one who planned their week around it.
   */
  editedAt: string | null;
};

/**
 * What the customer sees, per kind — a DESIGNED PRESENTATION, not a database
 * row with a friendlier label on it.
 *
 * The feed used to be a title, a body and a timestamp, which meant every event
 * looked exactly as important as every other one and the page read as an audit
 * log. A homeowner scanning it cannot tell "quote prepared" from "$1,750 due
 * on Friday" without reading both in full. So each kind now carries the five
 * things that let it be laid out rather than merely printed: the words, the
 * glyph, the color, the status, and what its button should say.
 */
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
  icon: FeedIconName;
  tone: FeedTone;
  /** Omitted where a status word would only repeat the title back. */
  status?: string;
  /**
   * The words on the button. Its presence is also what keeps the stored
   * action_url — a row with nowhere useful for a client to go has neither.
   */
  action?: string;
};

/**
 * The whole customer-visible vocabulary. Add a kind here, with a title in the
 * homeowner's language and an explicit decision about its body, or it does not
 * appear on their page.
 */
export const CLIENT_FEED_KINDS: Record<string, Rendering> = {
  // The job's own arrival. Its stored body is formatJobQuoteSummary output —
  // the contractor's internal précis — so it is always replaced.
  job_created: { title: 'Quote prepared', body: 'own', note: 'Your personalized quote is ready to review.', icon: 'doc', tone: 'info', status: 'Ready' },
  quote_approved: { title: 'Quote approved', body: 'own', icon: 'check', tone: 'good', status: 'Completed' },
  // A quote edited AFTER approval. Client-visible on purpose: the number on
  // this page changing under somebody who already agreed to it is the whole
  // reason the revision gate exists. See saveQuoteItemsAction.
  quote_revised: { title: 'Your quote was updated', body: 'pass', icon: 'doc', tone: 'info', status: 'Updated' },

  // Six different situations shared this one kind and this one title, so a page
  // could show "Start date" three times in a row meaning three different
  // things. Retitled per situation from the row's own meta — see shapeScheduled.
  job_scheduled: { title: 'Start date', body: 'pass', icon: 'calendar', tone: 'info' },
  job_started: { title: 'Work started', body: 'pass', icon: 'tools', tone: 'info', status: 'In progress' },
  job_completed: { title: 'Work finished', body: 'pass', icon: 'check', tone: 'good', status: 'Completed' },
  job_update: { title: 'Update from your contractor', body: 'pass', icon: 'message', tone: 'info' },
  client_question: { title: 'You asked a question', body: 'pass', icon: 'message', tone: 'info', status: 'Sent' },

  milestone_submitted: { title: 'A stage was completed', body: 'pass', icon: 'tools', tone: 'good', status: 'Completed' },

  selection_requested: { title: 'Choices to make', body: 'pass', icon: 'message', tone: 'due', status: 'Needs you', action: 'View your choices' },
  selection_chosen: { title: 'Your choice was saved', body: 'pass', icon: 'check', tone: 'good', status: 'Saved' },
  selection_question: { title: 'Your question was sent', body: 'pass', icon: 'message', tone: 'info', status: 'Sent' },

  change_order_sent: { title: 'A change to your quote', body: 'pass', icon: 'doc', tone: 'due', status: 'Needs you', action: 'Review the change' },
  change_order_approved: { title: 'You approved the change', body: 'pass', icon: 'check', tone: 'good', status: 'Approved' },
  change_order_declined: { title: 'You declined the change', body: 'pass', icon: 'doc', tone: 'info', status: 'Declined' },

  warranty_started: { title: 'Your warranty started', body: 'pass', icon: 'shield', tone: 'good', status: 'Active' },
  warranty_claim: { title: 'Warranty claim received', body: 'pass', icon: 'shield', tone: 'info', status: 'Received' },

  review_requested: { title: 'Review request', body: 'pass', icon: 'star', tone: 'info', action: 'Leave a review' },

  payment_requested: { title: 'Payment requested', body: 'pass', icon: 'card', tone: 'due', status: 'Due', action: 'View payment request' },
  payment_paid: { title: 'Payment received', body: 'pass', icon: 'receipt', tone: 'good', status: 'Paid' },
  payment_failed: { title: 'A payment didn’t go through', body: 'pass', icon: 'alert', tone: 'due', status: 'Needs you', action: 'Try the payment again' },
  payment_cancelled: { title: 'Payment request cancelled', body: 'pass', icon: 'card', tone: 'info', status: 'Cancelled' },
  payment_refunded: { title: 'Refund issued', body: 'pass', icon: 'receipt', tone: 'good', status: 'Refunded' },
  recurring_charge_skipped: { title: 'A scheduled charge was skipped', body: 'pass', icon: 'card', tone: 'info', status: 'Skipped' },

  payment_plan_active: { title: 'Payment plan started', body: 'pass', icon: 'card', tone: 'good', status: 'Active' },
  payment_plan_paid_off: { title: 'Paid in full', body: 'pass', icon: 'receipt', tone: 'good', status: 'Paid' },

  invoice_sent: { title: 'Invoice sent', body: 'pass', icon: 'doc', tone: 'info', action: 'View invoice' },
  invoice_signed: { title: 'You signed the invoice', body: 'pass', icon: 'check', tone: 'good', status: 'Signed' },
  invoice_paid: { title: 'Invoice paid', body: 'pass', icon: 'receipt', tone: 'good', status: 'Paid' },
  invoice_voided: { title: 'Invoice cancelled', body: 'pass', icon: 'doc', tone: 'info', status: 'Cancelled' },
  invoice_signoff_link: {
    title: 'Invoice ready to sign',
    body: 'own',
    note: 'Review the work and sign it off.',
    icon: 'doc',
    tone: 'due',
    status: 'Needs you',
    action: 'Review and sign',
  },
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

/**
 * An email address, WITH the little word that introduced it.
 *
 * The address alone was being cut out and the sentence left standing, so a
 * homeowner's own page read:
 *
 *   "The quote was updated to $3,500 and the link was emailed to ."
 *
 * — which looks like the page failed to load something, on a screen whose one
 * job is to be trusted with a number. The clause has to go with the address it
 * was holding. Note the preposition must be immediately followed by the
 * address: "updated to $3,500" keeps its "to".
 */
const EMAIL_CLAUSE = /(?:\s+\b(?:to|at|from|for|with|by|cc|via)\b)?\s*\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;

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
    .replace(EMAIL_CLAUSE, '')
    // Close the gap the removal left. Without this a sentence ends " ." even
    // when the clause went cleanly.
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return cleaned || null;
}

/* --- dates, as somebody says them out loud --------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function clockLabel(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours) || hours > 23) return null;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

/**
 * "Aug 11 at 11:17 PM".
 *
 * The feed read "Aug 11, 11:17 PM", which is a spreadsheet cell. The word "at"
 * costs three characters and turns a value into a sentence somebody can say.
 */
export function formatFeedMoment(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '';
  const day = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

/**
 * "Tue, Aug 18 · 9:00 AM" — an offered start date, one per line.
 *
 * Built from the parts rather than from a Date, because the stored value is a
 * plain YYYY-MM-DD with no time in it: handing that to `new Date()` reads it as
 * UTC midnight, which is the previous evening for every customer west of
 * Greenwich. A contractor offering the 18th would have offered the 17th.
 */
export function formatOfferedDate(option: { date?: unknown; time?: unknown }): string | null {
  const date = typeof option?.date === 'string' ? option.date : null;
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(year, month - 1, day);
  if (Number.isNaN(at.getTime())) return null;
  const label = `${WEEKDAYS[at.getDay()]}, ${MONTHS[month - 1]} ${day}`;
  const time = clockLabel(typeof option?.time === 'string' ? option.time : null);
  return time ? `${label} · ${time}` : label;
}

/** What the page knows that a single row cannot. All optional; all defaulted. */
export type ClientFeedContext = {
  businessName?: string;
  /** The job's own reference, so "you approved quote J-1004" can name it. */
  jobRef?: string | null;
  /**
   * Whether the date picker is on the page RIGHT NOW.
   *
   * The "Choose a date" button is only attached when it is. A button pointing
   * at #dates when the page renders no #dates is the exact dead anchor that
   * lib/client-next-step exists to prevent, and the feed is perfectly capable
   * of growing its own.
   */
  scheduleOpen?: boolean;
};

/** What a job_scheduled row overrides, once its meta has been read. */
type ScheduledShape = Partial<Pick<Rendering, 'title' | 'tone' | 'status' | 'action'>> & {
  note?: string | null;
  options?: string[];
  href?: string;
};

/**
 * SIX SITUATIONS, ONE `kind`.
 *
 * Dates offered, dates re-offered, a date picked, a date set by the owner, a
 * date removed, more dates asked for — every one of them writes
 * `kind: 'job_scheduled'`, and the page titled all six "Start date" and printed
 * whichever sentence the writer happened to compose. The worst of them was the
 * offer, whose body is a numbered list flattened into a paragraph:
 *
 *   "Schedule options were texted to Dana Whitfield: 1. Tue, Aug 18 · 9:00 AM
 *    2. Thu, Aug 20 · 9:00 AM 3. Fri, Aug 21 · 9:00 AM"
 *
 * Each writer already stored the structured version in `meta` and no reader
 * ever looked. This is that reader. A row with no meta — an old one, a seeded
 * one — falls through to exactly what it rendered before.
 */
function shapeScheduled(meta: Record<string, unknown> | null | undefined, context: ClientFeedContext): ScheduledShape {
  if (!meta) return {};

  const offered = Array.isArray(meta.options)
    ? (meta.options as Array<{ date?: unknown; time?: unknown }>).map(formatOfferedDate).filter((label): label is string => Boolean(label))
    : [];
  if (offered.length > 0) {
    // Orange while it is genuinely waiting on them, sage once it isn't: the
    // color is a claim about whether this is a task, so it has to track the
    // page's actual state rather than the row's age.
    return context.scheduleOpen
      ? {
          title: `${offered.length} start date${offered.length === 1 ? '' : 's'} available`,
          tone: 'due',
          status: 'Choose one',
          note: null,
          options: offered,
          action: 'Choose a date',
          href: '#dates',
        }
      : {
          title: `${offered.length} start date${offered.length === 1 ? '' : 's'} offered`,
          tone: 'info',
          note: null,
          options: offered,
        };
  }

  const picked = formatOfferedDate({ date: meta.selected_date, time: meta.selected_time });
  if (picked) {
    return { title: 'Start date confirmed', tone: 'good', status: 'Booked', note: `You chose ${picked}.` };
  }

  if (meta.needs_more_options === true) {
    return { title: 'You asked for different dates', tone: 'info', status: 'Sent' };
  }

  const booked = formatOfferedDate({ date: meta.scheduled_for, time: meta.scheduled_time });
  if (booked) {
    const business = context.businessName ?? 'Your contractor';
    return { title: 'Start date set', tone: 'good', status: 'Booked', note: `${business} booked you in for ${booked}.` };
  }

  // scheduled_for present in meta but null: the date came off the calendar.
  if ('scheduled_for' in meta && meta.scheduled_for === null) {
    return {
      title: 'Start date removed',
      tone: 'info',
      note: `${context.businessName ?? 'Your contractor'} will be in touch about a new date.`,
    };
  }

  return {};
}

/**
 * The feed, as the homeowner should see it. Unknown kinds render nothing.
 *
 * Two decisions per row, still: what it is ALLOWED to say (the kind table) and
 * what it actually says (the body rule). What is new is that it also decides
 * how the row should LOOK — glyph, color, status word, button words — so the
 * page lays events out rather than printing them in a uniform block where a
 * $1,750 request and "quote prepared" carry identical weight.
 */
export function toClientFeed(events: FeedEventLike[], context: ClientFeedContext = {}): ClientFeedItem[] {
  const items: ClientFeedItem[] = [];
  for (const event of events) {
    const rendering = CLIENT_FEED_KINDS[event.kind];
    if (!rendering) continue;

    const shape = event.kind === 'job_scheduled' ? shapeScheduled(event.meta, context) : {};

    // A shaped note wins over the stored prose; `note: null` means the row's
    // structured form says it all and a sentence would only repeat the list.
    const own = shape.note !== undefined ? shape.note : rendering.note ?? null;
    const body = 'note' in shape ? own : rendering.body === 'pass' ? clientSafeText(event.body) : own;

    const actionLabel = shape.action ?? rendering.action ?? null;
    const actionUrl = actionLabel ? shape.href ?? event.action_url : null;

    items.push({
      id: event.id,
      title: shape.title ?? renderTitle(event.kind, rendering.title, context),
      body: body ?? renderNote(event.kind, context),
      amount: event.amount,
      status: shape.status ?? rendering.status ?? null,
      tone: shape.tone ?? rendering.tone,
      icon: rendering.icon,
      // A label with no URL is a button that goes nowhere, so both or neither.
      actionUrl: actionUrl ?? null,
      actionLabel: actionUrl ? actionLabel : null,
      options: shape.options ?? [],
      at: event.created_at,
      editedAt: event.edited_at ?? null,
    });
  }
  return items;
}

/** The two headlines that read better with the contractor's own name in them. */
function renderTitle(kind: string, fallback: string, context: ClientFeedContext): string {
  if (kind === 'job_update' && context.businessName) return `Update from ${context.businessName}`;
  return fallback;
}

/**
 * The approval line, which is the one event a customer looks for by name.
 * "Thanks — your contractor has been notified" was true and anonymous; naming
 * the quote and the business is what makes it a receipt.
 */
function renderNote(kind: string, context: ClientFeedContext): string | null {
  if (kind !== 'quote_approved') return null;
  const quote = context.jobRef ? `quote ${context.jobRef}` : 'this quote';
  const business = context.businessName ?? 'Your contractor';
  return `You approved ${quote}. ${business} has been notified.`;
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
