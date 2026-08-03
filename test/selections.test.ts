import { describe, it, expect } from 'vitest';
import {
  boardStatus,
  deadlineState,
  describeOptionCost,
  optionCost,
  selectionTotals,
  snapshotOption,
  toClientSelections,
  type Selection,
  type SelectionOption,
} from '@/lib/selections';

const TODAY = '2026-08-03';

function option(overrides: Partial<SelectionOption> = {}): SelectionOption {
  return { id: 'o1', name: 'Standard beige', description: '', price: 400, reference: 'SW7036', photoPath: null, sortOrder: 0, ...overrides };
}

function selection(overrides: Partial<Selection> = {}): Selection {
  return {
    id: 's1',
    jobId: 'job1',
    title: 'Wall colour',
    description: 'Pick the main living-room colour.',
    allowance: 400,
    decideBy: '2026-08-10',
    creditUnderspend: true,
    status: 'open',
    chosenOptionId: null,
    chosenSnapshot: null,
    chosenAt: null,
    chosenByName: null,
    sortOrder: 0,
    options: [option()],
    ...overrides,
  };
}

describe('optionCost', () => {
  it('costs nothing when the option matches the allowance', () => {
    expect(optionCost(option({ price: 400 }), selection())).toEqual({ upgrade: 0, credit: 0, net: 0, included: true });
  });

  it('charges only the difference on an upgrade', () => {
    // The customer is never asked to do this subtraction themselves.
    expect(optionCost(option({ price: 650 }), selection())).toMatchObject({ upgrade: 250, credit: 0, net: 250 });
  });

  it('gives the money back when they pick cheaper', () => {
    // That IS what an allowance means in a construction contract. A contractor
    // who keeps the difference without saying so is why people distrust the word.
    expect(optionCost(option({ price: 250 }), selection())).toMatchObject({ upgrade: 0, credit: 150, net: -150 });
  });

  it('keeps the difference only when the contractor said "up to"', () => {
    expect(optionCost(option({ price: 250 }), selection({ creditUnderspend: false }))).toEqual({
      upgrade: 0, credit: 0, net: 0, included: true,
    });
  });

  it('treats a zero allowance as everything being an upgrade', () => {
    expect(optionCost(option({ price: 400 }), selection({ allowance: 0 }))).toMatchObject({ upgrade: 400, net: 400 });
  });

  it('reads in words, not signed numbers', () => {
    expect(describeOptionCost(optionCost(option({ price: 400 }), selection()))).toBe('Included');
    expect(describeOptionCost(optionCost(option({ price: 650 }), selection()))).toBe('+$250');
    expect(describeOptionCost(optionCost(option({ price: 250 }), selection()))).toBe('$150 back');
  });
});

describe('selectionTotals', () => {
  it('counts only decisions actually made', () => {
    // An option somebody is still thinking about has not changed the price of
    // anything, and banking it invites a contractor to spend money nobody agreed to.
    const totals = selectionTotals([
      selection({ id: 'a', status: 'chosen', chosenSnapshot: snapshotOption(option({ price: 650 })) }),
      selection({ id: 'b', status: 'open' }),
    ]);
    expect(totals).toMatchObject({ upgrades: 250, credits: 0, net: 250, decided: 1, waiting: 1 });
  });

  it('nets upgrades against credits', () => {
    const totals = selectionTotals([
      selection({ id: 'a', status: 'chosen', chosenSnapshot: snapshotOption(option({ price: 650 })) }),
      selection({ id: 'b', status: 'chosen', chosenSnapshot: snapshotOption(option({ price: 300 })) }),
    ]);
    expect(totals).toMatchObject({ upgrades: 250, credits: 100, net: 150, decided: 2 });
  });

  it('prices from the SNAPSHOT, not from the live option', () => {
    // This is the whole feature. The contractor edited the option's price after
    // it was picked; the customer still owes what they agreed to.
    const chosen = selection({
      status: 'chosen',
      chosenSnapshot: snapshotOption(option({ price: 650 })),
      options: [option({ price: 9999 })],
    });
    expect(selectionTotals([chosen]).upgrades).toBe(250);
  });

  it('ignores cancelled selections entirely', () => {
    const totals = selectionTotals([selection({ status: 'cancelled' })]);
    expect(totals).toMatchObject({ net: 0, decided: 0, waiting: 0 });
  });
});

describe('what a choice does to the job total', () => {
  // chooseOption applies optionCost(...).net to jobs.quoted_amount. These pin
  // the arithmetic that does it, including the direction a credit moves.
  it('adds an upgrade to the job', () => {
    expect(optionCost(option({ price: 650 }), selection()).net).toBe(250);
  });

  it('takes a credit OFF the job', () => {
    // A job total that only ever goes up would quietly pocket the difference
    // on every under-spend, which is the opposite of what an allowance means.
    expect(optionCost(option({ price: 250 }), selection()).net).toBe(-150);
  });

  it('moves nothing when the pick matches the allowance', () => {
    expect(optionCost(option({ price: 400 }), selection()).net).toBe(0);
  });

  it('moves nothing when the contractor keeps the difference', () => {
    expect(optionCost(option({ price: 250 }), selection({ creditUnderspend: false })).net).toBe(0);
  });

  it('nets a board of decisions to one number', () => {
    const totals = selectionTotals([
      selection({ id: 'a', status: 'chosen', chosenSnapshot: snapshotOption(option({ price: 650 })) }),
      selection({ id: 'b', status: 'chosen', chosenSnapshot: snapshotOption(option({ price: 250 })) }),
    ]);
    expect(totals.net).toBe(100);
  });
});

