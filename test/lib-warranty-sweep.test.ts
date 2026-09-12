import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runServiceReminderSweep } from '@/lib/warranty-sweep';
import * as authModule from '@/lib/auth';
import * as emailModule from '@/lib/email';
import * as warrantiesModule from '@/lib/warranties';
import * as businessNameModule from '@/lib/business-name';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/email', () => ({
  sendContractorAlertEmail: vi.fn(),
  getAccountOwnerEmail: vi.fn(),
}));
vi.mock('@/lib/warranties', () => ({
  serviceDue: vi.fn(),
  todayKey: vi.fn(() => '2023-01-01'),
}));
vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn(),
}));

describe('Warranty Sweep Lib', () => {
  let queryMock: any;
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    queryMock = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve({ data: [], error: null }))
    };

    adminMock = {
      from: vi.fn(() => queryMock)
    };

    (authModule.createAdminClient as any).mockReturnValue(adminMock);
  });

  it('returns zeroes if query fails', async () => {
    queryMock.then = vi.fn((resolve) => resolve({ error: new Error('fail') }));
    const res = await runServiceReminderSweep();
    expect(res).toEqual({ checked: 0, notified: 0, skipped: 0 });
  });

  it('processes warranties and skips non-due', async () => {
    queryMock.then = vi.fn()
      .mockImplementationOnce((resolve) => resolve({
        data: [
          { id: '1', account_id: 'acct1', job_id: 'job1', title: 'w1', next_service_due: '2023-01-10' },
          { id: '2', account_id: 'acct1', job_id: 'job2', title: 'w2', next_service_due: '2023-01-15' },
        ],
        error: null
      }))
      .mockImplementationOnce((resolve) => resolve({ error: null })); // update mock

    (warrantiesModule.serviceDue as any)
      .mockReturnValueOnce({ due: true, label: 'soon' }) // item 1
      .mockReturnValueOnce({ due: false, label: '' });   // item 2 (skipped)

    (emailModule.getAccountOwnerEmail as any).mockResolvedValue('owner@example.com');
    (businessNameModule.loadBusinessName as any).mockResolvedValue('My Biz');

    const res = await runServiceReminderSweep();

    expect(res.checked).toBe(2);
    expect(res.skipped).toBe(1);
    expect(res.notified).toBe(1);
    
    // Ensure it updated the correct id
    expect(queryMock.update).toHaveBeenCalledWith({ service_reminded_at: expect.any(String) });
    expect(queryMock.in).toHaveBeenCalledWith('id', ['1']);

    expect(emailModule.sendContractorAlertEmail).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: 'owner@example.com',
      accountId: 'acct1'
    }));
  });

  it('skips email if update fails', async () => {
    queryMock.then = vi.fn()
      .mockImplementationOnce((resolve) => resolve({
        data: [{ id: '1', account_id: 'acct1', job_id: 'job1', title: 'w1', next_service_due: '2023-01-10' }],
        error: null
      }))
      .mockImplementationOnce((resolve) => resolve({ error: new Error('stamp fail') }));

    (warrantiesModule.serviceDue as any).mockReturnValue({ due: true, label: 'soon' });

    const res = await runServiceReminderSweep();
    
    expect(res.notified).toBe(0);
    expect(emailModule.sendContractorAlertEmail).not.toHaveBeenCalled();
  });
});
