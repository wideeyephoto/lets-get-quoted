import { describe, expect, it } from 'vitest';
import {
  canRequestPayment, countPhotos, milestoneCoverage, milestoneProgressPct, milestoneReadiness,
  milestoneStatus, milestoneTotals, presetAmounts, MILESTONE_PRESETS,
  type Milestone, type MilestonePayment, type MilestoneProof,
} from '@/lib/milestones';

// The gate is the feature. Everything below asks one of two questions: can this
// contractor ask to be paid yet, and does the homeowner get told the truth
// about why not.

const MILESTONE: Milestone = {
  id: 'm1',
  title: 'Rough-in complete',
  scope: 'All supply lines run and pressure tested.',
  amount: 2400,
  sortOrder: 0,
  kind: 'stage',
  requireBeforePhotos: 1,
  requireAfterPhotos: 2,
  submittedAt: null,
  paymentId: null,
};

const photo = (phase: 'before' | 'after', id = Math.random().toString(36)) =>
  ({ id, path: `acc/${id}.jpg`, phase, caption: null });

const proofOf = (done: number, total: number, before: number, after: number): MilestoneProof => ({
  tasks: Array.from({ length: total }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, done: i < done })),
  photos: [
    ...Array.from({ length: before }, (_, i) => photo('before', `b${i}`)),
    ...Array.from({ length: after }, (_, i) => photo('after', `a${i}`)),
  ],
});

const COMPLETE = proofOf(3, 3, 1, 2);

