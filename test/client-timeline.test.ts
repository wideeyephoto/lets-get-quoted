import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  toClientFeed,
  clientSafeText,
  formatFeedMoment,
  formatOfferedDate,
  CLIENT_FEED_KINDS,
  type FeedEventLike,
} from '@/lib/client-feed';

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));

const TIMELINE = read('src', 'app', 'client', 'jobs', '[token]', 'JobTimeline.tsx');
const PAGE = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
const CSS = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
const LITE = readFileSync(join(process.cwd(), 'src', 'app', 'globals-lite.css'), 'utf8').replace(/\r\n/g, '\n');

const event = (over: Partial<FeedEventLike> = {}): FeedEventLike => ({
  id: 'e1',
  kind: 'job_update',
  title: 'Internal title',
  body: 'A note for the customer.',
  amount: null,
  action_url: null,
  created_at: '2026-08-11T23:17:00.000Z',
  ...over,
});

const OFFER = [
  { date: '2026-08-18', time: '09:00' },
  { date: '2026-08-20', time: '09:00' },
  { date: '2026-08-21', time: '09:00' },
];

/* --- the start-date entry, which was the worst of them --------------------- */

describe('offered start dates arrive as a list, not as a paragraph', () => {
  /**
   * THE BUG THIS EXISTS FOR.
   *
   * Every writer of a scheduling event stores the options in `meta` and then
   * ALSO flattens them into a sentence for the body. Nothing read the meta, so
   * the homeowner's own page rendered:
   *
   *   "Start date — Schedule options were texted to Dana Whitfield:
   *    1. Tue, Aug 18 · 9:00 AM 2. Thu, Aug 20 · 9:00 AM 3. Fri, Aug 21 · 9:00 AM"
   *
   * The structured version was one column away the whole time.
   */
  it('titles by count and lists each date', () => {
    const [item] = toClientFeed(
      [
        event({
          kind: 'job_scheduled',
          title: 'Schedule options sent',
          body: 'Schedule options were texted to Dana Whitfield: 1. Tue, Aug 18 · 9:00 AM 2. Thu, Aug 20 · 9:00 AM 3. Fri, Aug 21 · 9:00 AM',
          meta: { options: OFFER },
        }),
      ],
      { scheduleOpen: true },
    );

    expect(item.title).toBe('3 start dates available');
    expect(item.options).toEqual(['Tue, Aug 18 · 9:00 AM', 'Thu, Aug 20 · 9:00 AM', 'Fri, Aug 21 · 9:00 AM']);
    // The serialized prose is gone entirely — including the customer's own name,
    // which was only ever in there because the contractor was the reader.
    expect(item.body).toBeNull();
  });

  it('says "1 start date available", not "1 start dates"', () => {
    const [item] = toClientFeed([event({ kind: 'job_scheduled', meta: { options: [OFFER[0]] } })], { scheduleOpen: true });
    expect(item.title).toBe('1 start date available');
  });

  it('offers the button only while there is something to choose', () => {
    const offer = event({ kind: 'job_scheduled', meta: { options: OFFER } });
    const [open] = toClientFeed([offer], { scheduleOpen: true });
    const [closed] = toClientFeed([offer], { scheduleOpen: false });

    expect(open.actionLabel).toBe('Choose a date');
    expect(open.actionUrl).toBe('#dates');
    // The dates STILL show — knowing what was offered is worth something after
    // the fact — but a button pointing at a #dates the page no longer renders
    // is the dead anchor lib/client-next-step exists to prevent.
    expect(closed.actionUrl).toBeNull();
    expect(closed.actionLabel).toBeNull();
    expect(closed.options).toHaveLength(3);
    expect(closed.title).toBe('3 start dates offered');
  });

  it('colours the offer by whether it is actually waiting on them', () => {
    const offer = event({ kind: 'job_scheduled', meta: { options: OFFER } });
    expect(toClientFeed([offer], { scheduleOpen: true })[0].tone).toBe('due');
    expect(toClientFeed([offer], { scheduleOpen: false })[0].tone).toBe('info');
  });

  it('tells the six situations behind one `kind` apart', () => {
    const shape = (meta: Record<string, unknown>) => toClientFeed([event({ kind: 'job_scheduled', meta })])[0];

    expect(shape({ selected_date: '2026-08-18', selected_time: '09:00' }).title).toBe('Start date confirmed');
    expect(shape({ selected_date: '2026-08-18', selected_time: '09:00' }).body).toBe('You chose Tue, Aug 18 · 9:00 AM.');
    expect(shape({ scheduled_for: '2026-08-18', scheduled_time: '09:00' }).title).toBe('Start date set');
    expect(shape({ scheduled_for: null }).title).toBe('Start date removed');
    expect(shape({ needs_more_options: true }).title).toBe('You asked for different dates');
  });

  /** Rows written before meta was read — seeded, imported, ancient — must not
   *  become blanks on somebody's page. */
  it('falls back to exactly what it always rendered when there is no meta', () => {
    const [item] = toClientFeed([event({ kind: 'job_scheduled', body: 'Scheduled for Aug 18.' })]);
    expect(item.title).toBe('Start date');
    expect(item.body).toBe('Scheduled for Aug 18.');
  });

  /**
   * A plain YYYY-MM-DD handed to `new Date()` is read as UTC midnight, which is
   * the previous evening everywhere west of Greenwich. The 18th would have been
   * offered as the 17th.
   */
  it('does not lose a day to the timezone', () => {
    expect(formatOfferedDate({ date: '2026-08-18', time: '09:00' })).toBe('Tue, Aug 18 · 9:00 AM');
    expect(formatOfferedDate({ date: '2026-08-18' })).toBe('Tue, Aug 18');
    expect(formatOfferedDate({ date: '2026-08-18', time: '13:30' })).toBe('Tue, Aug 18 · 1:30 PM');
    expect(formatOfferedDate({ date: '2026-08-18', time: '00:15' })).toBe('Tue, Aug 18 · 12:15 AM');
    expect(formatOfferedDate({ date: 'not a date' })).toBeNull();
    expect(formatOfferedDate({})).toBeNull();
  });
});

