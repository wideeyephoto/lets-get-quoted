import { describe, it, expect } from 'vitest';
import {
  addMonths,
  claimIsInWarranty,
  daysBetween,
  isInWarranty,
  nextServiceAfter,
  serviceDue,
  toClientWarranties,
  warrantiesDueForService,
  warrantyRemainingLabel,
  warrantyStatus,
  type Warranty,
} from '@/lib/warranties';

const TODAY = '2026-08-03';

function warranty(overrides: Partial<Warranty> = {}): Warranty {
  return {
    id: 'w1',
    jobId: 'job1',
    clientId: 'c1',
    title: '1-year workmanship warranty',
    covers: 'Leaks caused by our installation.',
    excludes: 'Storm damage and anything we did not install.',
    startsOn: '2026-01-15',
    endsOn: '2027-01-15',
    documentPaths: [],
    maintenanceNotes: '',
    serviceIntervalMonths: null,
    nextServiceDue: null,
    lastServiceOn: null,
    serviceRemindedAt: null,
    ...overrides,
  };
}

describe('addMonths', () => {
  it('adds whole months', () => {
    expect(addMonths('2026-01-15', 12)).toBe('2027-01-15');
    expect(addMonths('2026-08-03', 6)).toBe('2027-02-03');
  });

  it('clamps to the end of a shorter month rather than rolling over', () => {
    // new Date() turns 31 Jan + 1 month into 3 March, which puts a warranty's
    // end date in the wrong month and quietly gives away two days of cover.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('handles a leap year', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('crosses a year boundary', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-11-15', 24)).toBe('2028-11-15');
  });

  it('returns null for junk rather than a plausible wrong date', () => {
    expect(addMonths('not-a-date', 12)).toBeNull();
    expect(addMonths('2026-1-5', 12)).toBeNull();
  });
});

describe('warrantyStatus', () => {
  it('is active well before the end', () => {
    expect(warrantyStatus(warranty(), TODAY)).toBe('active');
  });

  it('warns inside the last 60 days', () => {
    expect(warrantyStatus(warranty({ endsOn: '2026-09-15' }), TODAY)).toBe('expiring');
  });

  it('counts the last day as still covered', () => {
    // Off by one here is the difference between honouring a claim and refusing
    // one, so it gets its own test.
    expect(warrantyStatus(warranty({ endsOn: TODAY }), TODAY)).toBe('expiring');
    expect(isInWarranty(warranty({ endsOn: TODAY }), TODAY)).toBe(true);
    expect(isInWarranty(warranty({ endsOn: '2026-08-02' }), TODAY)).toBe(false);
  });

  it('reports an expired one plainly', () => {
    expect(warrantyStatus(warranty({ endsOn: '2026-01-15' }), TODAY)).toBe('expired');
  });

  it('treats no end date as lifetime, not as expired', () => {
    expect(warrantyStatus(warranty({ endsOn: null }), TODAY)).toBe('lifetime');
    expect(isInWarranty(warranty({ endsOn: null }), TODAY)).toBe(true);
  });

  it('is not in warranty before it starts', () => {
    expect(isInWarranty(warranty({ startsOn: '2026-12-01' }), TODAY)).toBe(false);
  });
});

describe('warrantyRemainingLabel', () => {
  it('speaks in days when it is close', () => {
    expect(warrantyRemainingLabel(warranty({ endsOn: '2026-08-10' }), TODAY)).toBe('7 days left.');
    expect(warrantyRemainingLabel(warranty({ endsOn: TODAY }), TODAY)).toBe('Ends today.');
  });

  it('speaks in months and years when it is far off', () => {
    expect(warrantyRemainingLabel(warranty({ endsOn: '2027-01-15' }), TODAY)).toContain('months left');
    expect(warrantyRemainingLabel(warranty({ endsOn: '2031-08-03' }), TODAY)).toContain('years left');
  });

  it('says when it ended rather than showing a negative', () => {
    expect(warrantyRemainingLabel(warranty({ endsOn: '2026-07-20' }), TODAY)).toBe('Ended 14 days ago.');
  });

  it('does not make a homeowner do date arithmetic on a lifetime warranty', () => {
    expect(warrantyRemainingLabel(warranty({ endsOn: null }), TODAY)).toBe('Covered with no end date.');
  });
});

