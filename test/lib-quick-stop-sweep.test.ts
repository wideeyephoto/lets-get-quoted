import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sweepQuickStopOffers } from '@/lib/quick-stop-sweep';
import { logQuickStopEvent } from '@/lib/quick-stop-requests';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';

vi.mock('@/lib/quick-stop-requests', () => ({
  logQuickStopEvent: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
}));

describe('Quick Stop Sweep Lib', () => {
  let adminMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-05-01T20:00:00Z'));

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      then: vi.fn((resolve) => resolve({ data: [] }))
    };

    adminMock = {
      from: vi.fn(() => queryMock),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires unpaid offers and emails owner', async () => {
    // 1st query: payQuery
    // 2nd query: respQuery
    // 3rd query: doneQuery
    let callCount = 0;
    queryMock.then.mockImplementation((resolve: any) => {
      callCount++;
      if (callCount === 1) {
        return resolve({
          data: [{ id: 'req1', account_id: 'acct1', job_id: 'job1', payment_id: 'pay1', client_name: 'John' }]
        });
      }
      return resolve({ data: [] });
    });

    queryMock.maybeSingle.mockResolvedValue({ data: { id: 'req1' } }); // claimed
    (getAccountOwnerEmail as any).mockResolvedValue('owner@test.com');

    const summary = await sweepQuickStopOffers(adminMock);

    expect(summary.paymentExpired).toBe(1);
    expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'offer_expired' }));
    expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' })); // jobs
    expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' })); // payments
    expect(logQuickStopEvent).toHaveBeenCalled();
    expect(sendContractorAlertEmail).toHaveBeenCalled();
  });

  it('expires unresponded offers', async () => {
    let callCount = 0;
    queryMock.then.mockImplementation((resolve: any) => {
      callCount++;
      if (callCount === 2) {
        return resolve({
          data: [{ id: 'req2', account_id: 'acct2' }]
        });
      }
      return resolve({ data: [] });
    });

    queryMock.maybeSingle.mockResolvedValue({ data: { id: 'req2' } });

    const summary = await sweepQuickStopOffers(adminMock);

    expect(summary.responseExpired).toBe(1);
    expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'offer_expired' }));
    expect(logQuickStopEvent).toHaveBeenCalledWith(adminMock, 'acct2', 'req2', expect.any(Object));
  });

  it('auto-completes finished jobs after 2 hours', async () => {
    let callCount = 0;
    queryMock.then.mockImplementation((resolve: any) => {
      callCount++;
      if (callCount === 3) {
        return resolve({
          data: [{ 
            id: 'req3', 
            account_id: 'acct3',
            job_id: 'job3',
            arrival_date: '2023-05-01',
            arrival_end: '10:00', // Ended at 10am UTC, now is 3pm UTC. (5 hours ago, so past 2h grace)
            no_show_reported_at: null
          }]
        });
      }
      return resolve({ data: [] });
    });

    queryMock.maybeSingle.mockResolvedValue({ data: { id: 'req3' } });

    const summary = await sweepQuickStopOffers(adminMock);

    expect(summary.autoCompleted).toBe(1);
    expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(queryMock.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'complete' })); // jobs
  });

  it('skips auto-complete if within grace period', async () => {
    let callCount = 0;
    queryMock.then.mockImplementation((resolve: any) => {
      callCount++;
      if (callCount === 3) {
        return resolve({
          data: [{ 
            id: 'req3', 
            account_id: 'acct3',
            arrival_date: '2023-05-01',
            arrival_end: '23:59', // Very late to ensure it's within grace
            no_show_reported_at: null
          }]
        });
      }
      return resolve({ data: [] });
    });

    const summary = await sweepQuickStopOffers(adminMock);

    expect(summary.autoCompleted).toBe(0);
    expect(queryMock.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
  });
});
