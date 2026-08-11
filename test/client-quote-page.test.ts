import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toClientFeed, clientSafeText, clientJobStatus, CLIENT_FEED_KINDS, type FeedEventLike } from '@/lib/client-feed';
import { brandPaint, contrastRatio } from '@/lib/contractor-brand';

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));

const event = (over: Partial<FeedEventLike> = {}): FeedEventLike => ({
  id: 'e1',
  kind: 'job_update',
  title: 'Internal title',
  body: 'A note for the customer.',
  amount: null,
  action_url: null,
  created_at: '2026-08-11T10:00:00.000Z',
  ...over,
});

/* --- what the homeowner is shown ------------------------------------------ */

describe('clientSafeText strips what the intake form appended for the contractor', () => {
  // Exactly the shape HeroQuickForm builds, carried into jobs.scope by
  // convertLeadToJob and printed on the client page by the job_created event.
  const realWorld =
    'Large limb came down on the front lawn and needs removing.\n\n' +
    'AI estimate shown to the customer: $30-$80. Timing: Needed ASAP. ' +
    'Location given: Royal Oak. Contact preference: TEXT ONLY — asked not to be called.';

  it('keeps the homeowner’s own words', () => {
    expect(clientSafeText(realWorld)).toBe('Large limb came down on the front lawn and needs removing.');
  });

  it('removes the AI estimate, which sat beside a $3,500 quote', () => {
    const out = clientSafeText(realWorld) ?? '';
    expect(out).not.toContain('AI estimate');
    expect(out).not.toContain('$30');
  });

  it('removes the contact-preference flag, which is an operational note about a person', () => {
    expect(clientSafeText(realWorld) ?? '').not.toMatch(/TEXT ONLY|Contact preference/i);
  });

  it('removes the formatJobQuoteSummary preamble', () => {
    const summary = 'Job was added for Dana Whitfield. Quoted amount: $3,500. Estimated hours: 6. Address: 12 Elm St.';
    // "Address:" is not triage — it is where the work is — so it survives, and
    // the rest of the machine-written précis does not.
    const out = clientSafeText(summary) ?? '';
    expect(out).not.toContain('Job was added for');
    expect(out).not.toContain('Quoted amount');
    expect(out).not.toContain('Estimated hours');
  });

  it('un-echoes an email address', () => {
    expect(clientSafeText('Reach me at dana.whitfield@example.com any time.') ?? '').not.toContain('@example.com');
  });

  it('returns null when nothing but triage was there — an empty section beats a redacted one', () => {
    expect(clientSafeText('AI estimate was unavailable. Contact preference: text only.')).toBeNull();
    expect(clientSafeText('')).toBeNull();
    expect(clientSafeText(null)).toBeNull();
  });
});

describe('toClientFeed is a whitelist, not a filter', () => {
  it('renders nothing for a kind nobody has thought about', () => {
    expect(toClientFeed([event({ kind: 'internal_ops_thing', title: 'Crew reassigned' })])).toEqual([]);
  });

  it('never passes the job_created body through', () => {
    const [item] = toClientFeed([
      event({ kind: 'job_created', title: 'J-1004 created', body: 'Job was added for Dana. Quoted amount: $3,500. AI estimate shown to the customer: $30-$80.' }),
    ]);
    expect(item.title).toBe('Quote prepared');
    expect(item.body).toBe('Your quote is ready to review above.');
  });

  it('retitles events written from the contractor’s chair', () => {
    const [item] = toClientFeed([event({ kind: 'job_scheduled', title: 'Client selected a service date' })]);
    expect(item.title).toBe('Start date');
    expect(item.title).not.toMatch(/^Client /);
  });

  it('passes a body that was written for the customer, still scrubbed', () => {
    const [item] = toClientFeed([event({ kind: 'job_update', body: 'Running an hour late. Timing: Needed ASAP.' })]);
    expect(item.body).toBe('Running an hour late.');
  });

  it('only keeps an action link where the client has somewhere to go', () => {
    const [pay] = toClientFeed([event({ kind: 'payment_requested', action_url: '/pay/abc' })]);
    const [scheduled] = toClientFeed([event({ kind: 'job_scheduled', action_url: '/dashboard/jobs/xyz' })]);
    expect(pay.actionUrl).toBe('/pay/abc');
    expect(scheduled.actionUrl).toBeNull();
  });

  it('no whitelisted title is written in the contractor’s voice', () => {
    for (const [kind, rendering] of Object.entries(CLIENT_FEED_KINDS)) {
      expect(rendering.title, kind).not.toMatch(/\bclient\b/i);
      expect(rendering.title, kind).not.toMatch(/^(J-|Job )\w*\s*created/i);
    }
  });
});