/* --- "the link was emailed to ." ------------------------------------------- */

describe('a scrubbed email does not leave a sentence hanging', () => {
  /**
   * THE REPORTED TEXT. The writer put the recipient in a client-visible body;
   * the client-side scrubber removes email addresses; the customer was left
   * reading "the link was emailed to ." on the page they are being asked to
   * trust with $3,500.
   */
  it('takes the clause with the address', () => {
    expect(clientSafeText('The quote was updated to $3,500 and the link was emailed to dana@example.com.')).toBe(
      'The quote was updated to $3,500 and the link was emailed.',
    );
  });

  it('leaves a "to" that was not holding an address alone', () => {
    expect(clientSafeText('The quote was updated to $3,500.')).toBe('The quote was updated to $3,500.');
  });

  it('closes the gap wherever the address was', () => {
    const out = clientSafeText('Reach me at dana.whitfield@example.com any time.') ?? '';
    expect(out).not.toContain('@example.com');
    expect(out).not.toMatch(/\s\./);
    expect(out).toBe('Reach me any time.');
  });

  /** And the writer stopped putting it there in the first place. */
  it('is no longer written into a client-visible row', () => {
    const actions = read('src', 'app', 'dashboard', 'jobs', 'actions.ts');
    expect(actions).not.toContain('the link was emailed to ${email}');
  });
});

/* --- the presentation is designed, not derived ----------------------------- */

describe('every customer-facing kind has a designed presentation', () => {
  it('carries a glyph and a colour, not just words', () => {
    for (const [kind, rendering] of Object.entries(CLIENT_FEED_KINDS)) {
      expect(rendering.icon, kind).toBeTruthy();
      expect(['good', 'due', 'info'], kind).toContain(rendering.tone);
    }
  });

  /**
   * The colours are a claim. Green must never appear on a row that is asking
   * for money, and orange must never appear on one announcing it arrived.
   */
  it('never paints an outstanding ask green', () => {
    for (const kind of ['payment_requested', 'payment_failed', 'invoice_signoff_link', 'change_order_sent', 'selection_requested']) {
      expect(CLIENT_FEED_KINDS[kind].tone, kind).toBe('due');
    }
    for (const kind of ['payment_paid', 'invoice_paid', 'quote_approved', 'job_completed', 'payment_plan_paid_off']) {
      expect(CLIENT_FEED_KINDS[kind].tone, kind).toBe('good');
    }
  });

  /** "Open" — of what? A $1,750 request and a review form said the same word. */
  it('names what its button opens', () => {
    for (const [kind, rendering] of Object.entries(CLIENT_FEED_KINDS)) {
      if (!rendering.action) continue;
      expect(rendering.action.length, kind).toBeGreaterThan(4);
      expect(rendering.action, kind).not.toBe('Open');
    }
    const [pay] = toClientFeed([event({ kind: 'payment_requested', action_url: '/pay/abc', amount: 1750 })]);
    expect(pay.actionLabel).toBe('View payment request');
    expect(pay.status).toBe('Due');
  });

  /** A label with no href is a button that does nothing; an href with no label
   *  is a link nobody can see. Both, or neither. */
  it('never renders half a button', () => {
    for (const kind of Object.keys(CLIENT_FEED_KINDS)) {
      for (const url of [null, '/somewhere']) {
        const [item] = toClientFeed([event({ kind, action_url: url })], { scheduleOpen: true });
        expect(Boolean(item.actionUrl), `${kind} ${url}`).toBe(Boolean(item.actionLabel));
      }
    }
  });

  it('names the quote and the business on the one event people look for', () => {
    const [item] = toClientFeed([event({ kind: 'quote_approved', amount: 3500 })], {
      businessName: 'Lawn & Order',
      jobRef: 'J-1004',
    });
    expect(item.title).toBe('Quote approved');
    expect(item.status).toBe('Completed');
    expect(item.body).toBe('You approved quote J-1004. Lawn & Order has been notified.');
    expect(item.amount).toBe(3500);
  });

  it('still says something sensible with no context at all', () => {
    const [item] = toClientFeed([event({ kind: 'quote_approved' })]);
    expect(item.body).toBe('You approved this quote. Your contractor has been notified.');
  });
});

