import { describe, it, expect } from 'vitest';
import {
  PORTAL_LINK_DAYS,
  PORTAL_REQUEST_ACK,
  PORTAL_TOKEN_BYTES,
  createPortalToken,
  hashPortalToken,
  portalExpiry,
  summarisePortal,
  type PortalJob,
} from '@/lib/client-portal';

function job(overrides: Partial<PortalJob> = {}): PortalJob {
  return {
    id: 'j1',
    ref: 'J-1001',
    scope: 'New roof',
    status: 'complete',
    scheduledFor: '2025-06-01',
    completedAt: '2025-06-04',
    address: '12 Elm St',
    quotedAmount: 12000,
    ...overrides,
  };
}

describe('portal tokens', () => {
  it('is long enough that guessing is not a strategy', () => {
    const token = createPortalToken();
    expect(token).toHaveLength(PORTAL_TOKEN_BYTES * 2);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, createPortalToken));
    expect(tokens.size).toBe(200);
  });

  it('hashes deterministically and irreversibly', () => {
    // Only the hash is stored, so a database read can't reconstruct a live link
    // into somebody's home-improvement history.
    const token = createPortalToken();
    expect(hashPortalToken(token)).toBe(hashPortalToken(token));
    expect(hashPortalToken(token)).toHaveLength(64);
    expect(hashPortalToken(token)).not.toContain(token);
  });

  it('expires', () => {
    const now = new Date('2026-08-03T12:00:00Z');
    expect(portalExpiry(now)).toBe(new Date('2026-11-01T12:00:00Z').toISOString());
    expect(PORTAL_LINK_DAYS).toBe(90);
  });
});

describe('PORTAL_REQUEST_ACK', () => {
  it('is conditional, so it can be said to anybody', () => {
    // The whole anti-enumeration design rests on this string being the answer
    // whether or not the address matched. If it ever asserts an account exists,
    // the page starts telling strangers which neighbours used this contractor.
    expect(PORTAL_REQUEST_ACK).toMatch(/if we have/i);
    expect(PORTAL_REQUEST_ACK).not.toMatch(/\byour account\b|\bwe found\b|\bnot found\b|\bno record\b/i);
  });
});

describe('summarisePortal', () => {
  it('dates the relationship from the oldest job, not the newest', () => {
    const view = summarisePortal({
      businessName: 'BrokePipes',
      clientName: 'Jane Homeowner',
      jobs: [job({ id: 'new', completedAt: '2026-01-10' }), job({ id: 'old', completedAt: '2023-04-02' })],
    });
    expect(view.firstJobAt).toBe('2023-04-02');
    expect(view.totalJobs).toBe(2);
  });

  it('falls back to the scheduled date when a job was never marked finished', () => {
    const view = summarisePortal({
      businessName: 'X',
      clientName: 'Y',
      jobs: [job({ completedAt: null, scheduledFor: '2024-02-02' })],
    });
    expect(view.firstJobAt).toBe('2024-02-02');
  });

  it('says nothing rather than inventing a date for an undated job', () => {
    const view = summarisePortal({
      businessName: 'X',
      clientName: 'Y',
      jobs: [job({ completedAt: null, scheduledFor: null })],
    });
    expect(view.firstJobAt).toBeNull();
    expect(view.totalJobs).toBe(1);
  });

  it('handles a client with no jobs at all', () => {
    const view = summarisePortal({ businessName: 'X', clientName: 'Y', jobs: [] });
    expect(view.totalJobs).toBe(0);
    expect(view.firstJobAt).toBeNull();
  });
});
