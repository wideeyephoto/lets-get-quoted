import { describe, it, expect } from 'vitest';
import {
  clientSummary,
  coverageLabel,
  daysBetween,
  expiryLabel,
  insuranceState,
  ownerNote,
  showsToClient,
  type InsuranceRecord,
} from '../src/lib/insurance';

const TODAY = '2026-08-05';

function record(over: Partial<InsuranceRecord> = {}): InsuranceRecord {
  return {
    path: 'acct/coi.pdf',
    filename: 'certificate-of-insurance.pdf',
    carrier: 'Grange Insurance',
    policyNumber: 'GL-4471902',
    coverageAmount: 1_000_000,
    expiresOn: '2027-03-01',
    showOnQuotes: true,
    ...over,
  };
}

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-08-05', '2026-08-06')).toBe(1);
    expect(daysBetween('2026-08-05', '2026-08-05')).toBe(0);
    expect(daysBetween('2026-08-05', '2026-08-04')).toBe(-1);
  });
  it('crosses a daylight-saving boundary without drifting', () => {
    // 31 real days, one of which is 23 hours long in a local timezone.
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });
  it('is 0 rather than NaN on rubbish', () => {
    expect(daysBetween('nope', '2026-08-05')).toBe(0);
  });
});

describe('insuranceState', () => {
  it('is none with nothing uploaded', () => {
    expect(insuranceState(null, TODAY)).toEqual({ kind: 'none' });
    expect(insuranceState(record({ path: null }), TODAY)).toEqual({ kind: 'none' });
  });

  it('is valid when it is comfortably in date', () => {
    expect(insuranceState(record(), TODAY)).toEqual({ kind: 'valid', daysLeft: 208 });
  });

  it('warns inside the renewal window', () => {
    expect(insuranceState(record({ expiresOn: '2026-09-01' }), TODAY)).toEqual({ kind: 'expiring', daysLeft: 27 });
  });

  it('is still valid on the last day, not expired', () => {
    // A certificate is good THROUGH its expiry date. Off by one here would stop
    // a contractor's quotes carrying cover they actually have.
    expect(insuranceState(record({ expiresOn: TODAY }), TODAY)).toEqual({ kind: 'expiring', daysLeft: 0 });
  });

  it('is expired the day after', () => {
    expect(insuranceState(record({ expiresOn: '2026-08-04' }), TODAY)).toEqual({ kind: 'expired', daysAgo: 1 });
  });

  it('reports expired even when the owner has it switched off', () => {
    // Expiry beats the switch: "hidden" would tell the owner to flip a toggle
    // when what they actually need to do is renew.
    expect(insuranceState(record({ expiresOn: '2026-01-01', showOnQuotes: false }), TODAY).kind).toBe('expired');
  });

  it('separates switched-off from not-uploaded', () => {
    expect(insuranceState(record({ showOnQuotes: false }), TODAY)).toEqual({ kind: 'hidden' });
  });

  it('shows an undated certificate rather than refusing it', () => {
    // Most of the value is the document itself, and plenty of contractors won't
    // type the date in.
    expect(insuranceState(record({ expiresOn: null }), TODAY)).toEqual({ kind: 'undated' });
  });
});

describe('showsToClient', () => {
  it('never shows an expired certificate', () => {
    // The whole point of the module. An expired COI on a quote is not a stale
    // asset, it is a false assurance the homeowner relied on.
    expect(showsToClient(record({ expiresOn: '2026-08-04' }), TODAY)).toBe(false);
    expect(showsToClient(record({ expiresOn: '2020-01-01' }), TODAY)).toBe(false);
  });

  it('shows valid, expiring and undated', () => {
    expect(showsToClient(record(), TODAY)).toBe(true);
    expect(showsToClient(record({ expiresOn: '2026-09-01' }), TODAY)).toBe(true);
    expect(showsToClient(record({ expiresOn: null }), TODAY)).toBe(true);
  });

  it('respects the owner switching it off', () => {
    expect(showsToClient(record({ showOnQuotes: false }), TODAY)).toBe(false);
  });

  it('shows nothing when nothing is uploaded', () => {
    expect(showsToClient(null, TODAY)).toBe(false);
  });
});

describe('the client-facing line', () => {
  it('leads with cover, then carrier, then expiry', () => {
    expect(clientSummary(record())).toBe('$1,000,000 general liability · with Grange Insurance · valid through March 2027');
  });

  it('never puts the policy number in front of a homeowner', () => {
    // It's on the certificate for anyone who opens it. In the summary line it
    // just invites itself into a screenshot.
    expect(clientSummary(record())).not.toContain('GL-4471902');
  });

  it('degrades to whatever the contractor actually filled in', () => {
    expect(clientSummary(record({ carrier: null, coverageAmount: null })))
      .toBe('valid through March 2027');
    expect(clientSummary(record({ carrier: null, coverageAmount: null, expiresOn: null })))
      .toBe('Certificate of insurance on file');
    expect(clientSummary(record({ carrier: '   ', coverageAmount: 0, expiresOn: null })))
      .toBe('Certificate of insurance on file');
  });
});

describe('labels', () => {
  it('writes coverage as a round headline figure', () => {
    expect(coverageLabel(1_000_000)).toBe('$1,000,000');
    expect(coverageLabel(500_000.4)).toBe('$500,000');
    expect(coverageLabel(0)).toBeNull();
    expect(coverageLabel(null)).toBeNull();
  });

  it('writes an expiry to the month', () => {
    expect(expiryLabel('2027-03-01')).toBe('March 2027');
    // Parsed as UTC, so a date near the start of a month cannot slip backwards
    // into the previous one for anybody west of Greenwich.
    expect(expiryLabel('2027-01-01')).toBe('January 2027');
    expect(expiryLabel(null)).toBeNull();
    expect(expiryLabel('rubbish')).toBeNull();
  });
});

describe('ownerNote', () => {
  it('always tells the owner what to do next', () => {
    expect(ownerNote({ kind: 'none' })).toMatch(/upload/i);
    expect(ownerNote({ kind: 'expired', daysAgo: 12 })).toMatch(/stopped going out.*renewal/is);
    expect(ownerNote({ kind: 'expiring', daysLeft: 9 })).toMatch(/9 days/);
    expect(ownerNote({ kind: 'hidden' })).toMatch(/switched off/i);
    expect(ownerNote({ kind: 'valid', daysLeft: 200 })).toMatch(/going out with every quote/i);
    expect(ownerNote({ kind: 'undated' })).toMatch(/expiry date/i);
  });

  it('gets the singular right, because 1 days reads as a bug', () => {
    expect(ownerNote({ kind: 'expired', daysAgo: 1 })).toContain('1 day ago');
    expect(ownerNote({ kind: 'expiring', daysLeft: 1 })).toContain('1 day');
  });
});