/* --- dates a person can read out loud -------------------------------------- */

describe('timestamps', () => {
  it('reads "Aug 11 at 11:17 PM", not "Aug 11, 11:17 PM"', () => {
    // Built from a local-time construction so this asserts the FORMAT without
    // depending on the runner's timezone.
    const at = new Date(2026, 7, 11, 23, 17).toISOString();
    expect(formatFeedMoment(at)).toBe('Aug 11 at 11:17 PM');
    expect(formatFeedMoment(at)).not.toContain(',');
  });

  it('renders nothing rather than "Invalid Date"', () => {
    expect(formatFeedMoment('nonsense')).toBe('');
  });

  it('is the only formatter the timeline uses', () => {
    expect(TIMELINE).toContain('formatFeedMoment(item.at)');
    expect(PAGE).not.toContain('function formatFeedTime');
  });
});

/* --- the layout ------------------------------------------------------------ */

describe('the feed is laid out, not printed', () => {
  it('shows the recent ones and puts the rest behind a door', () => {
    expect(TIMELINE).toContain('const RECENT = 4');
    expect(TIMELINE).toContain('items.slice(0, RECENT)');
    expect(TIMELINE).toContain('View full history');
    // A <details>, so the history needs no client component on a page that is
    // otherwise entirely server-rendered.
    expect(TIMELINE).toContain('<details className="cfeed-more">');
    expect(TIMELINE).not.toContain("'use client'");
  });

  it('highlights the newest and nothing else', () => {
    expect(TIMELINE).toContain('latest={index === 0}');
    expect(CSS).toContain('.cfeed-item.is-latest');
    expect(CSS).toContain('.cfeed-item:not(.is-latest)');
  });

  it('puts title, amount and status on one row', () => {
    const head = CSS.slice(CSS.indexOf('.cfeed-head {'), CSS.indexOf('.cfeed-copy'));
    expect(head).toContain('display: flex');
    const markup = TIMELINE.slice(TIMELINE.indexOf('className="cfeed-head"'), TIMELINE.indexOf('cfeed-copy'));
    expect(markup).toContain('cfeed-title');
    expect(markup).toContain('cfeed-amount');
    expect(markup).toContain('cfeed-status');
  });

  /** One line down the whole feed, including through the disclosure — a rail
   *  that stops at the fold reads as the end of the list. */
  it('draws one continuous rail and terminates it at the last node', () => {
    expect(CSS).toContain('.cfeed-item::before');
    expect(CSS).toContain('.cfeed-more > summary::before');
    expect(CSS).toContain('.cfeed:last-child > .cfeed-item:last-child::before');
    expect(CSS).toContain('.cfeed-more:not([open]) > summary::before');
  });

  /**
   * The divider is inset past the rail. Run edge to edge and it draws a
   * crosshair through the line every few rows, which is the one thing a
   * continuous rail cannot survive.
   */
  it('drops the boxes for dividers, and keeps them off the rail', () => {
    const block = CSS.slice(CSS.indexOf('.cfeed-item {'), CSS.indexOf('.cfeed-item::before'));
    expect(block).not.toContain('border:');
    expect(block).not.toContain('border-radius');

    const divider = CSS.slice(CSS.indexOf('.cfeed-item + .cfeed-item::after'), CSS.indexOf('.cfeed-node {'));
    expect(divider).toContain('left: calc(30px + 0.8rem)');
    expect(divider).toContain('height: 1px');
  });

  /**
   * The old markup lives on in the CONTRACTOR's job detail feed, which is an
   * operational log and is supposed to look like one. Restyling .job-feed-*
   * would have redesigned a page nobody asked about.
   */
  it('does not disturb the contractor’s own feed', () => {
    expect(TIMELINE).not.toContain('job-feed-item');
    expect(read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx')).toContain('job-feed-item');
  });

  /** The client page loads the lite sheet; rules that landed only in
   *  globals.css would never reach a homeowner. */
  it('ships to the sheet the client page actually loads', () => {
    for (const rule of ['.cfeed-item', '.cfeed-action', '.cfeed-options', '.cfeed-more']) {
      expect(LITE, rule).toContain(rule);
    }
  });
});