/* --- the badge agrees with the ask ---------------------------------------- */

describe('clientJobStatus', () => {
  const base = { quoteApproved: true, depositDue: false, paymentDue: false, scheduleOpen: false, scheduledLabel: null, jobStatus: 'in_progress' };

  it('never says "New request" while a deposit is being asked for', () => {
    // The reported page: status "New request", body asking for $1,750.
    const unapproved = clientJobStatus({ ...base, quoteApproved: false, depositDue: true });
    expect(unapproved.label).toBe('Quote awaiting your approval');

    const approved = clientJobStatus({ ...base, depositDue: true });
    expect(approved.label).toBe('Approved — deposit due');
  });

  it('puts the blocking thing first', () => {
    // A deposit that gates scheduling outranks the scheduling it gates.
    expect(clientJobStatus({ ...base, depositDue: true, scheduleOpen: true }).label).toBe('Approved — deposit due');
    expect(clientJobStatus({ ...base, scheduleOpen: true }).label).toBe('Approved — choose a start date');
  });

  it('finishes honestly', () => {
    expect(clientJobStatus({ ...base, jobStatus: 'complete' }).label).toBe('Complete');
    expect(clientJobStatus({ ...base, jobStatus: 'complete', paymentDue: true }).label).toBe('Work finished — payment due');
  });

  it('names the date once there is one', () => {
    expect(clientJobStatus({ ...base, scheduledLabel: 'Fri, Aug 15' }).label).toBe('Scheduled · Fri, Aug 15');
  });
});

/* --- wearing the contractor's colour without breaking anything ------------ */

describe('brandPaint', () => {
  const rgbOf = (value: string): [number, number, number] => {
    const [r, g, b] = value.match(/\d+/g)!.map(Number);
    return [r, g, b];
  };
  const inkOf = (hex: string): [number, number, number] =>
    hex === '#ffffff' ? [255, 255, 255] : [18, 16, 14];

  it('picks the button label that can actually be read on the button', () => {
    expect(brandPaint('#166534')?.onAccent).toBe('#ffffff'); // deep green
    expect(brandPaint('#facc15')?.onAccent).toBe('#12100e'); // bright yellow
  });

  it('always picks the better of the two, for any colour a contractor can set', () => {
    const colours = ['#166534', '#facc15', '#1e3a8a', '#ff7a21', '#808080', '#000000', '#ffffff', '#7c3aed', '#00d1b2'];
    for (const hex of colours) {
      const paint = brandPaint(hex)!;
      const fill = rgbOf(paint.accent);
      const chosen = contrastRatio(fill, inkOf(paint.onAccent));
      const other = contrastRatio(fill, inkOf(paint.onAccent === '#ffffff' ? '#12100e' : '#ffffff'));
      expect(chosen, hex).toBeGreaterThanOrEqual(other);
      // Black-or-white against any hue clears AA large / UI text at worst.
      expect(chosen, hex).toBeGreaterThanOrEqual(3);
    }
  });

  it('accepts shorthand hex and refuses anything it cannot read', () => {
    expect(brandPaint('#0a0')?.accent).toBe('rgb(0, 170, 0)');
    expect(brandPaint('chartreuse')).toBeNull();
    expect(brandPaint('')).toBeNull();
    expect(brandPaint(null)).toBeNull();
  });
});

