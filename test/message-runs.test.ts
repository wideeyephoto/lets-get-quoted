import { describe, it, expect } from 'vitest';
import { groupRuns, initialsFor } from '../src/lib/message-context';

const at = (minutes: number, direction: string) => ({
  created_at: new Date(Date.UTC(2026, 7, 3, 9, minutes)).toISOString(),
  direction,
});

describe('groupRuns', () => {
  it('clusters consecutive messages from the same side', () => {
    const runs = groupRuns([at(0, 'outbound'), at(1, 'outbound'), at(2, 'outbound')]);
    expect(runs).toHaveLength(1);
    expect(runs[0].items).toHaveLength(3);
    expect(runs[0].direction).toBe('outbound');
  });

  it('starts a new run when the side changes', () => {
    const runs = groupRuns([at(0, 'outbound'), at(1, 'inbound'), at(2, 'outbound')]);
    expect(runs.map((run) => run.direction)).toEqual(['outbound', 'inbound', 'outbound']);
  });

  // The reason the gap exists: "on my way" and "running late" three hours apart
  // are two turns, and merging them would stamp the first with the second's time.
  it('starts a new run after a long gap on the same side', () => {
    const runs = groupRuns([at(0, 'outbound'), at(180, 'outbound')]);
    expect(runs).toHaveLength(2);
  });

  it('keeps messages together right up to the gap boundary', () => {
    expect(groupRuns([at(0, 'inbound'), at(5, 'inbound')])).toHaveLength(1);
    expect(groupRuns([at(0, 'inbound'), at(6, 'inbound')])).toHaveLength(2);
  });

  it('honours a custom gap', () => {
    expect(groupRuns([at(0, 'inbound'), at(30, 'inbound')], 60)).toHaveLength(1);
  });

  it('handles an empty thread', () => {
    expect(groupRuns([])).toEqual([]);
  });

  it('never loses or reorders a message', () => {
    const messages = [at(0, 'inbound'), at(1, 'outbound'), at(2, 'outbound'), at(90, 'outbound')];
    const flat = groupRuns(messages).flatMap((run) => run.items);
    expect(flat).toEqual(messages);
  });
});

describe('initialsFor', () => {
  it('takes the first and last name', () => {
    expect(initialsFor('Dana Whitfield')).toBe('DW');
  });

  it('skips middle names', () => {
    expect(initialsFor('Mary Jane Watson')).toBe('MW');
  });

  it('uses two letters of a single name', () => {
    expect(initialsFor('Cher')).toBe('CH');
  });

  it('tolerates messy spacing', () => {
    expect(initialsFor('  damon   pryce  ')).toBe('DP');
  });

  it('falls back rather than rendering empty', () => {
    expect(initialsFor('')).toBe('#');
    expect(initialsFor(null)).toBe('#');
    expect(initialsFor(undefined)).toBe('#');
  });
});
