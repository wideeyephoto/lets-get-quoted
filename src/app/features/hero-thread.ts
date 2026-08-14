import { clientJobDashboardText, jobUpdateText, paymentText } from '@/lib/sms-templates';

/**
 * The script the hero simulation on /features plays: one job, from quote sent
 * to booked, in about ten seconds.
 *
 * WHY IT REPLACED THE PIPELINE, AND THEN THE STATIC THREAD. The hero used to
 * carry a five-card strip of stage names — WEBSITE, INTAKE, QUOTE, SCHEDULE,
 * PAYMENT — which is a process diagram rather than a product. What replaced it
 * was better: one job printed as a thread. But a printed thread is still a
 * picture of a conversation, and the thing this page is actually selling is
 * that the conversation MOVES — a text goes out, the customer does something
 * in their dashboard, and the job's status changes without anybody retyping
 * anything. That is a sequence, so it is played rather than printed.
 *
 * THE OUTGOING MESSAGES ARE NOT WRITTEN HERE. Every `body` is built by the same
 * function that sends it, so this page cannot drift from what a customer
 * actually receives. That mattered enough to extract every template into
 * lib/sms-templates in the first place: two previews had already gone stale
 * against their senders and nothing failed when they did. A marketing page
 * quoting a message it retyped is exactly that failure with a bigger audience.
 *
 * It also means the opt-out line shows up in the hero, which is the point — a
 * contractor looking at this can see the compliance sentence riding on their
 * own texts without being told about it.
 *
 * WHAT CAME OUT, AND WHY IT WAS WRONG. The old thread had the customer replying
 * "Approved — Tuesday morning works for us." by text. Nothing in the product
 * works that way: the homeowner accepts the quote and picks a time in their own
 * dashboard, and the contractor's software watches that happen. A blue bubble
 * saying otherwise taught the wrong mental model of the one mechanism the page
 * exists to explain. So acceptance, time selection and payment are all
 * DASHBOARD_EVENTS now — drawn as overlays that float over the thread and
 * leave, never as messages in it.
 */

/**
 * One invented job, kept local rather than shared with the outgoing-text
 * catalogue on the messages page. That catalogue runs a lawn-and-landscape
 * business on purpose — thirty messages read better as one continuous thread —
 * while this page has carried Alex Morgan's kitchen since it was a pipeline,
 * and a suite page argues wider with an interior trade than with a lawn.
 */
const SAMPLE = {
  business: 'Northline Electric',
  client: 'Alex Morgan',
  first: 'Alex',
  area: 'Royal Oak',
  jobRef: 'J-1048',
  quoteLink: 'lgq.co/j/1048',
  payLink: 'lgq.co/p/1048',
  deposit: 2125,
} as const;

/** A real outgoing text, built by the sender's own builder. */
export type HeroSms = {
  id: string;
  /** Milliseconds from the start of the sequence. */
  at: number;
  body: string;
  /**
   * The substring of `body` that is a link, so the component can draw it as a
   * link without making it one. Nothing in this panel navigates: lgq.co/j/1048
   * is an illustration of a short link, and a real anchor pointing at it would
   * be a marketing page shipping a dead click.
   */
  link: string;
};

export const HERO_SMS: readonly HeroSms[] = [
  {
    id: 'quote',
    at: 600,
    body: clientJobDashboardText({
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      link: SAMPLE.quoteLink,
      includesScheduleOptions: true,
    }),
    link: SAMPLE.quoteLink,
  },
  {
    id: 'deposit',
    at: 5000,
    body: paymentText({
      contractor: SAMPLE.business,
      label: 'deposit',
      amount: SAMPLE.deposit,
      link: SAMPLE.payLink,
      eventType: 'payment_requested',
    }),
    link: SAMPLE.payLink,
  },
  {
    id: 'booked',
    at: 9400,
    body: jobUpdateText({
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      title: 'Booked for Tuesday, 9–11 AM',
      body: 'Your crew has been notified.',
    }),
    link: '',
  },
];

/**
 * What the homeowner did, where they actually did it.
 *
 * Drawn as a card that floats over the thread and leaves again, labeled with
 * the surface it happened on. Never a bubble: the whole point of the panel is
 * that these are not text messages, and a reader who takes "Quote accepted" for
 * an SMS has learned the one thing about the product that is not true.
 */
export type HeroDashboardEvent = {
  id: string;
  /** When the card appears, and when it starts leaving. */
  at: number;
  until: number;
  headline: string;
  detail: string;
};

export const HERO_DASHBOARD_EVENTS: readonly HeroDashboardEvent[] = [
  {
    id: 'accepted',
    at: 2600,
    until: 4300,
    headline: 'Quote accepted',
    detail: 'Tuesday, 9–11 AM selected',
  },
  {
    id: 'paid',
    at: 7000,
    until: 8700,
    headline: `Deposit paid · $${SAMPLE.deposit.toLocaleString('en-US')}`,
    detail: 'Appointment confirmed',
  },
];

/**
 * The job's status, which only ever moves forward.
 *
 * Each step is set as its overlay leaves, and it stays set — that is the claim
 * the whole panel makes. An overlay that disappears without changing anything
 * behind it would be an animation; an overlay that leaves the header different
 * is a record being updated.
 */
export const HERO_STATUS: readonly { at: number; label: string; tone: 'sent' | 'held' | 'booked' }[] = [
  { at: 0, label: 'Quote sent', tone: 'sent' },
  { at: 4600, label: 'Tue 9–11', tone: 'held' },
  { at: 8900, label: 'Booked', tone: 'booked' },
];

/**
 * The lead record, pinned above the thread rather than printed in it.
 *
 * These three lines are not messages and were drawn as one for two releases —
 * a summary card sitting in the transcript where every other row was something
 * somebody sent. They are what the software already knows about the job when
 * the first text goes out, which is why they are visible before it does.
 */
export const HERO_CONTEXT: readonly string[] = [
  'Website request received',
  'Smart Intake completed',
  'Eight recessed cans · $3–5k · This month',
];

/** The last beat, so the component knows when to stop rather than guessing. */
export const HERO_RUNTIME = 10_500;

export const HERO_THREAD_JOB = SAMPLE.jobRef;
export const HERO_THREAD_CLIENT = SAMPLE.client;
export const HERO_THREAD_FIRST = SAMPLE.first;
export const HERO_THREAD_BUSINESS = SAMPLE.business;
export const HERO_THREAD_AREA = SAMPLE.area;

/**
 * The whole panel, in one sentence, for somebody who cannot see it.
 *
 * The visual itself is aria-hidden: it is a scripted marketing demo of one
 * invented job, and read out row by row as it animates it would announce a
 * half-finished conversation three times. This is what it says.
 */
export const HERO_SUMMARY = `A demonstration of one job for ${SAMPLE.client} in ${SAMPLE.area}. ${SAMPLE.business} texts a quote link; ${SAMPLE.first} accepts the quote, picks a Tuesday 9–11 AM slot and pays a $${SAMPLE.deposit.toLocaleString('en-US')} deposit in their customer dashboard; the job status moves from quote sent to booked and a confirmation text goes out. Every step after the first text happens in the dashboard, not by reply.`;
