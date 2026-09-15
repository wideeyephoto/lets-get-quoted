import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadOfferContext, createOffer, resolveOfferReply, OffersUnavailableError } from '@/lib/estimate-offers-data';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn().mockResolvedValue('Acme Corp'),
}));

vi.mock('@/lib/leads', () => ({
  getLeadTriage: vi.fn((l) => l.triage || { flags: [] }),
  isLeadSnoozed: vi.fn().mockReturnValue(false),
  LEAD_PRUNE_FLAGS: new Set(['out_of_area']),
}));

vi.mock('@/lib/phone', () => ({
  normalizeUsPhone: vi.fn((p) => p),
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: vi.fn(),
}));

vi.mock('@/lib/estimate-offers', () => ({
  displayStatus: vi.fn(),
  greetingName: vi.fn().mockReturnValue('John'),
  holdState: vi.fn().mockReturnValue({ holding: true }),
  parseOfferReply: vi.fn(),
  storedWindowLabel: vi.fn().mockReturnValue('12pm - 2pm'),
}));

vi.mock('@/lib/sms', () => ({
  sendOwnerEstimateAcceptedSms: vi.fn(),
}));

describe('Estimate Offers Data Lib', () => {
  let supabaseMock: any;
  let queryMock: any;
  let adminQueryMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
    };

    supabaseMock = {
      from: vi.fn(() => queryMock),
    };

    adminQueryMock = { ...queryMock };
    const createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    (createAdminClientMock as any).mockReturnValue({
      from: vi.fn(() => adminQueryMock)
    });
  });

  describe('loadOfferContext', () => {
    it('returns empty context if missing table', async () => {
      queryMock.order.mockResolvedValue({ error: { code: '42P01' } });
      const res = await loadOfferContext(supabaseMock, 'acct_1', '2023-01-01');
      expect(res.available).toBe(false);
    });

    it('loads offers and candidates', async () => {
      const mockOffers = [{ id: 'offer1', lead_id: 'lead1', offer_date: '2023-01-01' }];
      const mockLeads = [
        { id: 'lead2', status: 'new', converted_job: null, quote_visit: null, triage: { flags: [] }, lat: 1, phone: '123' },
        { id: 'lead3', status: 'new', converted_job: null, quote_visit: null, triage: { flags: ['out_of_area'] }, lat: 1, phone: '123' } // should be filtered out
      ];

      // sequence of calls to 'from'
      // 1. estimate_offers (select, eq, order)
      // 2. leads (select, eq, is, in, not, not, gte, order, limit)
      // 3. leads (names) (select, eq, in)
      
      let callNum = 0;
      supabaseMock.from.mockImplementation(() => {
        callNum++;
        if (callNum === 1) return { ...queryMock, order: vi.fn().mockResolvedValue({ data: mockOffers }) };
        if (callNum === 2) return { ...queryMock, limit: vi.fn().mockResolvedValue({ data: mockLeads }) };
        if (callNum === 3) return { ...queryMock, in: vi.fn().mockResolvedValue({ data: [{ id: 'lead1', name: 'John' }] }) };
      });

      const res = await loadOfferContext(supabaseMock, 'acct_1', '2023-01-01');
      expect(res.available).toBe(true);
      expect(res.offers).toEqual(mockOffers);
      expect(res.candidates.length).toBe(1); // lead2
      expect(res.candidates[0].id).toBe('lead2');
      expect(res.offerLeadNames.get('lead1')).toBe('John');
    });
  });

  describe('createOffer', () => {
    it('inserts and returns offer', async () => {
      queryMock.single.mockResolvedValue({ data: { id: 'offer1' } });
      const res = await createOffer(supabaseMock, { accountId: 'a', leadId: 'l', holdMinutes: 30 } as any);
      expect(res).toEqual({ id: 'offer1' });
    });

    it('throws custom error on unique violation', async () => {
      queryMock.single.mockResolvedValue({ error: { code: '23505' } });
      await expect(createOffer(supabaseMock, { holdMinutes: 30 } as any)).rejects.toThrow(/only ever ask once/);
    });

    it('throws custom error on missing table', async () => {
      queryMock.single.mockResolvedValue({ error: { code: '42P01' } });
      await expect(createOffer(supabaseMock, { holdMinutes: 30 } as any)).rejects.toThrow(OffersUnavailableError);
    });
  });

  describe('resolveOfferReply', () => {
    it('returns unhandled if offer not found', async () => {
      adminQueryMock.maybeSingle.mockResolvedValue({ data: null });
      const res = await resolveOfferReply('acct_1', '123', 'yes');
      expect(res.handled).toBe(false);
    });

    it('handles unclear reply', async () => {
      const parseOfferReplyMock = (await import('@/lib/estimate-offers')).parseOfferReply;
      (parseOfferReplyMock as any).mockReturnValue('unclear');
      
      adminQueryMock.maybeSingle.mockResolvedValue({ data: { id: 'offer1', account_id: 'acct_1', forwarded_at: null } });
      adminQueryMock.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      
      const res = await resolveOfferReply('acct_1', '123', 'what?');
      expect(res.handled).toBe(true);
      expect(res.reply).toContain('Acme Corp');
      expect(adminQueryMock.update).toHaveBeenCalledWith(expect.objectContaining({ forwarded_at: expect.any(String) }));
    });

    it('handles declined reply', async () => {
      const parseOfferReplyMock = (await import('@/lib/estimate-offers')).parseOfferReply;
      (parseOfferReplyMock as any).mockReturnValue('decline');
      
      adminQueryMock.maybeSingle.mockResolvedValue({ data: { id: 'offer1', account_id: 'acct_1' } });
      adminQueryMock.update.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
      
      const res = await resolveOfferReply('acct_1', '123', 'no');
      expect(res.handled).toBe(true);
      expect(res.reply).toContain('No problem');
    });

    it('handles accepted reply when holding', async () => {
      const parseOfferReplyMock = (await import('@/lib/estimate-offers')).parseOfferReply;
      (parseOfferReplyMock as any).mockReturnValue('accept');
      
      adminQueryMock.maybeSingle.mockImplementation(() => {
        // First call is the select
        if (adminQueryMock.maybeSingle.mock.calls.length === 1) {
          return Promise.resolve({ data: { id: 'offer1', account_id: 'acct_1' } });
        }
        // Second call is the insert route_stops select returning the id
        return Promise.resolve({ data: { id: 'stop1' } });
      });
      adminQueryMock.update.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
      
      const res = await resolveOfferReply('acct_1', '123', 'yes');
      expect(res.handled).toBe(true);
      expect(res.reply).toContain('booked');
      expect(adminQueryMock.insert).toHaveBeenCalled(); // route_stops
      expect(adminQueryMock.update).toHaveBeenCalled(); // estimate_offers
      
      const recordAccountEventMock = (await import('@/lib/account-events')).recordAccountEvent;
      expect(recordAccountEventMock).toHaveBeenCalled();
    });

    it('handles accepted reply when no longer holding', async () => {
      const parseOfferReplyMock = (await import('@/lib/estimate-offers')).parseOfferReply;
      (parseOfferReplyMock as any).mockReturnValue('accept');
      
      const holdStateMock = (await import('@/lib/estimate-offers')).holdState;
      (holdStateMock as any).mockReturnValue({ holding: false });
      
      adminQueryMock.maybeSingle.mockResolvedValue({ data: { id: 'offer1', account_id: 'acct_1', account: { alert_phone: '999' } } });
      adminQueryMock.update.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
      
      const res = await resolveOfferReply('acct_1', '123', 'yes');
      expect(res.handled).toBe(true);
      expect(res.reply).toContain('window has just passed');
      
      const sendOwnerSmsMock = (await import('@/lib/sms')).sendOwnerEstimateAcceptedSms;
      expect(sendOwnerSmsMock).toHaveBeenCalled();
    });
  });
});
