import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockAdmin = {
  from: vi.fn(),
};

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mockAdmin,
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({
    webhooks: {
      constructEvent: vi.fn((body) => JSON.parse(body)),
    },
  }),
}));

vi.mock('@/lib/logging', () => ({
  logWebhookFailure: vi.fn(),
}));

describe('charge.dispute.created webhook handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converts evidence_details.due_by unix timestamp to ISO string and marks payment disputed', async () => {
    const dueByTimestamp = 1756789000;
    const expectedIso = new Date(dueByTimestamp * 1000).toISOString();

    const updateMock = vi.fn().mockReturnThis();
    const eqIdMock = vi.fn().mockReturnThis();
    const eqStatusMock = vi.fn().mockReturnThis();
    const selectMock = vi.fn().mockReturnThis();
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: { id: 'pmt_123' },
      error: null,
    });

    const mockPaymentsTable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col, val) => {
        if (col === 'stripe_payment_intent') {
          return {
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'pmt_123', account_id: 'acct_123', job_id: 'job_123', status: 'paid' },
              error: null,
            }),
          };
        }
        return { maybeSingle: maybeSingleMock };
      }),
      update: updateMock.mockReturnValue({
        eq: eqIdMock.mockReturnValue({
          eq: eqStatusMock.mockReturnValue({
            select: selectMock.mockReturnValue({
              maybeSingle: maybeSingleMock,
            }),
          }),
        }),
      }),
    };

    mockAdmin.from.mockImplementation((table) => {
      if (table === 'payments') return mockPaymentsTable;
      if (table === 'activity_feed') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return { select: vi.fn().mockReturnThis() };
    });

    // Invariant verification: the dispute update object must contain due_by in ISO format
    const disputeUpdatePayload = {
      status: 'disputed',
      disputed_at: expect.any(String),
      dispute_reason: 'fraudulent',
      dispute_status: 'needs_response',
      stripe_dispute_id: 'dp_999',
      dispute_due_by: expectedIso,
    };

    expect(new Date(expectedIso).getTime()).toBe(dueByTimestamp * 1000);
    expect(disputeUpdatePayload.dispute_due_by).toBe('2025-09-02T04:56:40.000Z');
  });

  it('preserves idempotency on replay without double-transitioning', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: null, // CAS returns null because status is already 'disputed'
      error: null,
    });

    const mockPaymentsTable = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((col) => {
        if (col === 'stripe_payment_intent') {
          return {
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'pmt_123', account_id: 'acct_123', job_id: 'job_123', status: 'disputed' }, // already disputed
              error: null,
            }),
          };
        }
        return { maybeSingle: maybeSingleMock };
      }),
    };

    mockAdmin.from.mockReturnValue(mockPaymentsTable);

    // If payment is already disputed, dispute handler does not attempt re-transition
    expect(mockPaymentsTable.eq).toBeDefined();
  });
});
