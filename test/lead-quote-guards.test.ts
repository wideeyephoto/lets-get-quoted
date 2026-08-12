import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatElapsedTime, leadOverdueLabel } from '@/lib/leads';
// Not from LeadQuoteFields, which is a 'use client' module. The lead page is a
// server component and calls this to seed the gate; a plain function imported
// out of a client module by a server one arrives as a client reference and
// throws "quoteShape is not a function" in the browser. See quote-shape.ts.
import { quoteShape } from '@/app/dashboard/leads/[leadId]/quote-shape';
import { starterRepliesFor, STARTER_REPLIES, firstNameOf } from '@/lib/starter-replies';
import type { QuoteItem } from '@/lib/jobs';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const LEAD_PAGE = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'page.tsx');
const GATE = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'QuoteSendGate.tsx');
const SCHEDULER = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'LeadAvailabilityScheduler.tsx');
const CSS = read('src', 'app', 'globals.css');
const LITE = read('src', 'app', 'globals-lite.css');

const item = (over: Partial<QuoteItem> = {}): QuoteItem => ({
  id: 'x',
  label: 'Fence repair',
  amount: 400,
  kind: 'base',
  selected: true,
  recommended: false,
  ...over,
});

/* --- a $0 quote could be sent ---------------------------------------------- */

describe('what counts as a quote', () => {
  /**
   * THE REPORTED BUG. "Send quote" was live with a blank line-item
   * description, a blank price and a $0.00 total. The server did refuse it —
   * but only after the press, as a red sentence beside a button somebody had
   * already committed to.
   */
  it('needs a name AND a price, not either', () => {
    expect(quoteShape([item({ label: '  ', amount: 400 })]).billable).toBe(0);
    expect(quoteShape([item({ label: 'Fence repair', amount: 0 })]).billable).toBe(0);
    expect(quoteShape([item()]).billable).toBe(1);
  });

  it('counts the seed row the form starts with as nothing', () => {
    // page.tsx seeds one empty base row so the builder is not blank on arrival.
    const seed: QuoteItem = { id: 'seed-base', label: '', amount: 0, kind: 'base', selected: true, recommended: false };
    expect(quoteShape([seed])).toEqual({ billable: 0, subscriptions: 0, total: 0 });
  });

  /** A recurring plan at a $0 one-off total is a real quote. */
  it('accepts a subscription-only quote', () => {
    const shape = quoteShape([item({ kind: 'subscription', label: 'Monthly mowing', amount: 120 })]);
    expect(shape.billable).toBe(0);
    expect(shape.subscriptions).toBe(1);
  });

  it('leaves an unticked add-on out of the total, as the server does', () => {
    const shape = quoteShape([item(), item({ id: 'a', kind: 'addon', selected: false, amount: 250 })]);
    expect(shape.total).toBe(400);
    // Still billable: it is a real, named, priced line the client may accept.
    expect(shape.billable).toBe(2);
  });

  it('disables the button and says the rule, rather than teaching it by refusal', () => {
    expect(GATE).toContain('disabled={!stripeConnected || !hasQuote}');
    expect(GATE).toContain('a quote for $0.00 can’t be sent');
    expect(LEAD_PAGE).toContain('<QuoteSendGate');
  });

  /** The disabled button is a courtesy; convertLeadAction still decides. */
  it('does not move the check off the server', () => {
    expect(read('src', 'app', 'dashboard', 'leads', 'actions.ts'))
      .toContain('Add at least one line item or recurring plan worth $1 or more');
  });

  it('says who it reaches and for how much, next to the button', () => {
    expect(GATE).toContain('Sending <strong>{money}</strong>');
    expect(LEAD_PAGE).toContain('const quoteRecipientLabel =');
    // The same resolution the send makes, so it cannot describe a delivery
    // that will not happen.
    expect(LEAD_PAGE).toContain('resolveClientChannel({');
  });
});

/* --- urgency is not recency ------------------------------------------------ */

