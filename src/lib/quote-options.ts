import type { QuoteItem } from '@/lib/jobs';

/**
 * Changing your mind about the optional extras, after you already said yes.
 *
 * A homeowner approves a quote three weeks before the crew arrives, and in
 * those three weeks they decide they do want the gate after all — or that the
 * pressure-washing can wait until spring. Until now the only route was ringing
 * the contractor, who then edited the quote from their side, which changed the
 * number on the customer's page underneath them and needed its own revision
 * warning. The customer making their own change is both easier and a better
 * record: nobody has to remember what was agreed on the phone.
 *
 * WHAT MAY CHANGE, AND WHAT MAY NOT. Optional add-ons only. The base scope and
 * its price are the contractor's quote, not a menu, and a subscription is a
 * separate agreement with its own signup. So this can move the total by the
 * value of the extras and by nothing else.
 *
 * OFF UNTIL A CONTRACTOR TURNS IT ON. Defaulting this to on would hand every
 * existing customer the ability to drop work the morning of, from materials
 * already bought, without the contractor having agreed to any of it. It is
 * their livelihood and their decision — see accounts.client_quote_changes.
 */

/** Why the extras cannot be changed right now. Order matters — see below. */
export type OptionsClosedReason =
  | 'not-approved'
  | 'off'
  | 'nothing-optional'
  | 'finished'
  | 'started'
  | 'starts-today'
  | 'plan-authorized'
  | 'settled';

export type OptionsWindow =
  | {
      open: true;
      /** The last day changes are accepted, YYYY-MM-DD. Null when unscheduled. */
      until: string | null;
      /**
       * The new total may not fall below this. Money already taken cannot be
       * un-taken by unticking a box — that is a refund, and a refund is a
       * decision a contractor makes, not a side effect of a checkbox.
       */
      floor: number;
    }
  | { open: false; reason: OptionsClosedReason };

export type OptionsWindowInput = {
  approved: boolean;
  /** The contractor's switch. Off by default. */
  allowed: boolean;
  hasAddons: boolean;
  jobStatus: string;
  /** Set when somebody pressed "Job started". Null means nobody has. */
  startedAt: string | null;
  /** YYYY-MM-DD, or null for a job with no date yet. */
  scheduledFor: string | null;
  /** Today in the CONTRACTOR's timezone — the crew's day, not the browser's. */
  today: string;
  planStatus: string | null;
  planAuthorized: boolean;
  /** Confirmed-paid money against this job, in dollars. */
  paidToDate: number;
};

/**
 * Whether the extras are still open, and if not, why.
 *
 * The order of these checks is the order of their consequences. "Work has
 * already started" is a truer answer than "your job starts today", and both are
 * truer than "your contractor has this switched off" — telling somebody a
 * setting is off when the real reason is that the crew is on their roof would
 * send them to argue with the wrong person.
 */
export function quoteOptionsWindow(input: OptionsWindowInput): OptionsWindow {
  // Before approval the extras are editable anyway, as part of the quote. This
  // is about the window AFTER yes, so an unapproved quote is not "closed" in a
  // way anybody should be told about.
  if (!input.approved) return { open: false, reason: 'not-approved' };
  if (input.jobStatus === 'complete' || input.jobStatus === 'archived') return { open: false, reason: 'finished' };
  if (input.startedAt) return { open: false, reason: 'started' };
  if (!input.hasAddons) return { open: false, reason: 'nothing-optional' };
  if (!input.allowed) return { open: false, reason: 'off' };

  // An authorized plan has dated instalments already agreed against a fixed
  // total. Moving the total would silently change what a saved card is charged,
  // which is not something a checkbox may do.
  if (input.planStatus === 'active' || (input.planStatus === 'pending_deposit' && input.planAuthorized)) {
    return { open: false, reason: 'plan-authorized' };
  }

  // The day the crew arrives, the scope stops being a conversation. Closed AT
  // the start of that day rather than the end of it: a change made at 7am on
  // the morning of is a change made to a van that is already loaded.
  if (input.scheduledFor && input.today >= input.scheduledFor) return { open: false, reason: 'starts-today' };

  return { open: true, until: input.scheduledFor, floor: Math.max(0, input.paidToDate) };
}

/**
 * What to tell somebody, in their words rather than ours.
 *
 * 'not-approved' and 'nothing-optional' return null on purpose: both mean there
 * is nothing to say, and a page that explains why a control they never saw is
 * missing has invented a problem to apologise for.
 */
export function optionsClosedCopy(reason: OptionsClosedReason, businessName: string): string | null {
  switch (reason) {
    case 'not-approved':
    case 'nothing-optional':
      return null;
    case 'off':
      return `Message ${businessName} if you'd like to change anything — they'll update your quote for you.`;
    case 'finished':
      return 'This job is finished, so the options are closed.';
    case 'started':
      return `Work has started, so the options are locked. Speak to ${businessName} about anything you'd like changed.`;
    case 'starts-today':
      return `Your job starts today, so the options are closed. Call ${businessName} if something has to change.`;
    case 'plan-authorized':
      return `Your payment plan is set up against this total, so changes go through ${businessName} — they'll redo the schedule with you.`;
    case 'settled':
      return 'This job is paid in full, so the options are closed.';
  }
}

/**
 * The extras as they stand, with a new set ticked. Base lines and subscriptions
 * pass through untouched — this function is the reason a customer changing
 * their mind can never change what the work is or what the base costs.
 */
export function applyOptionChoice(items: QuoteItem[], addonIds: string[]): QuoteItem[] {
  const chosen = new Set(addonIds);
  return items.map((item) => (item.kind === 'addon' ? { ...item, selected: chosen.has(item.id) } : item));
}

export type OptionChange = {
  added: string[];
  removed: string[];
  changed: boolean;
};

/** What actually moved, by name, for the record and for the contractor's email. */
export function describeOptionChange(items: QuoteItem[], addonIds: string[]): OptionChange {
  const chosen = new Set(addonIds);
  const added: string[] = [];
  const removed: string[] = [];
  for (const item of items) {
    if (item.kind !== 'addon') continue;
    if (chosen.has(item.id) && !item.selected) added.push(item.label);
    if (!chosen.has(item.id) && item.selected) removed.push(item.label);
  }
  return { added, removed, changed: added.length > 0 || removed.length > 0 };
}

/** "Added the gate. Removed pressure washing." — one line, in plain words. */
export function optionChangeSentence(change: OptionChange): string {
  const parts: string[] = [];
  if (change.added.length > 0) parts.push(`Added ${change.added.join(', ')}`);
  if (change.removed.length > 0) parts.push(`Removed ${change.removed.join(', ')}`);
  return parts.length > 0 ? `${parts.join('. ')}.` : 'No change.';
}

/** Today where the crew is, not where the phone is. */
export function todayIn(timezone: string | null | undefined, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    // An unset or invalid timezone must never throw on a customer's page. UTC
    // can close the window a few hours out; a stack trace closes the page.
    return now.toISOString().slice(0, 10);
  }
}
