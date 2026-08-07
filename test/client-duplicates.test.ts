import { describe, it, expect } from 'vitest';
import {
  findDuplicateGroups,
  mergedFields,
  suggestSurvivor,
  type DuplicateCandidate,
} from '@/lib/client-duplicates';

function client(over: Partial<DuplicateCandidate & { created_at: string }> = {}) {
  return {
    id: 'c1',
    name: 'Ada Reyes',
    phone: null,
    email: null,
    address: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('findDuplicateGroups', () => {
  it('matches a phone written two different ways', () => {
    const groups = findDuplicateGroups([
      client({ id: 'a', phone: '+12485550117' }),
      client({ id: 'b', phone: '(248) 555-0117' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('phone');
    expect(groups[0].members.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('matches an email regardless of case or padding', () => {
    const groups = findDuplicateGroups([
      client({ id: 'a', email: 'Ada@Example.com' }),
      client({ id: 'b', email: '  ada@example.com ' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('email');
  });

  // The rule that stops this crying wolf. Two households called Smith are two
  // households, and a duplicate finder that says otherwise gets switched off.
  it('never groups on a name alone', () => {
    expect(findDuplicateGroups([client({ id: 'a' }), client({ id: 'b' })])).toEqual([]);
  });

  it('groups on name AND address together', () => {
    const groups = findDuplicateGroups([
      client({ id: 'a', name: 'Ada Reyes', address: '12 Oak St.' }),
      client({ id: 'b', name: 'ada reyes', address: '12 oak st' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('name-and-address');
  });

  it('leaves the same name at different addresses alone', () => {
    const groups = findDuplicateGroups([
      client({ id: 'a', name: 'Ada Reyes', address: '12 Oak St' }),
      client({ id: 'b', name: 'Ada Reyes', address: '40 Pine Ave' }),
    ]);
    expect(groups).toEqual([]);
  });

  // Two cards proposing the same merge is how five real duplicates read as ten.
  it('reports a pair once when it matches on more than one rule', () => {
    const groups = findDuplicateGroups([
      client({ id: 'a', phone: '2485550117', email: 'ada@example.com' }),
      client({ id: 'b', phone: '2485550117', email: 'ada@example.com' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reason).toBe('phone');
  });

  it('handles three records sharing one number as a single group', () => {
    const groups = findDuplicateGroups([
      client({ id: 'a', phone: '2485550117' }),
      client({ id: 'b', phone: '2485550117' }),
      client({ id: 'c', phone: '2485550117' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
  });

  it('ignores blank contact fields rather than grouping everyone without a phone', () => {
    const groups = findDuplicateGroups([
      client({ id: 'a', phone: null, email: '' }),
      client({ id: 'b', phone: '', email: null }),
      client({ id: 'c', phone: '   ' }),
    ]);
    expect(groups).toEqual([]);
  });

  it('says nothing about a clean book', () => {
    expect(
      findDuplicateGroups([
        client({ id: 'a', phone: '2485550117' }),
        client({ id: 'b', phone: '2485550118' }),
      ]),
    ).toEqual([]);
  });
});

describe('suggestSurvivor', () => {
  it('prefers the most complete record', () => {
    const sparse = client({ id: 'sparse', phone: '2485550117' });
    const full = client({ id: 'full', phone: '2485550117', email: 'a@b.com', address: '12 Oak St' });
    expect(suggestSurvivor([sparse, full]).id).toBe('full');
  });

  it('falls back to the oldest when completeness ties', () => {
    const older = client({ id: 'older', phone: '2485550117', created_at: '2025-01-01T00:00:00.000Z' });
    const newer = client({ id: 'newer', phone: '2485550117', created_at: '2026-01-01T00:00:00.000Z' });
    expect(suggestSurvivor([newer, older]).id).toBe('older');
  });
});

describe('mergedFields', () => {
  it('fills a blank from the record being absorbed', () => {
    const survivor = client({ id: 'a', phone: '2485550117' });
    const other = client({ id: 'b', email: 'ada@example.com', address: '12 Oak St' });
    const merged = mergedFields(survivor, [other]);
    expect(merged.email).toBe('ada@example.com');
    expect(merged.address).toBe('12 Oak St');
    expect(merged.conflicts).toEqual([]);
  });

  // The rule that makes this safe to run. Losing a customer's real number to a
  // merge would be worse than the duplicate ever was.
  it('never overwrites a value somebody typed', () => {
    const survivor = client({ id: 'a', phone: '2485550117' });
    const other = client({ id: 'b', phone: '2485559999' });
    const merged = mergedFields(survivor, [other]);
    expect(merged.phone).toBe('2485550117');
    expect(merged.conflicts).toHaveLength(1);
    expect(merged.conflicts[0]).toContain('2485559999');
  });

  it('does not call the same number written differently a conflict', () => {
    const survivor = client({ id: 'a', phone: '+12485550117' });
    const other = client({ id: 'b', phone: '(248) 555-0117' });
    expect(mergedFields(survivor, [other]).conflicts).toEqual([]);
  });

  it('does not call the same address punctuated differently a conflict', () => {
    const survivor = client({ id: 'a', address: '12 Oak St.' });
    const other = client({ id: 'b', address: '12 oak st' });
    expect(mergedFields(survivor, [other]).conflicts).toEqual([]);
  });

  it('takes a name from the absorbed record when the survivor has none', () => {
    const survivor = client({ id: 'a', name: '   ' });
    const other = client({ id: 'b', name: 'Ada Reyes' });
    expect(mergedFields(survivor, [other]).name).toBe('Ada Reyes');
  });

  it('never returns an empty name', () => {
    const survivor = client({ id: 'a', name: '' });
    const other = client({ id: 'b', name: '' });
    expect(mergedFields(survivor, [other]).name).toBe('Client');
  });
});
