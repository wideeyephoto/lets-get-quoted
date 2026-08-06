import { describe, it, expect } from 'vitest';
import { leadBreakdown, leadHeadline, leadRailTitle, leadSummary, type LeadLike } from '@/lib/lead-summary';

// The dashboard was showing three different lead counts at once, all called
// leads, all correct, all different. The property that has to hold is that the
// breakdown ADDS UP to the headline — somebody should be able to check the
// arithmetic at a glance and stop wondering which number is real.

const lead = (status: LeadLike['status'], source?: string): LeadLike => ({ status, source: source ?? null });

const book: LeadLike[] = [
  lead('new', 'website_form'),
  lead('new', 'website_form'),
  lead('new', 'manual'),
  lead('contacted'),
  lead('contacted'),
  lead('quoted'),
  lead('quoted'),
  lead('quoted'),
  lead('won'),
  lead('lost'),
];

describe('leadSummary', () => {
  it('counts what is still being worked, and nothing else', () => {
    const summary = leadSummary(book);
    expect(summary.open).toBe(8);
    // A won lead IS the job sitting beside it on the dashboard. Counting it in
    // both places bills the same work twice.
    expect(summary.new + summary.contacted + summary.quoted).toBe(summary.open);
  });

  it('splits on whose move it is', () => {
    const summary = leadSummary(book);
    expect(summary.needsYou).toBe(5);          // 3 new + 2 contacted
    expect(summary.waitingOnCustomer).toBe(3); // quoted
    expect(summary.needsYou + summary.waitingOnCustomer).toBe(summary.open);
  });

  it('treats website leads as a subset of new, not an addition', () => {
    // This was the actual bug on screen: "2 website leads" and "5 leads
    // waiting" side by side read as seven people.
    const summary = leadSummary(book);
    expect(summary.fromWebsite).toBe(2);
    expect(summary.fromWebsite).toBeLessThanOrEqual(summary.new);
  });

  it('only counts a website lead while it is still new', () => {
    // Once you have replied it is not an unanswered stranger any more, whatever
    // it arrived as.
    const replied = leadSummary([lead('contacted', 'website_form'), lead('quoted', 'website_form')]);
    expect(replied.fromWebsite).toBe(0);
    expect(replied.open).toBe(2);
  });

  it('recognises the source names the product actually writes', () => {
    for (const source of ['website_form', 'website', 'quote_request', 'WEBSITE_FORM']) {
      expect(leadSummary([lead('new', source)]).fromWebsite, source).toBe(1);
    }
    for (const source of ['manual', 'import', 'phone', null, undefined]) {
      expect(leadSummary([lead('new', source ?? undefined)]).fromWebsite, String(source)).toBe(0);
    }
  });

  it('is all zeroes for an empty book', () => {
    const summary = leadSummary([]);
    expect(summary).toEqual({ open: 0, needsYou: 0, waitingOnCustomer: 0, new: 0, contacted: 0, quoted: 0, fromWebsite: 0 });
  });
});

describe('leadBreakdown', () => {
  it('adds up to the headline', () => {
    const summary = leadSummary(book);
    expect(leadHeadline(summary)).toBe('8 open leads');
    const line = leadBreakdown(summary);
    expect(line).toBe('2 new from your website · 1 other new · 2 contacted · 3 quoted, waiting on the customer');
    // The property, checked rather than eyeballed: every number in the sentence
    // sums to the headline.
    const numbers = [...line.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
    expect(numbers.reduce((sum, n) => sum + n, 0)).toBe(summary.open);
  });

  it('leaves out the parts that are zero', () => {
    // "0 waiting on the customer" is a fact nobody needed, and it crowds out
    // the ones that matter.
    expect(leadBreakdown(leadSummary([lead('new', 'website_form')]))).toBe('1 new from your website');
    expect(leadBreakdown(leadSummary([lead('quoted')]))).toBe('1 quoted, waiting on the customer');
    expect(leadBreakdown(leadSummary([lead('new', 'manual'), lead('contacted')]))).toBe('1 other new · 1 contacted');
  });

  it('still adds up when only some parts are present', () => {
    const cases: LeadLike[][] = [
      [lead('new', 'website_form'), lead('new', 'website_form')],
      [lead('contacted'), lead('quoted')],
      [lead('new', 'manual'), lead('new', 'website_form'), lead('quoted')],
      [lead('won'), lead('lost'), lead('new', 'website_form')],
    ];
    for (const leads of cases) {
      const summary = leadSummary(leads);
      const numbers = [...leadBreakdown(summary).matchAll(/(\d+)/g)].map((m) => Number(m[1]));
      expect(numbers.reduce((sum, n) => sum + n, 0), JSON.stringify(leads)).toBe(summary.open);
    }
  });

  it('says so plainly when there is nothing', () => {
    expect(leadBreakdown(leadSummary([lead('won')]))).toBe('Nothing waiting.');
  });
});

describe('leadHeadline / leadRailTitle', () => {
  it('pluralises', () => {
    expect(leadHeadline(leadSummary([lead('new')]))).toBe('1 open lead');
    expect(leadHeadline(leadSummary([lead('new'), lead('quoted')]))).toBe('2 open leads');
  });

  it('gives the rail the same story the dashboard tells', () => {
    // The rail badge and the dashboard disagreeing is the thing this whole
    // module exists to stop.
    expect(leadRailTitle(leadSummary(book))).toBe('8 open leads — 5 need your attention and 3 are waiting on the customer');
  });

  it('does not claim a split that does not exist', () => {
    expect(leadRailTitle(leadSummary([lead('new'), lead('contacted')]))).toBe('2 open leads, all needing your attention');
    expect(leadRailTitle(leadSummary([lead('quoted')]))).toBe('1 open lead, all waiting on the customer');
    expect(leadRailTitle(leadSummary([]))).toBe('No open leads');
  });
});
