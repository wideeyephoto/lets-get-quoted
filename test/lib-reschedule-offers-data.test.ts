import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  loadRescheduleContext, 
  findBetterDays, 
  createRescheduleOffer, 
  deleteRescheduleOffer, 
  cancelRescheduleOffer, 
  resolveRescheduleReply 
} from '@/lib/reschedule-offers-data';
import * as authModule from '@/lib/auth';
import * as smsModule from '@/lib/sms';
import * as rescheduleOffersModule from '@/lib/reschedule-offers';
import * as jobsModule from '@/lib/jobs';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn().mockResolvedValue('My Biz'),
}));

vi.mock('@/lib/sms', () => ({
  sendOwnerEstimateAcceptedSms: vi.fn(),
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: vi.fn(),
}));

vi.mock('@/lib/estimate-offers', () => ({
  greetingName: vi.fn().mockReturnValue('John'),
}));

vi.mock('@/lib/reschedule-offers', async (importOriginal) => ({
  ...(await importOriginal<typeof rescheduleOffersModule>()),
  parseRescheduleReply: vi.fn(),
  rankDaySuggestions: vi.fn((x) => x.days),
  storedWindowLabel: vi.fn().mockReturnValue('Morning'),
}));

vi.mock('@/lib/jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof jobsModule>()),
  expandScheduledJobs: vi.fn((jobs) => jobs.map((j: any) => ({ ...j }))),
  isMissingEndDateColumn: vi.fn().mockReturnValue(false),
}));

describe('Reschedule Offers Data Lib', () => {
  let supabaseMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
      then: vi.fn((resolve) => resolve({ error: null })),
    };

    supabaseMock = {
      from: vi.fn(() => queryMock),
    };

    (authModule.createAdminClient as any).mockReturnValue(supabaseMock);
  });

  describe('loadRescheduleContext', () => {
    it('handles missing table gracefully', async () => {
      queryMock.then = vi.fn((resolve) => resolve({ error: { code: '42P01' } }));
      const res = await loadRescheduleContext(supabaseMock, 'acct1', '2023-05-01');
      expect(res.available).toBe(false);
      expect(res.offers).toEqual([]);
    });

    it('returns offers and pending jobs', async () => {
      queryMock.then = vi.fn((resolve) => resolve({
        data: [{ id: 'o1', status: 'sent', job_id: 'job1' }, { id: 'o2', status: 'declined', job_id: 'job2' }],
        error: null
      }));
      const res = await loadRescheduleContext(supabaseMock, 'acct1', '2023-05-01');
      expect(res.available).toBe(true);
      expect(res.offers).toHaveLength(2);
      expect(res.pendingJobIds.has('job1')).toBe(true);
      expect(res.pendingJobIds.has('job2')).toBe(false);
    });
  });

  describe('createRescheduleOffer', () => {
    it('handles duplicate error', async () => {
      queryMock.single.mockResolvedValue({ error: { code: '23505' } });
      await expect(createRescheduleOffer(supabaseMock, {} as any))
        .rejects.toThrow('already asked this customer');
    });

    it('returns created offer', async () => {
      queryMock.single.mockResolvedValue({ data: { id: 'o1' }, error: null });
      const res = await createRescheduleOffer(supabaseMock, {} as any);
      expect(res.id).toBe('o1');
    });
  });

  describe('resolveRescheduleReply', () => {
    it('returns unhandled if offer not found', async () => {
      queryMock.maybeSingle.mockResolvedValue({ data: null });
      const res = await resolveRescheduleReply('acct1', '5551234', 'yes');
      expect(res.handled).toBe(false);
    });

    it('handles unclear reply', async () => {
      queryMock.maybeSingle.mockResolvedValue({
        data: { id: 'o1', status: 'sent', to_date: '2023-05-10', forwarded_at: null, job: { client_name: 'John' }, account: {} }
      });
      (rescheduleOffersModule.parseRescheduleReply as any).mockReturnValue('unclear');
      
      const res = await resolveRescheduleReply('acct1', '5551234', 'maybe');
      
      expect(res.handled).toBe(true);
      expect(res.reply).toMatch(/we've passed that to/);
      expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ forwarded_at: expect.any(String) }));
    });

    it('handles decline', async () => {
      queryMock.maybeSingle.mockResolvedValue({
        data: { id: 'o1', status: 'sent', to_date: '2023-05-10', job: { client_name: 'John' }, account: { alert_phone: '5550000' } }
      });
      (rescheduleOffersModule.parseRescheduleReply as any).mockReturnValue('decline');
      
      const res = await resolveRescheduleReply('acct1', '5551234', 'no');
      
      expect(res.handled).toBe(true);
      expect(res.reply).toMatch(/still booked for your original time/);
      expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'declined' }));
      expect(smsModule.sendOwnerEstimateAcceptedSms).toHaveBeenCalled(); // notifies owner
    });

    it('handles accept', async () => {
      queryMock.maybeSingle.mockResolvedValue({
        data: { id: 'o1', job_id: 'j1', account_id: 'acct1', status: 'sent', discount_percent: 10, to_date: '2023-05-10', job: { client_name: 'John' }, account: { alert_phone: '5550000' } }
      });
      (rescheduleOffersModule.parseRescheduleReply as any).mockReturnValue('accept');
      
      queryMock.update.mockReturnValue(queryMock);
      // Mock update to succeed
      // Note: we don't await the job update, it uses the chain, but we need to mock error: null
      queryMock.then = vi.fn((resolve) => resolve({ error: null })); 
      // wait, admin.from('jobs').update(...) is awaited. So queryMock.then handles it.

      const res = await resolveRescheduleReply('acct1', '5551234', 'yes');
      
      expect(res.handled).toBe(true);
      expect(res.reply).toMatch(/You're moved, John/);
      expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ scheduled_for: '2023-05-10' })); // jobs update
      expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' })); // offers update
      expect(smsModule.sendOwnerEstimateAcceptedSms).toHaveBeenCalled();
    });
  });
});