describe('deadlineState', () => {
  it('counts down inside the chase window', () => {
    expect(deadlineState(selection({ decideBy: '2026-08-08' }), TODAY)).toMatchObject({ due: true, overdue: false, daysLeft: 5 });
  });

  it('stays quiet when the date is a long way off', () => {
    expect(deadlineState(selection({ decideBy: '2026-09-30' }), TODAY).due).toBe(false);
  });

  it('says how late it is', () => {
    const state = deadlineState(selection({ decideBy: '2026-07-28' }), TODAY);
    expect(state.overdue).toBe(true);
    expect(state.label).toContain('6 days past');
  });

  it('says nothing once the choice is made', () => {
    expect(deadlineState(selection({ status: 'chosen', decideBy: '2026-07-01' }), TODAY)).toMatchObject({ due: false, label: '' });
  });

  it('says nothing when there is no deadline', () => {
    // Inventing one teaches people to ignore them.
    expect(deadlineState(selection({ decideBy: null }), TODAY).label).toBe('');
  });
});

describe('boardStatus', () => {
  it('says who the job is waiting on', () => {
    const status = boardStatus([selection({ id: 'a' }), selection({ id: 'b' })], TODAY);
    expect(status.label).toBe('Waiting on homeowner — 2 choices to make');
  });

  it('leads with what is late', () => {
    const status = boardStatus([selection({ id: 'a', decideBy: '2026-07-01' }), selection({ id: 'b' })], TODAY);
    expect(status.overdue).toBe(1);
    expect(status.label).toContain('1 past the date we needed');
  });

  it('says so when everything is decided', () => {
    expect(boardStatus([selection({ status: 'chosen' })], TODAY).label).toBe('All choices made');
  });

  it('says nothing at all on a job with no selections', () => {
    expect(boardStatus([], TODAY).label).toBe('');
  });
});

describe('toClientSelections', () => {
  it('hides a selection the contractor took off the table', () => {
    expect(toClientSelections([selection({ status: 'cancelled' })], TODAY)).toEqual([]);
  });

  it('shows what they picked, forever, from the snapshot', () => {
    // "You picked SW7036 on 12 March" is the whole reason this exists.
    const [visible] = toClientSelections(
      [selection({
        status: 'chosen',
        chosenSnapshot: snapshotOption(option({ name: 'Accessible Beige', reference: 'SW7036', price: 400 })),
        chosenAt: '2026-03-12T10:00:00Z',
        chosenByName: 'Jane Homeowner',
        options: [option({ name: 'Renamed later', price: 9999 })],
      })],
      TODAY,
    );
    expect(visible.chosen?.name).toBe('Accessible Beige');
    expect(visible.chosen?.reference).toBe('SW7036');
    expect(visible.chosen?.costLabel).toBe('Included');
    expect(visible.chosen?.byName).toBe('Jane Homeowner');
  });

  it('stops shipping the alternatives once a choice is made', () => {
    // Not merely "doesn't render them": a client component's props are
    // serialised into the page, so an option left in the payload is an option
    // in the page source — including one the contractor has since renamed.
    const [visible] = toClientSelections(
      [selection({
        status: 'chosen',
        chosenSnapshot: snapshotOption(option({ name: 'Accessible Beige' })),
        options: [option({ id: 'x', name: 'Something Else Entirely' })],
      })],
      TODAY,
    );
    expect(visible.options).toEqual([]);
    expect(JSON.stringify(visible)).not.toContain('Something Else Entirely');
    expect(visible.chosen?.name).toBe('Accessible Beige');
  });

  it('tells the homeowner the date rather than scolding them with a countdown', () => {
    const [visible] = toClientSelections([selection({ decideBy: '2026-08-10' })], TODAY);
    expect(visible.deadlineLabel).toContain('August 10');
    expect(visible.deadlineLabel).not.toMatch(/\d+ days? to decide/);
  });

  it('asks rather than blames when it is already late', () => {
    const [visible] = toClientSelections([selection({ decideBy: '2026-07-28' })], TODAY);
    expect(visible.overdue).toBe(true);
    expect(visible.deadlineLabel).toContain('as soon as you can');
  });

  it('prices every option against the allowance for them', () => {
    const [visible] = toClientSelections(
      [selection({ options: [option({ id: 'a', price: 400 }), option({ id: 'b', price: 650 }), option({ id: 'c', price: 250 })] })],
      TODAY,
    );
    expect(visible.options.map((o) => o.costLabel)).toEqual(['Included', '+$250', '$150 back']);
  });
});

describe('snapshotOption', () => {
  it('captures what the customer was looking at', () => {
    const snap = snapshotOption(option({ id: 'o9', name: 'Accessible Beige', reference: 'SW7036', price: 412.5 }));
    expect(snap).toEqual({ optionId: 'o9', name: 'Accessible Beige', description: '', price: 412.5, reference: 'SW7036' });
  });
});
