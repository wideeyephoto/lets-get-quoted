import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleWaitlistInboundReply } from '@/lib/waitlist-inbound';
import type { WaitlistOffer } from '@/lib/cancellation-waitlist';

const mocks = vi.hoisted(() => ({
  loadBusinessName: vi.fn(),
  enqueueSmsDelivery: vi.fn(),
  recordAccountEvent: vi.fn(),
  resolveWaitlistOfferReply: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: mocks.loadBusinessName,
}));

vi.mock('@/lib/sms-delivery', () => ({
  enqueueSmsDelivery: mocks.enqueueSmsDelivery,
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: mocks.recordAccountEvent,
}));

vi.mock('@/lib/cancellation-waitlist-data', () => ({
  resolveWaitlistOfferReply: mocks.resolveWaitlistOfferReply,
}));

describe('handleWaitlistInboundReply', () => {
  const accountId = 'acc-12345';
  const customerPhone = '+15551234567';

  const mockActiveOffer: WaitlistOffer = {
    id: 'offer-1',
    account_id: accountId,
    waitlist_entry_id: 'entry-1',
    client_id: null,
    job_id: null,
    lead_id: null,
    status: 'pending',
    opened_slot_date: '2026-09-10',
    window_start: '09:00',
    window_end: '13:00',
    arrival_time: '09:00',
    priority_rank: 1,
    priority_score: 100,
    score_breakdown: {
      proximityScore: 20,
      distanceMiles: 2.5,
      waitTimeScore: 15,
      daysWaiting: 3,
      urgencyScore: 10,
      windowFitScore: 10,
      valueScore: 10,
      totalScore: 65,
    },
    hold_minutes: 60,
    auto_cascade: true,
    phone: customerPhone,
    body: 'Test offer body',
    hold_expires_at: new Date(Date.now() + 600000).toISOString(), // 10m in future
    sent_at: new Date().toISOString(),
    reply_body: null,
    replied_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadBusinessName.mockResolvedValue('Apex Electric');
    mocks.enqueueSmsDelivery.mockResolvedValue({ success: true });
    mocks.recordAccountEvent.mockResolvedValue(undefined);
    mocks.resolveWaitlistOfferReply.mockResolvedValue({
      offer: mockActiveOffer,
      waitlistEntry: { id: 'entry-1' },
    });
  });

  it('rejects invalid phone numbers immediately', async () => {
    const mockAdmin: any = {};
    const result = await handleWaitlistInboundReply(mockAdmin, {
      fromPhone: 'invalid-phone',
      body: 'YES',
    });

    expect(result.handled).toBe(false);
    expect(result.reason).toBe('Invalid phone format');
  });

  it('handles YES reply: resolves offer as accepted, sends confirmation SMS, and records event', async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGte = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockResolvedValue({ data: [mockActiveOffer], error: null });

    const mockAdmin: any = {
      from: vi.fn().mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        gte: mockGte,
        order: mockOrder,
        limit: mockLimit,
      }),
    };

    const result = await handleWaitlistInboundReply(mockAdmin, {
      accountId,
      fromPhone: '(555) 123-4567',
      body: 'YES please!',
    });

    expect(result.handled).toBe(true);
    expect(result.decision).toBe('accepted');
    expect(result.offerId).toBe('offer-1');

    expect(mocks.resolveWaitlistOfferReply).toHaveBeenCalledWith(
      mockAdmin,
      'offer-1',
      'YES please!',
      accountId,
    );

    expect(mocks.enqueueSmsDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        phoneNumber: customerPhone,
        messageKind: 'waitlist_offer',
        body: expect.stringContaining('Your appointment is confirmed'),
        idempotencyKey: 'waitlist-accept-ack:offer-1',
      }),
    );

    expect(mocks.recordAccountEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        kind: 'automation_toggled',
      }),
    );
  });

  it('handles NO reply: resolves offer as declined, sends acknowledgment SMS, and cascades', async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGte = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockResolvedValue({ data: [mockActiveOffer], error: null });
    const mockUpdate = vi.fn().mockReturnThis();

    const mockAdmin: any = {
      from: vi.fn().mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        gte: mockGte,
        order: mockOrder,
        limit: mockLimit,
        update: mockUpdate,
      }),
    };

    const result = await handleWaitlistInboundReply(mockAdmin, {
      accountId,
      fromPhone: customerPhone,
      body: 'NO thanks',
    });

    expect(result.handled).toBe(true);
    expect(result.decision).toBe('declined');
    expect(result.offerId).toBe('offer-1');

    expect(mocks.resolveWaitlistOfferReply).toHaveBeenCalledWith(
      mockAdmin,
      'offer-1',
      'NO thanks',
      accountId,
    );

    expect(mocks.enqueueSmsDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        phoneNumber: customerPhone,
        messageKind: 'waitlist_offer',
        body: expect.stringContaining("You're still on our waitlist"),
        idempotencyKey: 'waitlist-decline-ack:offer-1',
      }),
    );

    expect(mocks.recordAccountEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        kind: 'automation_toggled',
      }),
    );
  });

  it('handles ambiguous reply: records reply_body and replied_at without resolving offer', async () => {
    const mockSelect = vi.fn().mockReturnThis();
    const mockEq = vi.fn().mockReturnThis();
    const mockGte = vi.fn().mockReturnThis();
    const mockOrder = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockResolvedValue({ data: [mockActiveOffer], error: null });

    const mockUpdate = vi.fn().mockReturnThis();

    const mockAdmin: any = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'waitlist_offers') {
          return {
            select: mockSelect,
            eq: mockEq,
            gte: mockGte,
            order: mockOrder,
            limit: mockLimit,
            update: mockUpdate,
          };
        }
        return {};
      }),
    };

    const result = await handleWaitlistInboundReply(mockAdmin, {
      accountId,
      fromPhone: customerPhone,
      body: 'Can we do 2pm instead of 9am?',
    });

    expect(result.handled).toBe(true);
    expect(result.decision).toBe('ambiguous');
    expect(result.offerId).toBe('offer-1');

    // Should NOT call resolveWaitlistOfferReply or send ack SMS
    expect(mocks.resolveWaitlistOfferReply).not.toHaveBeenCalled();
    expect(mocks.enqueueSmsDelivery).not.toHaveBeenCalled();

    // Should record the text on waitlist_offers
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        reply_body: 'Can we do 2pm instead of 9am?',
      }),
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'offer-1');
    expect(mockEq).toHaveBeenCalledWith('account_id', accountId);
  });

  it('notifies customer when replying to a recently expired offer', async () => {
    const mockExpiredOffer: WaitlistOffer = {
      ...mockActiveOffer,
      id: 'offer-expired-1',
      status: 'expired',
      hold_expires_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      sent_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    };

    let queryCount = 0;
    const mockAdmin: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          queryCount++;
          if (queryCount === 1) {
            // First query: active offers -> none
            return Promise.resolve({ data: [], error: null });
          }
          // Second query: expired offers within 24h -> returns expired offer
          return Promise.resolve({ data: [mockExpiredOffer], error: null });
        }),
      }),
    };

    const result = await handleWaitlistInboundReply(mockAdmin, {
      accountId,
      fromPhone: customerPhone,
      body: 'YES',
    });

    expect(result.handled).toBe(true);
    expect(result.offerId).toBe('offer-expired-1');
    expect(result.reason).toBe('Offer hold expired');

    expect(mocks.enqueueSmsDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        phoneNumber: customerPhone,
        body: expect.stringContaining('This opening is no longer available as the hold time elapsed'),
        idempotencyKey: 'waitlist-expired-reply:offer-expired-1',
      }),
    );
  });

  it('returns handled: false when no active or expired offer matches', async () => {
    const mockAdmin: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    const result = await handleWaitlistInboundReply(mockAdmin, {
      accountId,
      fromPhone: customerPhone,
      body: 'YES',
    });

    expect(result.handled).toBe(false);
    expect(result.reason).toBe('No matching waitlist offer found');
    expect(mocks.resolveWaitlistOfferReply).not.toHaveBeenCalled();
    expect(mocks.enqueueSmsDelivery).not.toHaveBeenCalled();
  });
});
