import { describe, it, expect } from 'vitest';
import {
  RECENT_DAYS,
  bandFor,
  daysBetweenKeys,
  flagsFor,
  followUpHeadline,
  groupByFollowUp,
  whenHeading,
  whenLabel,
  type FollowUpClient,
} from '@/lib/client-followup';

const TODAY = '2026-07-31';

const client = (over: Partial<FollowUpClient> & { id: string; name: string }): FollowUpClient => ({
  phone: '2485550100',
  email: null,
  jobCount: 1,
  totalValue: 500,
  nextJobAt: null,
  lastVisitAt: null,
  unscheduledJobs: 0,
  ...over,
});

describe('bandFor', () => {
  it('puts anyone with work ahead on the calendar', () => {
    expect(bandFor(client({ id: 'a', name: 'A', nextJobAt: '2026-08-09' }), TODAY)).toBe('booked');
  });

  it('counts a job scheduled for today as booked, not as history', () => {
    expect(bandFor(client({ id: 'a', name: 'A', nextJobAt: TODAY }), TODAY)).toBe('booked');
  });

  it('lets booked beat a long silence — you are seeing them Thursday', () => {
    // Two years since the last visit, but there is a date in the diary. Calling
    // that "going quiet" would send somebody chasing a customer they are about
    // to stand in front of.
    const rebooked = client({ id: 'a', name: 'A', lastVisitAt: '2024-07-01', nextJobAt: '2026-08-06' });
    expect(bandFor(rebooked, TODAY)).toBe('booked');
  });

  it('calls a recent visit recent, right up to the boundary', () => {
    expect(bandFor(client({ id: 'a', name: 'A', lastVisitAt: '2026-07-30' }), TODAY)).toBe('recent');
    expect(bandFor(client({ id: 'a', name: 'A', lastVisitAt: '2026-07-17' }), TODAY)).toBe('recent'); // 14 days
    expect(bandFor(client({ id: 'a', name: 'A', lastVisitAt: '2026-07-16' }), TODAY)).toBe('drifting'); // 15
    expect(RECENT_DAYS).toBe(14);
  });

  it('treats a customer with no date at all as unbooked, jobs or not', () => {
    expect(bandFor(client({ id: 'a', name: 'A', jobCount: 0, totalValue: 0 }), TODAY)).toBe('unbooked');
    // A quote with no date on it is the case worth catching: money on the table
    // and nothing in the diary.
    expect(bandFor(client({ id: 'a', name: 'A', jobCount: 1, unscheduledJobs: 1, totalValue: 11800 }), TODAY)).toBe('unbooked');
  });
});

describe('whenLabel', () => {
  it('reads forward for booked work', () => {
    expect(whenLabel(client({ id: 'a', name: 'A', nextJobAt: TODAY }), TODAY)).toBe('Today');
    expect(whenLabel(client({ id: 'a', name: 'A', nextJobAt: '2026-08-01' }), TODAY)).toBe('Tomorrow');
    expect(whenLabel(client({ id: 'a', name: 'A', nextJobAt: '2026-08-06' }), TODAY)).toBe('In 6 days');
  });

  it('reads backward for past visits, in months once days stop helping', () => {
    expect(whenLabel(client({ id: 'a', name: 'A', lastVisitAt: '2026-07-30' }), TODAY)).toBe('Yesterday');
    expect(whenLabel(client({ id: 'a', name: 'A', lastVisitAt: '2026-07-19' }), TODAY)).toBe('12 days ago');
    expect(whenLabel(client({ id: 'a', name: 'A', lastVisitAt: '2026-06-25' }), TODAY)).toBe('About a month ago');
    expect(whenLabel(client({ id: 'a', name: 'A', lastVisitAt: '2026-04-30' }), TODAY)).toBe('About 3 months ago');
  });

  it('distinguishes never-booked from booked-but-undated', () => {
    expect(whenLabel(client({ id: 'a', name: 'A', jobCount: 0 }), TODAY)).toBe('Never been out');
    expect(whenLabel(client({ id: 'a', name: 'A', jobCount: 1 }), TODAY)).toBe('Job with no date on it');
  });
});