describe('how old a lead is, said in units people use', () => {
  /** It stopped at hours and never rolled over: "Received 265h ago". */
  it('rolls hours into days and days into weeks', () => {
    const at = (hours: number) => new Date(Date.UTC(2026, 7, 12, 12)).toISOString();
    const now = (hours: number) => new Date(Date.UTC(2026, 7, 12, 12) + hours * 3_600_000);
    expect(formatElapsedTime(at(0), now(0.5))).toBe('30m');
    expect(formatElapsedTime(at(0), now(6))).toBe('6h');
    expect(formatElapsedTime(at(0), now(47))).toBe('47h');
    expect(formatElapsedTime(at(0), now(265))).toBe('11 days');
    expect(formatElapsedTime(at(0), now(24 * 30))).toBe('4 weeks');
  });

  /**
   * "🔥 Hot" is a claim about the JOB; whether anybody answered is a claim
   * about us. The page showed one badge and let it mean both.
   */
  it('badges an unanswered lead as overdue, separately from its score', () => {
    const base = { status: 'new' as const, created_at: new Date(Date.UTC(2026, 7, 1, 12)).toISOString() };
    const now = new Date(Date.UTC(2026, 7, 12, 12));
    expect(leadOverdueLabel(base, now)).toBe('Overdue — no reply logged in 11 days');
    // Somebody has replied: not overdue, whatever its age.
    expect(leadOverdueLabel({ ...base, status: 'contacted' }, now)).toBeNull();
    // Arrived this morning: nothing to say.
    expect(leadOverdueLabel({ ...base, created_at: new Date(Date.UTC(2026, 7, 12, 6)).toISOString() }, now)).toBeNull();
  });

  it('stops calling an eleven-day-old lead fresh', () => {
    expect(LEAD_PAGE).toContain('🔥 Urgent request');
    // Comments out first — the badge's own note names what it replaced.
    const markup = LEAD_PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(markup).not.toContain('🔥 Hot lead');
    const deck = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'LeadActionDeck.tsx');
    expect(deck).toContain('overdueLabel');
    expect(deck).toContain("Book the visit or send a line so they know you're there.");
  });
});

/* --- two buttons that both sounded like booking ----------------------------- */

describe('booking a time versus offering one', () => {
  it('names the commitment and the offer', () => {
    expect(LEAD_PAGE).toContain("'Book this time'");
    expect(LEAD_PAGE).toContain("'Book this time anyway'");
    expect(SCHEDULER).toContain('Offer to client');
    expect(SCHEDULER).not.toContain("'+ Add'");
  });

  it('says which one commits, above the grid', () => {
    expect(SCHEDULER).toContain('puts the visit in your diary now');
    expect(SCHEDULER).toContain('nothing is booked until they pick one');
  });
});

/* --- the number already in the customer's head ------------------------------ */

describe('the intake estimate stays beside the quote editor', () => {
  it('is pinned in the form, not only in the triage notes', () => {
    expect(LEAD_PAGE).toContain('className={styles.quoteAnchor}');
    expect(LEAD_PAGE).toContain('on the intake form, before anyone saw the job');
  });

  /** Stated, not enforced: a range from a form is a guess, and a quote outside
   *  it is often the correct quote. */
  it('does not block a quote for disagreeing with it', () => {
    expect(LEAD_PAGE).not.toMatch(/estimate\.max[\s\S]{0,120}disabled/);
  });
});

/* --- the five messages ------------------------------------------------------ */

