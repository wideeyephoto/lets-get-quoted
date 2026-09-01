import { describe, it, expect } from 'vitest';
import {
  PORTAL_LINK_DAYS,
  PORTAL_REQUEST_ACK,
  PORTAL_TOKEN_BYTES,
  createPortalToken,
  hashPortalToken,
  portalExpiry,
  summarisePortal,
  type PortalDocument,
  type PortalJob,
  type PortalMessage,
  type PortalPlan,
  type PortalQuote,
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

function quote(overrides: Partial<PortalQuote> = {}): PortalQuote {
  return {
    id: 'q1',
    jobId: 'j1',
    ref: 'Q-1001',
    scope: 'Roof Replacement',
    status: 'new_lead',
    statusLabel: 'Ready for Review',
    quotedAmount: 8500,
    depositGate: 'before_schedule',
    depositPercent: 25,
    depositAmount: 2125,
    items: [
      { id: 'i1', label: 'Architectural Shingles', amount: 7500, kind: 'base', selected: true, recommended: false },
      { id: 'i2', label: 'Ridge Vent Upgrade', amount: 1000, kind: 'addon', selected: false, recommended: true },
    ],
    hasAddons: true,
    hasSubscriptions: false,
    approved: false,
    address: '12 Elm St',
    scheduledFor: null,
    createdAt: '2026-08-01T10:00:00Z',
    ...overrides,
  };
}

function plan(overrides: Partial<PortalPlan> = {}): PortalPlan {
  return {
    id: 'p1',
    title: 'Seasonal Gutter & Roof Inspection',
    scope: 'Quarterly debris clearing and leak check',
    kind: 'recurring_service',
    status: 'active',
    statusLabel: 'Active',
    amount: 149,
    frequency: 'monthly',
    frequencyLabel: 'Monthly',
    nextRunDate: '2026-09-15',
    autoCharge: true,
    cardBrand: 'Visa',
    cardLast4: '4242',
    paymentMethodSummary: 'Visa ending in 4242',
    remainingCycles: null,
    totalCycles: null,
    createdAt: '2026-07-01T00:00:00Z',
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
    expect(view.activeQuotesCount).toBe(0);
    expect(view.activePlansCount).toBe(0);
  });

  it('correctly aggregates quotes, plans, documents, and messages counts', () => {
    const quotes = [
      quote({ id: 'q1', status: 'new_lead', approved: false }),
      quote({ id: 'q2', status: 'in_progress', approved: true }),
    ];
    const plans = [
      plan({ id: 'p1', status: 'active' }),
      plan({ id: 'p2', status: 'paused' }),
    ];
    const documents: PortalDocument[] = [
      { id: 'd1', title: 'Invoice #101', kind: 'invoice', kindLabel: 'Invoice', jobId: 'j1', jobRef: 'J-1001', jobScope: 'Roofing', url: '/invoice/101', createdAt: '2026-08-01' },
      { id: 'd2', title: 'Warranty Cert', kind: 'warranty', kindLabel: 'Warranty Certificate', jobId: 'j1', jobRef: 'J-1001', jobScope: 'Roofing', url: null, createdAt: '2026-08-01' },
    ];
    const messages: PortalMessage[] = [
      { id: 'm1', direction: 'inbound', sender: 'You', body: 'Can we schedule for Tuesday?', channel: 'sms', createdAt: '2026-08-05' },
      { id: 'm2', direction: 'outbound', sender: 'TrueCoat Painting', body: 'Tuesday 9am works great!', channel: 'sms', createdAt: '2026-08-05' },
    ];

    const view = summarisePortal({
      businessName: 'Apex Roofing',
      clientName: 'Sarah Jenkins',
      jobs: [job({ id: 'j1', scheduledFor: '2026-08-10' })],
      quotes,
      plans,
      documents,
      messages,
    });

    expect(view.totalJobs).toBe(1);
    expect(view.activeQuotesCount).toBe(1);
    expect(view.activePlansCount).toBe(1);
    expect(view.documentsCount).toBe(2);
    expect(view.messagesCount).toBe(2);
  });
});
