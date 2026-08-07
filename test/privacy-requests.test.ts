import { describe, it, expect } from 'vitest';
import { isPrivacyRequestKind } from '@/lib/privacy-requests';

describe('isPrivacyRequestKind', () => {
  it('accepts every real kind', () => {
    expect(isPrivacyRequestKind('access')).toBe(true);
    expect(isPrivacyRequestKind('deletion')).toBe(true);
    expect(isPrivacyRequestKind('correction')).toBe(true);
    expect(isPrivacyRequestKind('other')).toBe(true);
  });

  it('rejects anything not on the list', () => {
    expect(isPrivacyRequestKind('deleted')).toBe(false);
    expect(isPrivacyRequestKind('ACCESS')).toBe(false);
    expect(isPrivacyRequestKind('')).toBe(false);
  });

  it('rejects undefined and null', () => {
    expect(isPrivacyRequestKind(undefined)).toBe(false);
    expect(isPrivacyRequestKind(null)).toBe(false);
  });
});