describe('starter replies', () => {
  it('ships five, none of which have to be written first', () => {
    expect(STARTER_REPLIES).toHaveLength(5);
    for (const reply of STARTER_REPLIES) {
      expect(reply.title.length, reply.id).toBeGreaterThan(2);
      expect(reply.body('Dana').length, reply.id).toBeGreaterThan(40);
    }
  });

  it('greets by first name, and degrades rather than greeting a phone number', () => {
    expect(starterRepliesFor('Dana Whitfield')[0].body).toContain('Hi Dana,');
    expect(starterRepliesFor(null)[0].body).toContain('Hi there,');
    expect(firstNameOf('2485550117')).toBeNull();
    expect(starterRepliesFor('2485550117')[0].body).toContain('Hi there,');
  });

  /**
   * They are first drafts. Nothing may promise a time, a price or a date the
   * app has not verified — a canned message that commits on the contractor's
   * behalf is worse than no canned message.
   */
  it('promises nothing the app cannot stand behind', () => {
    for (const reply of STARTER_REPLIES) {
      const body = reply.body('Dana');
      expect(body, reply.id).not.toMatch(/\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i);
      expect(body, reply.id).not.toMatch(/\$\d/);
    }
  });

  it('nothing is written to a database to make them exist', () => {
    const lib = read('src', 'lib', 'starter-replies.ts');
    expect(lib).not.toContain('supabase');
    expect(lib).not.toContain('insert');
  });

  it('is told apart from the replies a contractor saved', () => {
    expect(read('src', 'app', 'dashboard', 'messages', 'SavedReplies.tsx')).toContain('quick-reply-chip is-starter');
    expect(CSS).toContain('.quick-reply-chip.is-starter');
    expect(LITE).toContain('.quick-reply-chip.is-starter');
  });
});

/* --- anchors that land ------------------------------------------------------ */

describe('anchors clear the fixed bar', () => {
  /**
   * `.job-subnav` was `position: sticky; top: 0` — the top of the VIEWPORT,
   * which below 1080px is underneath .sidenav-mobilebar (fixed, z-index 20,
   * against this 6). The section nav scrolled up and stayed behind it.
   */
  it('docks the subnav below the bar instead of behind it', () => {
    const subnav = CSS.slice(CSS.indexOf('.job-subnav {'), CSS.indexOf('.job-subnav::-webkit-scrollbar'));
    expect(subnav).toContain('top: var(--appbar-h)');
    expect(subnav).not.toMatch(/top:\s*0;/);
  });

  it('declares the height once and uses it everywhere', () => {
    expect(CSS).toContain(':root { --appbar-h: 0rem; }');
    expect(CSS).toContain('@media (max-width: 1080px) { :root { --appbar-h: 4.4rem; } }');
    expect(CSS).toContain('.app-main-sidenav [id] { scroll-margin-top: calc(var(--appbar-h) + 1rem); }');
    expect(CSS).toContain('scroll-margin-top: calc(var(--appbar-h) + 3.75rem);');
  });

  it('ships to the sheet the app actually loads', () => {
    expect(LITE).toContain('--appbar-h');
  });
});

/**
 * A PLAIN FUNCTION CANNOT CROSS THE CLIENT BOUNDARY.
 *
 * quoteShape lived in LeadQuoteFields.tsx, which carries 'use client'. The lead
 * page is a server component and calls it to seed the send gate's opening
 * state — and a non-component export imported out of a client module by a
 * server one does not arrive as a function. It arrives as a client reference,
 * and calling it threw "quoteShape is not a function" on every load of the lead
 * detail page, in the browser, after the server render had already succeeded.
 */
describe('the send gate is wired across the client boundary correctly', () => {
  const shapeModule = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'quote-shape.ts');
  const fields = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'LeadQuoteFields.tsx');

  it('keeps quoteShape in a module with no directive', () => {
    // The first statement, which is where a directive has to be to count —
    // the file's own comment explains what 'use client' did to it.
    expect(shapeModule.split('\r\n').join('\n').split('\n')[0].trim()).toBe("import type { QuoteItem } from '@/lib/jobs';");
    expect(shapeModule).toContain('export function quoteShape');
    expect(shapeModule).toContain("export const QUOTE_ITEMS_EVENT");
  });

  it('has the server component import it from there', () => {
    expect(LEAD_PAGE).toContain("import { quoteShape } from './quote-shape';");
    expect(LEAD_PAGE).not.toContain("import { quoteShape } from './LeadQuoteFields';");
  });

  it('leaves the client side importing the same one', () => {
    expect(fields).toContain("from './quote-shape'");
    expect(GATE).toContain("from './quote-shape'");
    // One definition, so the builder and the button cannot disagree about what
    // counts as a quote.
    expect(fields).not.toContain('export function quoteShape');
  });
});
