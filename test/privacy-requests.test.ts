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

describe('privacy request error handling', () => {
  it('throws when logPrivacyRequest encounters database error', async () => {
    const { logPrivacyRequest } = await import('@/lib/privacy-requests');
    const mockAdmin = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: null, error: { message: 'DB connection error' } }),
          }),
        }),
      }),
    } as any;

    const actor = { adminEmail: 'admin@test.com' } as any;
    await expect(logPrivacyRequest(mockAdmin, actor, 'acct-123', 'access', 'details')).rejects.toThrow(
      'DB connection error',
    );
  });

  it('throws when resolvePrivacyRequest encounters database error or nonexistent ID', async () => {
    const { resolvePrivacyRequest } = await import('@/lib/privacy-requests');
    const mockAdmin = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { message: 'Update failed' } }),
            }),
          }),
        }),
      }),
    } as any;

    const actor = { adminEmail: 'admin@test.com' } as any;
    await expect(resolvePrivacyRequest(mockAdmin, actor, 'req-123')).rejects.toThrow('Update failed');

    const mockAdminNotFound = {
      from: () => ({
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any;

    await expect(resolvePrivacyRequest(mockAdminNotFound, actor, 'req-404')).rejects.toThrow(
      'Privacy request not found or resolution failed',
    );
  });
});
