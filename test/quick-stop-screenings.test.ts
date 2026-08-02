import { describe, it, expect } from 'vitest';
import { summariseScreenings, type ScreeningRow } from '@/lib/quick-stop-screenings';

// The numbers behind "3 people asked, 2 were turned away, 1 sent to emergency
// help". Getting these wrong reports demand that did not happen, or hides
// demand that did.

const row = (over: Partial<ScreeningRow> = {}): ScreeningRow => ({
  outcome: 'not_a_fit',
  exclusions: ['Large replacement'],
  issue: 'Replace the whole water heater',
  created_at: '2026-08-01T10:00:00.000Z',
  ...over,
});

describe('summariseScreenings', () => {
  it('counts an empty history as nothing asked, not as nothing available', () => {
    // available:true is the point — the table exists and the answer is zero.
    // That is a different statement from "we have no way of knowing".
    expect(summariseScreenings([])).toEqual({
      available: true,
      asked: 0,
      accepted: 0,
      turnedAway: 0,
      unsafe: 0,
      reasons: [],
      examples: [],
    });
  });

  it('splits asked into accepted and turned away', () => {
    const summary = summariseScreenings([
      row({ outcome: 'accepted', exclusions: [] }),
      row({ outcome: 'not_a_fit' }),
      row({ outcome: 'unsafe', exclusions: ['Possible gas leak'] }),
    ]);
    expect(summary.asked).toBe(3);
    expect(summary.accepted).toBe(1);
    expect(summary.turnedAway).toBe(2);
    expect(summary.unsafe).toBe(1);
  });

  it('never files an accepted request under a reason', () => {
    // An accepted request has no reason to be turned away, and counting one
    // would invent a refusal that did not happen.
    const summary = summariseScreenings([row({ outcome: 'accepted', exclusions: ['Large replacement'] })]);
    expect(summary.reasons).toEqual([]);
    expect(summary.examples).toEqual([]);
    expect(summary.turnedAway).toBe(0);
  });

  it('labels unsafe as unsafe whatever else matched', () => {
    // This is the one outcome where the customer was told to call 911 rather
    // than shown a price. Filing it under "large replacement" would lose that.
    const summary = summariseScreenings([
      row({ outcome: 'unsafe', exclusions: ['Possible gas leak', 'Large replacement'] }),
    ]);
    expect(summary.reasons).toEqual([{ label: 'Unsafe — sent to emergency help', count: 1 }]);
  });

  it('gives a refusal with no exclusions something to be counted under', () => {
    // The AI can decline without any hard rule matching. Left unlabelled it
    // would vanish from the reasons while still counting as turned away.
    const summary = summariseScreenings([row({ exclusions: [] }), row({ exclusions: null })]);
    expect(summary.turnedAway).toBe(2);
    expect(summary.reasons).toEqual([{ label: 'Not a short single-visit job', count: 2 }]);
  });

  it('counts a refusal once per reason when several applied', () => {
    const summary = summariseScreenings([row({ exclusions: ['Excavation', 'Large replacement'] })]);
    expect(summary.turnedAway).toBe(1);
    expect(summary.reasons.map((reason) => reason.count)).toEqual([1, 1]);
  });

  it('ranks reasons by how often they happen, biggest first', () => {
    const summary = summariseScreenings([
      row({ exclusions: ['Large replacement'] }),
      row({ exclusions: ['Large replacement'] }),
      row({ exclusions: ['Excavation'] }),
    ]);
    expect(summary.reasons).toEqual([
      { label: 'Large replacement', count: 2 },
      { label: 'Excavation', count: 1 },
    ]);
  });

  it('breaks a tie alphabetically, so the order does not wander between loads', () => {
    const summary = summariseScreenings([row({ exclusions: ['Zebra'] }), row({ exclusions: ['Apple'] })]);
    expect(summary.reasons.map((reason) => reason.label)).toEqual(['Apple', 'Zebra']);
  });

  it('shows a few real examples and stops', () => {
    const summary = summariseScreenings(Array.from({ length: 9 }, (_, i) => row({ issue: `job ${i}` })));
    expect(summary.examples).toHaveLength(4);
    expect(summary.examples[0]).toMatchObject({ issue: 'job 0', label: 'Large replacement' });
  });

  it('skips an example with nothing written down rather than showing a blank quote', () => {
    const summary = summariseScreenings([row({ issue: null }), row({ issue: 'a real one' })]);
    expect(summary.examples).toHaveLength(1);
    expect(summary.examples[0].issue).toBe('a real one');
    // …but it still counts as demand that was turned away.
    expect(summary.turnedAway).toBe(2);
  });

  it('tags each example with the reason it was refused for', () => {
    const summary = summariseScreenings([row({ outcome: 'unsafe', exclusions: ['Possible gas leak'], issue: 'smells of gas' })]);
    expect(summary.examples[0].label).toBe('Unsafe — sent to emergency help');
  });
});