describe('the proof gate', () => {
  it('opens only when every requirement is met', () => {
    const readiness = milestoneReadiness(MILESTONE, COMPLETE);
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it('names exactly what is missing, and how much of it', () => {
    // A contractor staring at a disabled button needs to know which two photos
    // to go and take — not that the system is unhappy with them.
    const readiness = milestoneReadiness(MILESTONE, proofOf(1, 3, 0, 1));
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual([
      '2 of 3 checklist items still to tick off.',
      'Add 1 more “before” photo.',
      'Add 1 more “after” photo.',
    ]);
  });

  it('blocks an unpriced milestone, and says so first', () => {
    // The one blocker that isn't about site work, and the one they'd otherwise
    // hunt for after clearing everything else.
    const readiness = milestoneReadiness({ ...MILESTONE, amount: 0 }, COMPLETE);
    expect(readiness.blockers[0]).toContain('Set an amount');
  });

  it('requires no photos when none were asked for', () => {
    // A deposit taken before anyone is on site has nothing to photograph, and
    // demanding a picture of an empty driveway teaches people to upload noise.
    const deposit = { ...MILESTONE, kind: 'deposit' as const, requireBeforePhotos: 0, requireAfterPhotos: 0 };
    expect(milestoneReadiness(deposit, { tasks: [], photos: [] }).ready).toBe(true);
  });

  it('counts extra photos as satisfying the requirement, not as blockers', () => {
    expect(milestoneReadiness(MILESTONE, proofOf(3, 3, 4, 9)).ready).toBe(true);
  });

  it('does not accept an "after" photo in place of a missing "before"', () => {
    const readiness = milestoneReadiness(MILESTONE, proofOf(3, 3, 0, 5));
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join(' ')).toContain('before');
  });

  it('counts photos by phase', () => {
    expect(countPhotos(COMPLETE.photos, 'before')).toBe(1);
    expect(countPhotos(COMPLETE.photos, 'after')).toBe(2);
  });
});

describe('requesting payment', () => {
  const paid: MilestonePayment = { id: 'p1', status: 'paid', amount: 2400 };

  it('is allowed once the gate opens', () => {
    expect(canRequestPayment(MILESTONE, COMPLETE, null)).toBe(true);
  });

  it('is refused while the proof is incomplete', () => {
    expect(canRequestPayment(MILESTONE, proofOf(2, 3, 1, 2), null)).toBe(false);
  });

  it('will not double-bill work that is already asked for or paid', () => {
    for (const status of ['requested', 'processing', 'paid', 'disputed'] as const) {
      expect(canRequestPayment(MILESTONE, COMPLETE, { ...paid, status })).toBe(false);
    }
  });

  it('lets a contractor ask again after a failed or refunded payment', () => {
    // The work still happened. Refusing forever would push them off-system.
    expect(canRequestPayment(MILESTONE, COMPLETE, { ...paid, status: 'failed' })).toBe(true);
    expect(canRequestPayment(MILESTONE, COMPLETE, { ...paid, status: 'refunded' })).toBe(true);
  });
});

describe('status', () => {
  it('reads the payment as the truth once one exists', () => {
    expect(milestoneStatus(MILESTONE, COMPLETE, { id: 'p', status: 'paid', amount: 1 })).toBe('paid');
    expect(milestoneStatus(MILESTONE, COMPLETE, { id: 'p', status: 'requested', amount: 1 })).toBe('awaiting_payment');
    expect(milestoneStatus(MILESTONE, COMPLETE, { id: 'p', status: 'processing', amount: 1 })).toBe('awaiting_payment');
  });

  it('keeps a refund as its own state, never as paid and never as ready', () => {
    // Calling it either would let the same work be billed twice or look
    // unbilled forever.
    expect(milestoneStatus(MILESTONE, COMPLETE, { id: 'p', status: 'refunded', amount: 1 })).toBe('refunded');
  });

  it('distinguishes untouched from part-done', () => {
    expect(milestoneStatus(MILESTONE, proofOf(0, 3, 0, 0), null)).toBe('planned');
    expect(milestoneStatus(MILESTONE, proofOf(1, 3, 0, 0), null)).toBe('in_progress');
    expect(milestoneStatus(MILESTONE, proofOf(0, 3, 1, 0), null)).toBe('in_progress');
    expect(milestoneStatus(MILESTONE, COMPLETE, null)).toBe('ready');
  });
});

describe('progress', () => {
  it('counts tasks and required photos together', () => {
    // 3 tasks + 1 before + 2 after = 6 required. Half done = 50%.
    expect(milestoneProgressPct(MILESTONE, proofOf(2, 3, 1, 0))).toBe(50);
    expect(milestoneProgressPct(MILESTONE, COMPLETE)).toBe(100);
  });

  it('will not let surplus photos push progress past the real work', () => {
    // A tenth "after" photo is not more evidence than the two that were asked
    // for, and letting it fill the bar would make the number meaningless.
    expect(milestoneProgressPct(MILESTONE, proofOf(0, 3, 9, 9))).toBe(50);
  });

  it('treats a milestone with no requirements as done once it is priced', () => {
    const bare = { ...MILESTONE, requireBeforePhotos: 0, requireAfterPhotos: 0 };
    expect(milestoneProgressPct(bare, { tasks: [], photos: [] })).toBe(100);
    expect(milestoneProgressPct({ ...bare, amount: 0 }, { tasks: [], photos: [] })).toBe(0);
  });
});

describe('the money', () => {
  const entry = (amount: number, proof: MilestoneProof, payment: MilestonePayment | null) => ({
    milestone: { ...MILESTONE, amount },
    proof,
    payment,
  });

  it('separates paid, asked-for, and proven-but-unbilled', () => {
    const totals = milestoneTotals([
      entry(1000, COMPLETE, { id: 'p1', status: 'paid', amount: 1000 }),
      entry(2000, COMPLETE, { id: 'p2', status: 'requested', amount: 2000 }),
      entry(1500, COMPLETE, null),
      entry(500, proofOf(0, 3, 0, 0), null),
    ]);
    expect(totals.paid).toBe(1000);
    expect(totals.awaiting).toBe(2000);
    // The number this whole feature exists to surface: finished, proven, and
    // nobody has asked to be paid for it.
    expect(totals.readyToBill).toBe(1500);
    expect(totals.planned).toBe(5000);
  });

  it('counts what was actually paid, not what was planned', () => {
    // A partial settlement should not report the full milestone as collected.
    const totals = milestoneTotals([entry(1000, COMPLETE, { id: 'p', status: 'paid', amount: 900 })]);
    expect(totals.paid).toBe(900);
  });

  it('is all zeroes for a job with no milestones', () => {
    expect(milestoneTotals([])).toEqual({ planned: 0, paid: 0, awaiting: 0, readyToBill: 0 });
  });
});

describe('coverage against the quote', () => {
  it('warns when the stages do not add up to the quote', () => {
    const { note, difference } = milestoneCoverage(6000, 8000);
    expect(difference).toBe(-2000);
    expect(note).toContain('isn’t in a stage yet');
  });

  it('warns the other way too, without refusing it', () => {
    // A job that grew mid-build legitimately bills more than it was quoted.
    const { note } = milestoneCoverage(9000, 8000);
    expect(note).toContain('more than');
  });

  it('ignores rounding dust', () => {
    expect(milestoneCoverage(7999, 8000).note).toBeNull();
  });

  it('says nothing when there is no quote to compare against', () => {
    expect(milestoneCoverage(5000, 0).note).toBeNull();
  });
});

describe('presets', () => {
  it('splits a quote into stages that sum to exactly the whole', () => {
    // Milestones adding up to $9,999.98 of a $10,000 job is the detail that
    // makes a customer distrust the rest of the document.
    for (const total of [10000, 8333.33, 999.99, 1]) {
      const amounts = presetAmounts(total);
      const sum = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
      expect(sum, `presets did not sum for ${total}`).toBe(Math.round(total * 100) / 100);
    }
  });

  it('opens with a deposit and closes with a final', () => {
    expect(MILESTONE_PRESETS[0].kind).toBe('deposit');
    expect(MILESTONE_PRESETS[MILESTONE_PRESETS.length - 1].kind).toBe('final');
    expect(MILESTONE_PRESETS.reduce((sum, preset) => sum + preset.percent, 0)).toBe(100);
  });

  it('produces zeroes rather than nonsense for an unquoted job', () => {
    expect(presetAmounts(0)).toEqual([0, 0, 0, 0]);
  });
});