describe('serviceDue', () => {
  it('says nothing when no servicing is required', () => {
    // Most jobs never need it, and nagging about all of them gets the whole
    // thing muted for the few that do.
    expect(serviceDue(warranty(), TODAY)).toMatchObject({ due: false, label: '' });
  });

  it('flags one coming up', () => {
    const due = serviceDue(warranty({ serviceIntervalMonths: 12, nextServiceDue: '2026-08-15' }), TODAY);
    expect(due.due).toBe(true);
    expect(due.overdue).toBe(false);
    expect(due.label).toBe('Service due in 12 days.');
  });

  it('flags an overdue one as overdue', () => {
    const due = serviceDue(warranty({ serviceIntervalMonths: 12, nextServiceDue: '2026-07-20' }), TODAY);
    expect(due.overdue).toBe(true);
    expect(due.label).toBe('Service was due 14 days ago.');
  });

  it('stays quiet on one that is months away', () => {
    expect(serviceDue(warranty({ serviceIntervalMonths: 12, nextServiceDue: '2027-01-01' }), TODAY).due).toBe(false);
  });
});

describe('nextServiceAfter', () => {
  it('counts from the service, not from today', () => {
    // Counting from today would let a late service quietly push the whole
    // schedule back, year after year.
    expect(nextServiceAfter('2026-07-01', 12)).toBe('2027-07-01');
  });

  it('returns null when there is no interval', () => {
    expect(nextServiceAfter('2026-07-01', null)).toBeNull();
    expect(nextServiceAfter('2026-07-01', 0)).toBeNull();
  });
});

describe('claimIsInWarranty', () => {
  it('answers for the day it was reported, not for today', () => {
    const w = warranty({ endsOn: '2026-07-01' });
    expect(claimIsInWarranty(w, '2026-06-30')).toBe(true);
    expect(claimIsInWarranty(w, TODAY)).toBe(false);
  });
});

describe('toClientWarranties', () => {
  it('shows what is excluded, not only what is covered', () => {
    // A warranty listing only inclusions is one that gets argued about at the
    // first exclusion.
    const [visible] = toClientWarranties([warranty()], TODAY);
    expect(visible.excludes).toContain('Storm damage');
  });

  it('lets a homeowner ask even after it has expired', () => {
    // Their sealant failed three weeks out of cover. A contractor who wants the
    // work will often say yes; hiding the button decides for them.
    const [expired] = toClientWarranties([warranty({ endsOn: '2026-01-15' })], TODAY);
    expect(expired.status).toBe('expired');
    expect(expired.canClaim).toBe(true);
  });

  it('counts documents without exposing their paths', () => {
    const [visible] = toClientWarranties([warranty({ documentPaths: ['a/1.pdf', 'a/2.pdf'] })], TODAY);
    expect(visible.documentCount).toBe(2);
    expect(JSON.stringify(visible)).not.toContain('a/1.pdf');
  });
});

describe('warrantiesDueForService', () => {
  it('puts the most overdue first', () => {
    const due = warrantiesDueForService(
      [
        warranty({ id: 'soon', serviceIntervalMonths: 12, nextServiceDue: '2026-08-20' }),
        warranty({ id: 'late', serviceIntervalMonths: 12, nextServiceDue: '2026-06-01' }),
        warranty({ id: 'far', serviceIntervalMonths: 12, nextServiceDue: '2027-06-01' }),
      ],
      TODAY,
    );
    expect(due.map((w) => w.id)).toEqual(['late', 'soon']);
  });
});

describe('daysBetween', () => {
  it('returns null rather than NaN for junk', () => {
    expect(daysBetween('nonsense', TODAY)).toBeNull();
  });
});
