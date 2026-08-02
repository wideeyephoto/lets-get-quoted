import { describe, it, expect } from 'vitest';
import {
  customerWords,
  quickStopRuleReference,
  screenQuickStopCandidates,
  type CandidateInput,
} from '@/lib/quick-stop-candidates';

const item = (over: Partial<CandidateInput> & { id: string; text: string }): CandidateInput => ({
  source: 'job',
  label: 'J-1001',
  clientName: 'Damon Pryce',
  createdAt: '2026-07-01T12:00:00.000Z',
  estimatedHours: null,
  href: '/dashboard/jobs/1',
  ...over,
});

const screen = (items: CandidateInput[], maxVisitMinutes = 60) =>
  screenQuickStopCandidates(items, { maxVisitMinutes });

describe('screenQuickStopCandidates', () => {
  it('passes short, ordinary work', () => {
    const report = screen([item({ id: '1', text: 'Kitchen sink drain is clogged, water backing up', estimatedHours: 0.75 })]);
    expect(report.eligible).toHaveLength(1);
    expect(report.eligible[0].lengthNote).toBe('About 45 min');
    expect(report.excluded).toHaveLength(0);
  });

  it('rules out work the live screener would rule out, with the same label', () => {
    const report = screen([item({ id: '1', text: 'Repipe galvanized supply lines — full repipe throughout' })]);
    expect(report.eligible).toHaveLength(0);
    expect(report.excluded[0].blockedBy).toContain('Large replacement');
  });

  it('flags unsafe separately from merely out of scope', () => {
    const report = screen([
      item({ id: 'gas', text: 'I can smell gas near the water heater' }),
      item({ id: 'permit', text: 'Needs a permit for the panel upgrade' }),
    ]);
    const gas = report.excluded.find((entry) => entry.id === 'gas')!;
    const permit = report.excluded.find((entry) => entry.id === 'permit')!;
    expect(gas.unsafe).toBe(true);
    expect(permit.unsafe).toBe(false);
  });

  it('rules out work longer than THIS account allows', () => {
    const long = item({ id: '1', text: 'Swap a leaking angle stop under the vanity', estimatedHours: 2 });
    expect(screen([long], 60).excluded[0].blockedBy).toContain('Longer than one short visit');
    // The same job, for a contractor who allows longer visits.
    expect(screen([long], 180).eligible).toHaveLength(1);
  });

  it('never calls a missing estimate "too long"', () => {
    // An unset estimate is a missing number, not a short job — and not a long
    // one either. It passes the length gate and says so in the note.
    const report = screen([item({ id: '1', text: 'Toilet runs constantly, needs a new flapper', estimatedHours: null })]);
    expect(report.eligible[0].tooLong).toBe(false);
    expect(report.eligible[0].lengthNote).toBe('No length recorded');
  });

  it('counts records with nothing written down rather than guessing at them', () => {
    const report = screen([item({ id: '1', text: 'fix' }), item({ id: '2', text: '' })]);
    expect(report.unjudged).toBe(2);
    expect(report.eligible).toHaveLength(0);
    expect(report.excluded).toHaveLength(0);
    expect(report.screened).toBe(2);
  });

  it('ranks the reasons work gets ruled out, most common first', () => {
    const report = screen([
      item({ id: '1', text: 'Full repipe of the whole house' }),
      item({ id: '2', text: 'Replace the water heater entirely' }),
      item({ id: '3', text: 'Trenching to the street for the new line' }),
    ]);
    expect(report.topReasons[0]).toEqual({ label: 'Large replacement', count: 2 });
    expect(report.topReasons.map((reason) => reason.label)).toContain('Excavation');
  });

  it('lists both sides newest first', () => {
    const report = screen([
      item({ id: 'old', text: 'Clear a slow bathroom drain', createdAt: '2026-06-01T00:00:00.000Z' }),
      item({ id: 'new', text: 'Reseat a running toilet', createdAt: '2026-07-20T00:00:00.000Z' }),
    ]);
    expect(report.eligible.map((entry) => entry.id)).toEqual(['new', 'old']);
  });

  it('can carry more than one reason on the same job', () => {
    const report = screen([
      item({ id: '1', text: 'Excavate and replace the whole sewer line', estimatedHours: 8 }),
    ]);
    expect(report.excluded[0].blockedBy.length).toBeGreaterThan(1);
  });
});

describe('quickStopRuleReference', () => {
  it('keeps unsafe apart from out-of-scope', () => {
    const rules = quickStopRuleReference();
    expect(rules.unsafe).toContain('Possible gas leak');
    expect(rules.outOfScope).toContain('Permit-required work');
    // The distinction is the point: unsafe work gets safety instructions, not a
    // "not a fit" message.
    expect(rules.unsafe).not.toContain('Permit-required work');
    expect(rules.outOfScope).not.toContain('Possible gas leak');
  });
});

describe('customerWords', () => {
  it('keeps the description and drops the wizard notes under it', () => {
    const message = [
      'Kitchen sink is clogged and backing up.',
      '',
      'AI estimate shown to the customer: $150-$300. Timing: Needed ASAP.',
    ].join('\n');
    expect(customerWords(message)).toBe('Kitchen sink is clogged and backing up.');
  });

  it('returns nothing when the notes ARE the whole message', () => {
    // No description was typed, so the only thing stored is bookkeeping — and
    // "AI estimate shown to the customer" is not a description of the work.
    expect(customerWords('AI estimate shown to the customer: $150-$300. Timing: Needed ASAP.')).toBe('');
    expect(customerWords('Timing: Needed ASAP.')).toBe('');
  });

  it('leaves an ordinary message alone', () => {
    expect(customerWords('Toilet runs constantly')).toBe('Toilet runs constantly');
  });

  it('handles empty and missing', () => {
    expect(customerWords('')).toBe('');
    expect(customerWords(null)).toBe('');
    expect(customerWords(undefined)).toBe('');
  });
});