describe('whenHeading', () => {
  // The panel used to print this value under a hardcoded "Next visit", so a
  // customer with nothing booked read "Next visit: 18 days ago" — a past date
  // under a heading promising the future. The heading has to come from the same
  // branch the value does.
  it('never promises a future date the value does not have', () => {
    const booked = client({ id: 'a', name: 'A', nextJobAt: '2026-08-06' });
    expect(whenHeading(booked)).toBe('Next visit');
    expect(whenLabel(booked, TODAY)).toBe('In 6 days');

    const drifting = client({ id: 'b', name: 'B', lastVisitAt: '2026-07-13' });
    expect(whenHeading(drifting)).toBe('Last visit');
    expect(whenLabel(drifting, TODAY)).toBe('18 days ago');
  });

  it('says Last visit when there is nothing at either end', () => {
    // "Last visit — Never been out" is coherent; "Next visit — Never been out"
    // is a promise and a denial in the same breath.
    expect(whenHeading(client({ id: 'a', name: 'A', jobCount: 0 }))).toBe('Last visit');
    expect(whenHeading(client({ id: 'a', name: 'A', jobCount: 1 }))).toBe('Last visit');
  });
});

describe('flags stay factual', () => {
  const context = { duplicateNames: new Set<string>(), topUnbookedId: null };

  it('says what is checkable and nothing else', () => {
    const noContact = client({ id: 'a', name: 'bebg', phone: null, email: null, jobCount: 0, totalValue: 0 });
    const flags = flagsFor(noContact, context).map((flag) => flag.text);
    // "No phone or email" is a fact. "Looks like a test entry" would be a guess
    // about somebody's customer, and being confidently wrong about that on
    // screen is worse than saying nothing.
    expect(flags).toContain('No phone or email');
    expect(flags.join(' ')).not.toMatch(/test|junk|fake/i);
  });

  it('flags a repeated name only when it really repeats', () => {
    const dupes = { duplicateNames: new Set(['efefe']), topUnbookedId: null };
    expect(flagsFor(client({ id: 'a', name: 'efefe' }), dupes).some((f) => f.text.includes('Same name'))).toBe(true);
    expect(flagsFor(client({ id: 'b', name: 'Unique Person' }), dupes).some((f) => f.text.includes('Same name'))).toBe(false);
  });

  it('does not repeat what the row already says about a single undated job', () => {
    // The row's own line reads "Job with no date on it". A badge saying the
    // same thing makes both easier to ignore.
    const one = client({ id: 'a', name: 'A', jobCount: 1, unscheduledJobs: 1 });
    expect(flagsFor(one, context).some((f) => f.text.includes('none scheduled'))).toBe(false);

    const several = client({ id: 'a', name: 'A', jobCount: 3, unscheduledJobs: 3 });
    expect(flagsFor(several, context).map((f) => f.text)).toContain('3 jobs, none scheduled');
  });

  it('names the biggest unbooked quote, and only when there is money on it', () => {
    const rich = client({ id: 'big', name: 'Victor Amadi', totalValue: 11800, jobCount: 1, unscheduledJobs: 1 });
    const flags = flagsFor(rich, { duplicateNames: new Set(), topUnbookedId: 'big' });
    expect(flags.some((f) => f.text === 'Your largest unbooked quote')).toBe(true);

    const broke = client({ id: 'big', name: 'Nobody', totalValue: 0 });
    expect(flagsFor(broke, { duplicateNames: new Set(), topUnbookedId: 'big' }).some((f) => f.text.includes('largest'))).toBe(false);
  });
});

