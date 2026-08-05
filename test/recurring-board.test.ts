import { describe, it, expect } from 'vitest';
import { autopayCoverage, boardIssues, boardVisits, type BoardPlan } from '@/lib/recurring-board';
import { normalizeRecurringView } from '@/lib/dashboard-views';

const today = '2026-08-04';

function plan(over: Partial<BoardPlan> = {}): BoardPlan {
  return {
    id: 'p1',
    clientName: 'Ada Reyes',
    title: 'Lawn mowing',
    active: true,
    autoCharge: true,
    hasCard: true,
    amount: 85,
    nextRunDate: '2026-08-10',
    nextVisitAssigned: true,
    ...over,
  };
}

describe('the board only lists plans that need a decision', () => {
  it('says nothing about a plan that is fine', () => {
    expect(boardIssues([plan()], today)).toEqual([]);
  });

  // Pausing is a decision somebody already made. Listing it as a problem means
  // the count can never reach zero for anyone who parks a plan over winter.
  it('leaves a paused plan alone', () => {
    expect(boardIssues([plan({ active: false, hasCard: false })], today)).toEqual([]);
  });

  it('names the problem in words the owner can act on', () => {
    const [issue] = boardIssues([plan({ hasCard: false })], today);
    expect(issue.headline).toBe('No payment method');
    expect(issue.clientName).toBe('Ada Reyes');
    expect(issue.detail).toContain('bills nobody');
    expect(issue.when).toBe('In 6 days');
  });

  // One conversation, one row. Three rows about the same customer reads as three
  // separate problems and gets the count wrong at the same time.
  it('folds a plan with several faults into one row', () => {
    const issues = boardIssues([plan({ hasCard: false, nextVisitAssigned: false, amount: 0 })], today);
    expect(issues).toHaveLength(1);
    expect(issues[0].headline).toBe('No payment method');
    expect(issues[0].detail).toContain('Also: nobody assigned and no price set.');
  });

  it('puts work that cannot be billed at the top', () => {
    const issues = boardIssues(
      [
        plan({ id: 'later', clientName: 'Bo', nextVisitAssigned: false, nextRunDate: '2026-08-20' }),
        plan({ id: 'atrisk', clientName: 'Cy', hasCard: false, nextRunDate: '2026-08-01' }),
        plan({ id: 'soon', clientName: 'Di', nextVisitAssigned: false, nextRunDate: '2026-08-06' }),
      ],
      today,
    );
    // At risk first — late AND unbillable — then the rest soonest first.
    expect(issues.map((issue) => issue.planId)).toEqual(['atrisk', 'soon', 'later']);
    expect(issues[0].level).toBe('at-risk');
  });

  it('sorts by name when two plans are equally urgent, so the list holds still', () => {
    const a = boardIssues(
      [
        plan({ id: 'z', clientName: 'Zed', hasCard: false }),
        plan({ id: 'a', clientName: 'Abe', hasCard: false }),
      ],
      today,
    );
    expect(a.map((issue) => issue.clientName)).toEqual(['Abe', 'Zed']);
  });
});

describe('the visits in the window', () => {
  const visits = [
    { planId: 'p1', dateKey: '2026-08-03', planTitle: 'Yesterday', clientName: 'A', amount: 10 },
    { planId: 'p2', dateKey: '2026-08-04', planTitle: 'Today', clientName: 'B', amount: 20 },
    { planId: 'p3', dateKey: '2026-08-10', planTitle: 'Last day', clientName: 'C', amount: 30 },
    { planId: 'p4', dateKey: '2026-08-11', planTitle: 'Outside', clientName: 'D', amount: 40 },
  ];

  it('takes both ends of the window and nothing beyond them', () => {
    const shown = boardVisits(visits, '2026-08-04', '2026-08-10');
    expect(shown.map((visit) => visit.planTitle)).toEqual(['Today', 'Last day']);
  });

  // The date chip is read as a calendar page, so it has to agree with a calendar.
  // Built in UTC like every other date here: the 10th is the 10th everywhere.
  it('labels the chip with the real month and weekday', () => {
    const [first] = boardVisits(visits, '2026-08-10', '2026-08-10');
    expect(first.monthLabel).toBe('AUG');
    expect(first.dayLabel).toBe('10');
    expect(first.weekdayLabel).toBe('Mon');
  });

  it('orders by day, then by customer, so it never reshuffles between renders', () => {
    const sameDay = [
      { planId: 'x', dateKey: '2026-08-05', planTitle: 'X', clientName: 'Zoe', amount: 1 },
      { planId: 'y', dateKey: '2026-08-05', planTitle: 'Y', clientName: 'Ana', amount: 1 },
    ];
    expect(boardVisits(sameDay, '2026-08-04', '2026-08-11').map((v) => v.clientName)).toEqual(['Ana', 'Zoe']);
  });
});

describe('autopay coverage', () => {
  it('reads as a percentage of the plans that could have it', () => {
    expect(autopayCoverage(14, 18)).toEqual({ pct: 78, label: '14 of 18 plans' });
    expect(autopayCoverage(1, 1)).toEqual({ pct: 100, label: '1 of 1 plan' });
  });

  // "100%" printed beside "17 of 18 plans" is the kind of contradiction that
  // makes somebody stop trusting every other figure on the page.
  it('never rounds up to 100 while a plan is still uncovered', () => {
    expect(autopayCoverage(199, 200).pct).toBe(99);
  });

  it('does not divide by an empty book', () => {
    expect(autopayCoverage(0, 0)).toEqual({ pct: 0, label: 'No active plans' });
  });
});

describe('the view cookie', () => {
  // Cards is what the page already is, so an owner who never opens the gear
  // must not find their plans rearranged by a deploy.
  it('opens on Cards for anyone who has not chosen', () => {
    expect(normalizeRecurringView(undefined)).toBe('cards');
    expect(normalizeRecurringView('')).toBe('cards');
    expect(normalizeRecurringView('operations')).toBe('cards');
  });

  it('keeps an explicit choice', () => {
    expect(normalizeRecurringView('ops')).toBe('ops');
    expect(normalizeRecurringView('cards')).toBe('cards');
  });
});
