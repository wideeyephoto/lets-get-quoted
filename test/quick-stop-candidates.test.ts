import { readFileSync } from 'node:fs';
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

const screen = (items: CandidateInput[], maxVisitMinutes = 60, quickStopJobIds: string[] = []) =>
  screenQuickStopCandidates(items, { maxVisitMinutes, quickStopJobIds });

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

  it('never calls a missing estimate "too long", and never counts it as eligible either', () => {
    // An unset estimate is a missing number, not a short job — and not a long
    // one either. It is not ruled out, but it is NOT in the bucket that gets
    // multiplied by the floor fee: the card says "No length recorded" and the
    // headline used to price that same row anyway.
    const report = screen([item({ id: '1', text: 'Toilet runs constantly, needs a new flapper', estimatedHours: null })]);
    expect(report.eligible).toHaveLength(0);
    expect(report.excluded).toHaveLength(0);
    expect(report.unknownLength).toHaveLength(1);
    expect(report.unknownLength[0].tooLong).toBe(false);
    expect(report.unknownLength[0].eligible).toBe(false);
    expect(report.unknownLength[0].lengthKnown).toBe(false);
    expect(report.unknownLength[0].lengthNote).toBe('No length recorded');
  });

  it('treats zero and a non-finite estimate as no length, not as a very short job', () => {
    const report = screen([
      item({ id: 'zero', text: 'Reset a tripped garbage disposal', estimatedHours: 0 }),
      item({ id: 'nan', text: 'Tighten a leaking compression fitting', estimatedHours: Number.NaN }),
    ]);
    expect(report.eligible).toHaveLength(0);
    expect(report.unknownLength.map((entry) => entry.id).sort()).toEqual(['nan', 'zero']);
  });

  it('keeps a blocked record out of the unknown-length bucket', () => {
    // Being unmeasured does not soften a rule. A repipe with no estimate is
    // still a repipe, and belongs where the reason is shown.
    const report = screen([item({ id: '1', text: 'Full repipe of the whole house', estimatedHours: null })]);
    expect(report.unknownLength).toHaveLength(0);
    expect(report.excluded[0].blockedBy).toContain('Large replacement');
  });

  it('counts records with nothing written down rather than guessing at them', () => {
    const report = screen([item({ id: '1', text: 'fix' }), item({ id: '2', text: '' })]);
    expect(report.unjudged).toBe(2);
    expect(report.eligible).toHaveLength(0);
    expect(report.unknownLength).toHaveLength(0);
    expect(report.excluded).toHaveLength(0);
    expect(report.screened).toBe(2);
    expect(report.received).toBe(2);
  });

  it('counts one online booking once, not once as a lead and again as a job', () => {
    // createBooking writes BOTH rows for a single customer action and links them
    // through leads.converted_job. The job wins: it carries the owner's scope.
    const report = screen([
      item({ id: 'lead-1', source: 'lead', label: 'Website lead', text: 'Kitchen faucet drips constantly', convertedJobId: 'job-1', estimatedHours: 0.5 }),
      item({ id: 'job-1', source: 'job', text: 'Kitchen faucet drips constantly', estimatedHours: 0.5 }),
    ]);
    expect(report.eligible.map((entry) => entry.id)).toEqual(['job-1']);
    expect(report.removed.duplicates).toBe(1);
    expect(report.screened).toBe(1);
    expect(report.received).toBe(2);
  });

  it('keeps a converted lead whose job is not in the batch', () => {
    // The job may be archived, older than the window, or past the row cap.
    // Dropping the lead anyway would shrink the count with nothing standing in
    // for it — an undercount is still a wrong number.
    const report = screen([
      item({ id: 'lead-1', source: 'lead', text: 'Bathroom sink drains slowly', convertedJobId: 'job-gone', estimatedHours: 0.5 }),
    ]);
    expect(report.eligible).toHaveLength(1);
    expect(report.removed.duplicates).toBe(0);
  });

  it('does not present a Quick Stop already taken as one that was missed', () => {
    // The accepted-offer action creates this job. It is under the limit and
    // breaks no rule by construction, so it passed the screen every time and was
    // re-monetised on top of the fee it had actually earned.
    const report = screen(
      [
        item({ id: 'job-qs', text: 'Quick Stop — clear a slow kitchen drain', estimatedHours: 0.75 }),
        item({ id: 'job-ordinary', text: 'Clear a slow kitchen drain', estimatedHours: 0.75 }),
      ],
      60,
      ['job-qs'],
    );
    expect(report.eligible.map((entry) => entry.id)).toEqual(['job-ordinary']);
    expect(report.removed.alreadyQuickStop).toBe(1);
  });

  it('excludes on the id, not on the scope wording', () => {
    // Matching the "Quick Stop — " prefix would let an owner reintroduce the
    // double count just by renaming a job.
    const renamed = item({ id: 'job-qs', text: 'Drain clearing at the Pryce house', estimatedHours: 0.75 });
    expect(screen([renamed], 60, ['job-qs']).removed.alreadyQuickStop).toBe(1);
    expect(screen([renamed], 60, []).eligible).toHaveLength(1);
  });

  it('drops the lead too when the job it became was the Quick Stop', () => {
    const report = screen(
      [item({ id: 'lead-1', source: 'lead', text: 'Kitchen drain is backing up', convertedJobId: 'job-qs', estimatedHours: 0.5 })],
      60,
      ['job-qs'],
    );
    expect(report.eligible).toHaveLength(0);
    expect(report.removed.alreadyQuickStop).toBe(1);
  });

  it('leaves out records that look like the account testing its own form, and counts them', () => {
    const report = screen([
      item({ id: '1', text: 'Kitchen sink drain is clogged', clientEmail: 'me@example.com', estimatedHours: 0.5 }),
      item({ id: '2', text: 'Kitchen sink drain is clogged', clientPhone: '(248) 555-0143', estimatedHours: 0.5 }),
      item({ id: '3', text: 'Kitchen sink drain is clogged', ref: 'J-DEMO-4', estimatedHours: 0.5 }),
      item({ id: '4', text: 'Kitchen sink drain is clogged', clientName: 'Damon Test', estimatedHours: 0.5 }),
    ]);
    // The surname survives. Only the three real markers fired.
    expect(report.eligible.map((entry) => entry.id)).toEqual(['4']);
    expect(report.removed.testData).toBe(3);
    expect(report.screened).toBe(1);
    expect(report.received).toBe(4);
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

  it('lists every side newest first', () => {
    const report = screen([
      item({ id: 'old', text: 'Clear a slow bathroom drain', createdAt: '2026-06-01T00:00:00.000Z', estimatedHours: 0.5 }),
      item({ id: 'new', text: 'Reseat a running toilet', createdAt: '2026-07-20T00:00:00.000Z', estimatedHours: 0.5 }),
      item({ id: 'unknown-old', text: 'Replace a hose bib washer', createdAt: '2026-06-02T00:00:00.000Z' }),
      item({ id: 'unknown-new', text: 'Reseal the toilet base', createdAt: '2026-07-21T00:00:00.000Z' }),
    ]);
    expect(report.eligible.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(report.unknownLength.map((entry) => entry.id)).toEqual(['unknown-new', 'unknown-old']);
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

describe('QuickStopCandidates panel copy', () => {
  const source = readFileSync('src/app/dashboard/quick-stops/QuickStopCandidates.tsx', 'utf8');

  it('claims possible eligibility, not a missed booking', () => {
    expect(source).toContain('Possibly eligible work');
    expect(source).toContain('Possibly eligible');
    expect(source).not.toContain('Work that could have been a Quick Stop');
    expect(source).not.toContain('Would have qualified');
  });

  it('never tells the owner the fee was money they were already owed', () => {
    // The sentence this replaced asserted the fee was incremental — "on work you
    // were doing anyway" — and nothing in the data establishes that.
    expect(source).not.toContain('you were doing anyway');
    expect(source).toContain('not money you lost');
  });

  it('shows the arithmetic instead of just the product', () => {
    expect(source).toMatch(/\{count\} × \{money\(minFeeCents\)\}/);
  });

  it('says how far back it actually read, not just the window', () => {
    expect(source).toContain('CANDIDATE_QUERY_LIMIT');
    expect(source).toContain('most recent leads');
  });

  it('shows the unknown-length pile rather than pricing it', () => {
    expect(source).toContain('report.unknownLength');
    expect(source).toContain('No length recorded');
    // Only the strict bucket is multiplied by money.
    expect(source).toContain('const floorCents = minFeeCents > 0 ? count * minFeeCents : 0;');
  });

  it('surfaces every removal as a count the owner can see', () => {
    expect(source).toContain('Left out before counting');
    expect(source).toContain('report.removed.duplicates');
    expect(source).toContain('report.removed.alreadyQuickStop');
    expect(source).toContain('records that look like test data');
  });

  it('keeps the markup hooks globals.css is keyed to', () => {
    for (const hook of [
      'es-demand-lede',
      'es-demand-headline',
      'es-demand-warn',
      'es-demand-cols',
      'es-demand-col',
      'es-demand-col-head',
      'es-demand-none',
      'es-demand-list',
      'es-demand-item',
      'es-demand-tag',
      'es-demand-more',
      'es-demand-reasons',
      'es-demand-chip',
      'es-demand-rules',
      'es-demand-note',
      'es-demand-tell',
    ]) {
      expect(source).toContain(hook);
    }
  });
});