describe('groupByFollowUp', () => {
  // Modelled on the real BrokePipes roster.
  const roster: FollowUpClient[] = [
    client({ id: 'dana', name: 'Dana Whitfield', nextJobAt: '2026-08-01', totalValue: 6400, jobCount: 2 }),
    client({ id: 'alan', name: 'Alan Trudeau', nextJobAt: '2026-08-09', totalValue: 4600 }),
    client({ id: 'greg', name: 'Greg Fontaine', lastVisitAt: '2026-07-31', totalValue: 690 }),
    client({ id: 'priya', name: 'Priya Raman', lastVisitAt: '2026-07-24', totalValue: 1875 }),
    client({ id: 'bethany', name: 'Bethany Iqbal', lastVisitAt: '2026-06-19', totalValue: 720 }),
    client({ id: 'tom', name: 'Tom Kowalski', lastVisitAt: '2026-05-02', totalValue: 540 }),
    client({ id: 'victor', name: 'Victor Amadi', totalValue: 11800, jobCount: 1, unscheduledJobs: 1 }),
    client({ id: 'e1', name: 'efefe', phone: null, email: null, jobCount: 0, totalValue: 0 }),
    client({ id: 'e2', name: 'efefe', phone: null, email: null, jobCount: 0, totalValue: 0 }),
  ];

  const groups = groupByFollowUp(roster, TODAY);
  const band = (name: string) => groups.find((group) => group.band === name)!;

  it('returns every band, even the empty ones', () => {
    expect(groups.map((group) => group.band)).toEqual(['booked', 'recent', 'drifting', 'unbooked']);
  });

  it('sorts booked work by when you are due there', () => {
    expect(band('booked').clients.map((c) => c.id)).toEqual(['dana', 'alan']);
  });

  it('sorts the quiet ones by longest silence first', () => {
    // Tom (May) is closer to lost than Bethany (June), so he leads.
    expect(band('drifting').clients.map((c) => c.id)).toEqual(['tom', 'bethany']);
  });

  it('sorts everything else by value — the expensive calls get made', () => {
    expect(band('unbooked').clients[0].id).toBe('victor');
  });

  it('attaches the labels and flags the row needs to render', () => {
    const victor = band('unbooked').clients.find((c) => c.id === 'victor')!;
    expect(victor.when).toBe('Job with no date on it');
    expect(victor.flags.map((f) => f.text)).toContain('Your largest unbooked quote');

    const dupes = band('unbooked').clients.filter((c) => c.name === 'efefe');
    expect(dupes).toHaveLength(2);
    for (const dupe of dupes) expect(dupe.flags.map((f) => f.text)).toContain('Same name as another customer');
  });

  it('loses nobody', () => {
    expect(groups.reduce((sum, group) => sum + group.clients.length, 0)).toBe(roster.length);
  });
});

describe('followUpHeadline', () => {
  it('counts what needs chasing, and stays silent when nothing does', () => {
    const busy = groupByFollowUp(
      [
        client({ id: 'a', name: 'A', lastVisitAt: '2026-05-01' }),
        client({ id: 'b', name: 'B', totalValue: 900, jobCount: 1, unscheduledJobs: 1 }),
      ],
      TODAY,
    );
    expect(followUpHeadline(busy)).toBe('1 going quiet · 1 quoted with nothing booked');

    const calm = groupByFollowUp([client({ id: 'a', name: 'A', nextJobAt: '2026-08-05' })], TODAY);
    expect(followUpHeadline(calm)).toBeNull();
  });

  it('does not count a zero-value record as a quote worth chasing', () => {
    const junk = groupByFollowUp([client({ id: 'a', name: 'bebg', jobCount: 0, totalValue: 0 })], TODAY);
    expect(followUpHeadline(junk)).toBeNull();
  });
});

describe('daysBetweenKeys', () => {
  it('is signed, and survives a clock change', () => {
    expect(daysBetweenKeys('2026-07-24', '2026-07-31')).toBe(7);
    expect(daysBetweenKeys('2026-08-09', '2026-07-31')).toBe(-9);
    // US DST ends 1 Nov 2026; parsed as UTC this stays exactly 2 days.
    expect(daysBetweenKeys('2026-10-31', '2026-11-02')).toBe(2);
  });
});
