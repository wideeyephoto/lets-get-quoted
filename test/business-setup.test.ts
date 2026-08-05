import { describe, it, expect } from 'vitest';
import { businessSetup, looksLikePoBox, setupHeadline, type BusinessFacts } from '@/lib/business-setup';

// The Business tab's "is my account set up?" summary. The interesting cases are
// all about NOT crying wolf: a checklist that raises an alarm for everything
// unfinished gets ignored, and then the one thing that is genuinely broken gets
// ignored with it.

const ready: BusinessFacts = {
  companyName: 'BrokePipes',
  trade: 'plumbing',
  zip: '48067',
  operatingAddress: '638 S Blair Ave, Royal Oak, MI 48067',
  mailingAddress: '638 S Blair Ave, Royal Oak, MI 48067',
  hasServiceCenter: true,
  burdenConfigured: true,
  burdenPct: 22,
  insurance: { kind: 'valid', daysLeft: 200 },
  quickBooksConnected: true,
};

const itemFor = (facts: BusinessFacts, id: string) => businessSetup(facts).items.find((item) => item.id === id)!;

describe('businessSetup', () => {
  it('counts a fully set-up account as finished', () => {
    const setup = businessSetup(ready);
    expect(setup.done).toBe(setup.total);
    expect(setup.alerts).toEqual([]);
    expect(setupHeadline(setup)).toBe('Everything essential is set up');
  });

  it('leaves QuickBooks out of the fraction', () => {
    // A business that keeps its books elsewhere must be able to reach the end of
    // the checklist. Counting an optional connection would leave them reading
    // "5 of 6" forever with nothing actually wrong.
    const without = businessSetup({ ...ready, quickBooksConnected: false });
    expect(without.done).toBe(without.total);
    expect(without.alerts).toEqual([]);
    expect(itemFor({ ...ready, quickBooksConnected: false }, 'quickbooks').state).toBe('todo');
  });

  it('does not raise an alert for something merely unstarted', () => {
    const fresh = businessSetup({
      ...ready,
      companyName: null, trade: null, zip: null,
      burdenConfigured: false,
      insurance: { kind: 'none' },
      quickBooksConnected: false,
    });
    // Profile, labor cost and insurance are all untouched — none of them is an
    // emergency, so the banner stays empty.
    expect(fresh.alerts.map((a) => a.id)).toEqual([]);
    expect(fresh.done).toBeLessThan(fresh.total);
  });

  it('names exactly what the profile is missing', () => {
    expect(itemFor({ ...ready, trade: null }, 'profile').detail).toBe('Still needs your trade.');
    expect(itemFor({ ...ready, companyName: null, zip: null }, 'profile').detail).toBe('Still needs your company name and ZIP code.');
    expect(itemFor({ ...ready, companyName: null, trade: null, zip: null }, 'profile').detail).toBe('Still needs your company name, trade and ZIP code.');
  });

  it('treats a missing mailing address as broken, not unstarted', () => {
    // Campaign emails stop sending without it. That is a thing already failing,
    // which is a different sentence from "you have not got round to it".
    const item = itemFor({ ...ready, mailingAddress: null }, 'mailing');
    expect(item.state).toBe('attention');
    expect(item.detail).toContain('can’t send');
  });

  it('catches a route being measured from a PO box', () => {
    const item = itemFor({ ...ready, operatingAddress: null, mailingAddress: 'PO Box 417, Royal Oak, MI 48068' }, 'operating');
    expect(item.state).toBe('attention');
    expect(item.detail).toContain('PO box');
  });

  it('is happy to fall back to a real mailing address', () => {
    // No operating address is only a problem when the mailing one cannot be
    // driven from. A street address does the job, so nothing is flagged.
    const item = itemFor({ ...ready, operatingAddress: null }, 'operating');
    expect(item.state).toBe('complete');
    expect(item.detail).toContain('Using your mailing address');
  });

  it('flags an operating address that would not geocode', () => {
    // The silent one: the address is filled in, so nothing looks wrong, but the
    // day is being measured from nowhere.
    const item = itemFor({ ...ready, hasServiceCenter: false }, 'operating');
    expect(item.state).toBe('attention');
    expect(item.actionLabel).toBe('Fix address');
  });

  it('flags a certificate with no expiry date', () => {
    // The important one. Without a date we can never pull it automatically, so
    // it keeps going out on quotes the day after it lapses.
    const item = itemFor({ ...ready, insurance: { kind: 'undated' } }, 'insurance');
    expect(item.state).toBe('attention');
    expect(item.actionLabel).toBe('Add expiry date');
  });

  it('flags expiring and expired certificates, and counts an untouched one as neither', () => {
    expect(itemFor({ ...ready, insurance: { kind: 'expiring', daysLeft: 12 } }, 'insurance').state).toBe('attention');
    expect(itemFor({ ...ready, insurance: { kind: 'expired', daysAgo: 3 } }, 'insurance').state).toBe('attention');
    expect(itemFor({ ...ready, insurance: { kind: 'none' } }, 'insurance').state).toBe('todo');
  });

  it('counts a switched-off certificate as complete, and says so', () => {
    // It is on file and in date. The switch is a choice, not a fault — but the
    // line has to admit it is not going out, or the owner reads "complete" as
    // "on my quotes".
    const item = itemFor({ ...ready, insurance: { kind: 'hidden' } }, 'insurance');
    expect(item.state).toBe('complete');
    expect(item.detail).toContain('isn’t going out');
  });

  it('says the labor cost is still a default rather than calling it configured', () => {
    const item = itemFor({ ...ready, burdenConfigured: false, burdenPct: 20 }, 'labor');
    expect(item.state).toBe('todo');
    expect(item.detail).toContain('default of 20%');
  });

  it('singularises the headline', () => {
    expect(setupHeadline(businessSetup({ ...ready, insurance: { kind: 'undated' } }))).toBe('One thing needs attention');
    expect(setupHeadline(businessSetup({ ...ready, insurance: { kind: 'undated' }, mailingAddress: null }))).toBe('2 things need attention');
    expect(setupHeadline(businessSetup({ ...ready, burdenConfigured: false }))).toBe('One more to go');
  });

  it('lets an alert outrank the progress count in the headline', () => {
    // Something broken is more urgent than something unfinished, even when both
    // are true.
    const setup = businessSetup({ ...ready, burdenConfigured: false, insurance: { kind: 'expired', daysAgo: 9 } });
    expect(setup.done).toBeLessThan(setup.total);
    expect(setupHeadline(setup)).toBe('One thing needs attention');
  });

  it('every item points at a section that exists', () => {
    const sections = new Set(['profile', 'costs', 'trust', 'apps']);
    for (const item of businessSetup(ready).items) {
      expect(sections.has(item.section), `${item.id} -> ${item.section}`).toBe(true);
      expect(item.actionLabel.length, item.id).toBeGreaterThan(0);
      expect(item.detail.length, item.id).toBeGreaterThan(0);
    }
  });
});

describe('looksLikePoBox', () => {
  it('catches the ways people write it', () => {
    for (const address of ['PO Box 417', 'P.O. Box 417, Royal Oak MI', 'p o box 12', 'Post Office Box 9', '123 Main St, PO BOX 4']) {
      expect(looksLikePoBox(address), address).toBe(true);
    }
  });

  it('leaves real streets alone', () => {
    // "Box" and "Po" both turn up in street names; matching either on its own
    // would move somebody's route off their actual yard.
    for (const address of ['638 S Blair Ave', '12 Boxwood Lane', '400 Po Valley Road', 'Postbridge Way', null, '']) {
      expect(looksLikePoBox(address), String(address)).toBe(false);
    }
  });
});
