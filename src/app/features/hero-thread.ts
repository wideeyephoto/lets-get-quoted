import { clientJobDashboardText, paymentText } from '@/lib/sms-templates';

/**
 * The thread that sits beside the hero copy on /features.
 *
 * WHY IT REPLACED THE PIPELINE. The hero used to carry a five-card strip of
 * stage names — WEBSITE, INTAKE, QUOTE, SCHEDULE, PAYMENT — which is a process
 * diagram rather than a product. Five equal boxes make five equal claims and
 * none of them is big enough to read as software. This says the same thing by
 * running one job past the reader instead of labelling its parts.
 *
 * THE OUTGOING MESSAGES ARE NOT WRITTEN HERE. Every `out` body is built by the
 * same function that sends it, so this page cannot drift from what a customer
 * actually receives. That mattered enough to extract every template into
 * lib/sms-templates in the first place: two previews had already gone stale
 * against their senders and nothing failed when they did. A marketing page
 * quoting a message it retyped is exactly that failure with a bigger audience.
 *
 * It also means the opt-out line shows up in the hero, which is the point — a
 * contractor looking at this can see the compliance sentence riding on their
 * own texts without being told about it.
 *
 * The two rows that are NOT builder output are honest about why: the inbound
 * reply is a customer's own words, and the intake summary is a rendering of the
 * lead record rather than a text message.
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
  jobRef: 'J-1048',
  quoteLink: 'lgq.co/j/1048',
  payLink: 'lgq.co/p/1048',
} as const;

export type HeroThreadRow =
  /** The software acting: no bubble, because nobody typed it. */
  | { kind: 'event'; id: string; time: string; text: string; tone: 'neutral' | 'paid' }
  /** The lead record, not a message — Smart Intake reading what came in. */
  | { kind: 'intake'; id: string; time: string; summary: string; signals: readonly (readonly [string, string])[] }
  /** A real outgoing text, built by the sender's own builder. */
  | { kind: 'out'; id: string; time: string; body: string }
  /** The customer, in their own words. */
  | { kind: 'in'; id: string; time: string; body: string };

export const HERO_THREAD: readonly HeroThreadRow[] = [
  {
    kind: 'event',
    id: 'request',
    time: '7:41 AM',
    text: 'Request from your website',
    tone: 'neutral',
  },
  {
    kind: 'intake',
    id: 'intake',
    time: '7:41 AM',
    summary:
      'Eight recessed cans in a 1960s kitchen, existing ceiling, wants it finished this month. Asked whether the run can be dimmable.',
    signals: [
      ['Budget', '$3–5k'],
      ['Urgency', 'This month'],
      ['Ranked', 'First of nine'],
    ],
  },
  {
    kind: 'out',
    id: 'quote',
    time: '9:41 AM',
    body: clientJobDashboardText({
      businessName: SAMPLE.business,
      jobRef: SAMPLE.jobRef,
      link: SAMPLE.quoteLink,
      includesScheduleOptions: true,
    }),
  },
  {
    kind: 'in',
    id: 'reply',
    time: '9:58 AM',
    body: 'Approved — Tuesday morning works for us.',
  },
  {
    kind: 'out',
    id: 'deposit',
    time: '9:59 AM',
    body: paymentText({
      contractor: SAMPLE.business,
      label: 'deposit',
      amount: 2125,
      link: SAMPLE.payLink,
      eventType: 'payment_requested',
    }),
  },
  {
    kind: 'event',
    id: 'booked',
    time: '10:02 AM',
    text: 'Deposit paid · Tuesday 9–11 held · crew notified',
    tone: 'paid',
  },
];

export const HERO_THREAD_JOB = SAMPLE.jobRef;
export const HERO_THREAD_CLIENT = SAMPLE.client;
export const HERO_THREAD_FIRST = SAMPLE.first;
