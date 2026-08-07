import { describe, it, expect } from 'vitest';
import { isCaseStatus, isCasePriority } from '../src/lib/support-cases';

describe('isCaseStatus', () => {
  it('accepts the four known statuses', () => {
    expect(isCaseStatus('open')).toBe(true);
    expect(isCaseStatus('pending')).toBe(true);
    expect(isCaseStatus('resolved')).toBe(true);
    expect(isCaseStatus('closed')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCaseStatus('archived')).toBe(false);
    expect(isCaseStatus('')).toBe(false);
    expect(isCaseStatus(undefined)).toBe(false);
    expect(isCaseStatus(null)).toBe(false);
  });
});

describe('isCasePriority', () => {
  it('accepts the four known priorities', () => {
    expect(isCasePriority('low')).toBe(true);
    expect(isCasePriority('normal')).toBe(true);
    expect(isCasePriority('high')).toBe(true);
    expect(isCasePriority('urgent')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isCasePriority('critical')).toBe(false);
    expect(isCasePriority('')).toBe(false);
    expect(isCasePriority(undefined)).toBe(false);
    expect(isCasePriority(null)).toBe(false);
  });
});
