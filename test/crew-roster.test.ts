import { describe, it, expect } from 'vitest';
import { rosterNextStep, rosterStepNames, rosterTotals, type RosterMember } from '@/lib/crew-roster';

function member(overrides: Partial<RosterMember> & { name: string }): RosterMember {
  return {
    id: overrides.name.toLowerCase(),
    active: true,
    hourlyRate: 30,
    fieldApp: 'linked',
    jobs: [{}],
    ...overrides,
  };
}

describe('rosterNextStep — what the roster should tell you to do', () => {
  it('says nothing is wrong when nothing is', () => {
    const step = rosterNextStep([member({ name: 'Danny' }), member({ name: 'Mike' })]);
    expect(step.id).toBe('ready');
    expect(step.tone).toBe('ok');
  });

  it('leads with a missing rate, because that one makes the pay numbers wrong', () => {
    // Everything else is also wrong here — an uninvited person, someone with no
    // email, someone idle — and the rate still wins.
    const step = rosterNextStep([
      member({ name: 'Danny', hourlyRate: 0 }),
      member({ name: 'Mike', fieldApp: 'invitable' }),
      member({ name: 'Sarah', fieldApp: 'no-email' }),
      member({ name: 'Carlos', jobs: [] }),
    ]);
    expect(step.id).toBe('rate');
    expect(step.tone).toBe('alert');
    expect(step.names).toEqual(['Danny']);
  });

  it('asks for the one-click invite before the one that needs a phone call', () => {
    const step = rosterNextStep([member({ name: 'Mike', fieldApp: 'invitable' }), member({ name: 'Sarah', fieldApp: 'no-email' })]);
    expect(step.id).toBe('invite');
    expect(step.names).toEqual(['Mike']);
  });

  it('falls through to the email gap once everyone invitable has been invited', () => {
    const step = rosterNextStep([member({ name: 'Sarah', fieldApp: 'no-email' })]);
    expect(step.id).toBe('email');
  });

  it('treats idle crew as an opportunity, not a fault', () => {
    const step = rosterNextStep([member({ name: 'Danny', jobs: [] }), member({ name: 'Mike' })]);
    expect(step.id).toBe('idle');
    expect(step.tone).toBe('ok');
    expect(step.names).toEqual(['Danny']);
  });

  it('ignores archived people entirely', () => {
    // An archived member with no rate is not a problem to fix.
    const step = rosterNextStep([member({ name: 'Gone', active: false, hourlyRate: 0 }), member({ name: 'Mike' })]);
    expect(step.id).toBe('ready');
  });

  it('asks for a first crew member when there are none', () => {
    expect(rosterNextStep([]).id).toBe('empty');
    expect(rosterNextStep([member({ name: 'Gone', active: false })]).id).toBe('empty');
  });
});

describe('rosterStepNames', () => {
  it('reads like a sentence rather than a list', () => {
    const names = (list: string[]) => rosterStepNames({ id: 'rate', title: '', body: '', tone: 'alert', names: list });
    expect(names([])).toBe('');
    expect(names(['Danny'])).toBe('Danny');
    expect(names(['Danny', 'Mike'])).toBe('Danny and Mike');
    expect(names(['Danny', 'Mike', 'Sarah', 'Carlos'])).toBe('Danny, Mike and 2 more');
  });
});

describe('rosterTotals', () => {
  const withPay = (m: RosterMember, hours: number, pay: number) => ({ ...m, periodHours: hours, periodPay: pay });

  it('counts who is free and who is out', () => {
    const totals = rosterTotals([
      withPay(member({ name: 'Danny', jobs: [] }), 10, 300),
      withPay(member({ name: 'Mike' }), 20, 800),
      withPay(member({ name: 'Gone', active: false }), 5, 100),
    ]);
    expect(totals).toMatchObject({ activeCount: 2, available: 1, onJob: 1, archived: 1 });
  });

  it('sums the active crew only — an archived person is not what this roster costs now', () => {
    const totals = rosterTotals([
      withPay(member({ name: 'Mike' }), 20, 800),
      withPay(member({ name: 'Gone', active: false }), 5, 100),
    ]);
    expect(totals.periodHours).toBe(20);
    expect(totals.periodPay).toBe(800);
  });
});