/* --- the page itself ------------------------------------------------------ */

describe('the client job page asks in the right order', () => {
  const page = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
  // The <main> className became a template literal when the page started
  // wearing one of three style classes, so this anchors on the class rather
  // than on the whole attribute.
  const mainAt = page.indexOf('client-job-dashboard ${quoteStyleClass');
  const body = page.slice(mainAt);

  it('found the page body, so nothing below is vacuously true', () => {
    expect(mainAt).toBeGreaterThan(-1);
  });

  it('shows the quote before it asks for money', () => {
    const quote = body.indexOf('{quoteSection}');
    const payments = body.indexOf('{paymentsSection}');
    const plan = body.indexOf('{planSection}');
    expect(quote).toBeGreaterThan(-1);
    expect(payments).toBeGreaterThan(quote);
    expect(plan).toBeGreaterThan(quote);
  });

  it('offers the start date before it asks for money too', () => {
    expect(body.indexOf('{paymentsSection}')).toBeGreaterThan(body.indexOf('{scheduleSection}'));
  });

  it('does not offer the card-authorization form until the quote is approved', () => {
    // The plan card's contents moved into PayChoice when the routes became two
    // selectable cards. The rule did not: the card authorization is gated on
    // the quote already being accepted, and until then the schedule is shown
    // as a preview with "you'll set it up after you approve".
    const choice = read('src', 'app', 'client', 'jobs', '[token]', 'PayChoice.tsx');
    const gate = choice.indexOf('awaitingApproval ? (');
    const form = choice.indexOf('action={authorizeAction}');
    expect(gate).toBeGreaterThan(-1);
    expect(form).toBeGreaterThan(gate);
    expect(choice).toContain('client-plan-later');
    expect(page).toContain('awaitingApproval={awaitingApproval}');
  });

  it('states the schedule’s own total, since the copy promises it splits the total', () => {
    expect(read('src', 'app', 'client', 'jobs', '[token]', 'PayChoice.tsx')).toContain('client-plan-sum');
  });

  it('collects a signature against the quote, separately from the card authorization', () => {
    // The signature moved to the summary rail, beside the total it signs for.
    // It is still its OWN agreement — the card authorization collects a second
    // name of its own, and says so.
    const accept = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteAcceptance.tsx');
    const choice = read('src', 'app', 'client', 'jobs', '[token]', 'PayChoice.tsx');
    expect(accept).toContain('name="signerName"');
    expect(accept).toContain('Type your full name to accept this quote');
    expect(choice).toContain('name="signerName"');
    expect(choice).toMatch(/This is separate\s+from your approval of the quote/);
  });

  it('gives somebody who is not ready a door that is not "Approve"', () => {
    expect(page).toContain('askQuoteQuestionAction');
    expect(page).toContain('Ask a question');
  });

  it('names who processes the card, where the card is asked for', () => {
    expect(page).toContain('processed securely by Stripe');
  });

  it('leads with the job rather than the customer’s name in display caps', () => {
    expect(page).toContain('client-hero-title');
    expect(page).toContain('firstNameOf');
    expect(page).not.toMatch(/<h1[^>]*>\{dashboard\.job\.client_name\}/);
  });

  it('is printable, and says so', () => {
    const quote = read('src', 'app', 'client', 'jobs', '[token]', 'QuoteDocument.tsx');
    expect(quote).toContain('Print or save as PDF');
    // A bare button inside the approval form would submit it.
    expect(quote).toMatch(/type="button"[\s\S]{0,120}quote-doc-print/);
    expect(readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8')).toContain('@media print');
  });

  it('wears the contractor’s colour, with the platform palette as the fallback', () => {
    expect(page).toContain('brandPaint');
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    expect(css).toContain('var(--cbrand, #ff8a3d)');
    expect(css).toContain('.client-job-dashboard .btn.primary');
  });
});
