import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendQuickStopOffer, confirmQuickStopPayment } from '@/lib/quick-stop-payments';
import * as stripeModule from '@/lib/stripe';
import * as paymentsModule from '@/lib/payments';
import * as authModule from '@/lib/auth';
import * as smsModule from '@/lib/sms';
import * as emailModule from '@/lib/email';

vi.mock('@/lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...actual,
    centsToDollars: vi.fn((c: number) => c / 100),
  };
});

vi.mock('@/lib/payments', () => ({
  createDepositRequest: vi.fn(),
  refundPayment: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
}));

vi.mock('@/lib/sms', () => ({
  sendQuickStopOfferSms: vi.fn(),
  sendQuickStopConfirmedSms: vi.fn(),
}));

vi.mock('@/lib/quick-stop-requests', () => ({
  getQuickStopRequest: vi.fn(),
  logQuickStopEvent: vi.fn(),
}));

const mockDb = () => {
  const db: any = {};
  db.from = vi.fn(() => db);
  db.select = vi.fn(() => db);
  db.eq = vi.fn(() => db);
  db.update = vi.fn(() => db);
  db.maybeSingle = vi.fn(() => Promise.resolve({ data: null }));
  db.single = vi.fn(() => Promise.resolve({ data: null }));
  return db;
};

describe('quick-stop-payments', () => {
  let db: any;

  beforeEach(() => {
    vi.clearAllMocks();
    db = mockDb();
    vi.mocked(authModule.createAdminClient).mockReturnValue(db);
  });

  describe('confirmQuickStopPayment', () => {
    it('does nothing if payment not found as confirmed', async () => {
      db.maybeSingle.mockResolvedValueOnce({ data: null }); // update returning nothing
      db.maybeSingle.mockResolvedValueOnce({ data: null }); // fallback check returning nothing
      await confirmQuickStopPayment(db, 'pay_1');
      expect(db.from).toHaveBeenCalledWith('extra_stop_requests');
    });

    it('refunds if payment arrived after expiry', async () => {
      db.maybeSingle.mockResolvedValueOnce({ data: null }); // update returning nothing
      db.maybeSingle.mockResolvedValueOnce({ 
        data: { id: 'req_1', account_id: 'acc_1', status: 'offer_expired', fee_cents: 15000, refund_cents: null } 
      }); 
      
      await confirmQuickStopPayment(db, 'pay_1');
      expect(paymentsModule.refundPayment).toHaveBeenCalledWith(db, 'acc_1', 'pay_1');
      expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'refunded', refund_cents: 15000 }));
    });
  });
});
