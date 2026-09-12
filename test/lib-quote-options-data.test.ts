import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateClientQuoteOptions } from '@/lib/quote-options-data';
import { resolveJobAccess } from '@/lib/change-order-client';
import { createAdminClient } from '@/lib/auth';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { createJobFeedEvent } from '@/lib/job-feed';
import * as quoteOptionsModule from '@/lib/quote-options';
import * as jobsModule from '@/lib/jobs';

vi.mock('@/lib/change-order-client', () => ({
  resolveJobAccess: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: vi.fn(),
}));

vi.mock('@/lib/quote-options', async (importOriginal) => ({
  ...(await importOriginal<typeof quoteOptionsModule>()),
  quoteOptionsWindow: vi.fn(),
  describeOptionChange: vi.fn(),
  applyOptionChoice: vi.fn(),
  optionChangeSentence: vi.fn(),
}));

vi.mock('@/lib/jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof jobsModule>()),
  parseQuoteItems: vi.fn(),
  computeQuoteTotal: vi.fn(),
}));

describe('Quote Options Data Lib', () => {
  let supabaseMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      then: vi.fn(),
    };

    supabaseMock = {
      from: vi.fn(() => queryMock),
    };

    (createAdminClient as any).mockReturnValue(supabaseMock);
  });

  it('returns error if access fails', async () => {
    (resolveJobAccess as any).mockResolvedValue(null);
    const res = await updateClientQuoteOptions('token', ['1']);
    expect(res).toEqual({ ok: false, message: expect.any(String) });
  });

  it('returns error if job not found', async () => {
    (resolveJobAccess as any).mockResolvedValue({ accountId: 'a1', jobId: 'j1' });
    queryMock.maybeSingle.mockResolvedValueOnce({ data: null }); // job query
    const res = await updateClientQuoteOptions('token', ['1']);
    expect(res.ok).toBe(false);
  });

  it('returns error if window is closed', async () => {
    (resolveJobAccess as any).mockResolvedValue({ accountId: 'a1', jobId: 'j1' });
    queryMock.maybeSingle.mockResolvedValueOnce({ data: { id: 'j1' } }); // job
    queryMock.maybeSingle.mockResolvedValueOnce({ data: { client_quote_changes: true } }); // settings
    queryMock.maybeSingle.mockResolvedValueOnce({ data: null }); // plan
    queryMock.then = vi.fn((resolve) => resolve({ data: [] })); // payments

    (jobsModule.parseQuoteItems as any).mockReturnValue([{ id: 'add1', kind: 'addon' }]);
    (quoteOptionsModule.quoteOptionsWindow as any).mockReturnValue({ open: false });

    const res = await updateClientQuoteOptions('token', ['add1']);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/no longer open/);
  });

  it('updates options and records events', async () => {
    (resolveJobAccess as any).mockResolvedValue({ accountId: 'a1', jobId: 'j1' });
    
    let maybeSingleCalls = 0;
    queryMock.maybeSingle.mockImplementation(() => {
      maybeSingleCalls++;
      if (maybeSingleCalls === 1) return Promise.resolve({ data: { id: 'j1', quoted_amount: 100 } });
      if (maybeSingleCalls === 2) return Promise.resolve({ data: { client_quote_changes: true } }); // settings
      if (maybeSingleCalls === 3) return Promise.resolve({ data: null }); // plan
      if (maybeSingleCalls === 4) return Promise.resolve({ data: { business_name: 'Biz' } }); // acct
      if (maybeSingleCalls === 5) return Promise.resolve({ data: null }); // site
      return Promise.resolve({ data: null });
    });

    queryMock.then = vi.fn((resolve) => resolve({ data: [] })); // payments

    const fakeItems = [{ id: 'add1', kind: 'addon' }];
    (jobsModule.parseQuoteItems as any).mockReturnValue(fakeItems);
    (quoteOptionsModule.quoteOptionsWindow as any).mockReturnValue({ open: true });
    
    (quoteOptionsModule.describeOptionChange as any).mockReturnValue({ changed: true, removed: [], added: ['add1'] });
    (quoteOptionsModule.applyOptionChoice as any).mockReturnValue([{ id: 'add1', kind: 'addon', selected: true }]);
    (jobsModule.computeQuoteTotal as any).mockReturnValue(200);
    
    queryMock.update.mockReturnValue(queryMock);
    queryMock.eq.mockReturnValue(queryMock);
    // for the final update:
    queryMock.then.mockImplementationOnce((resolve: any) => resolve({ error: null })); // update job

    (quoteOptionsModule.optionChangeSentence as any).mockReturnValue('They added a thing.');
    (getAccountOwnerEmail as any).mockResolvedValue('owner@example.com');

    const res = await updateClientQuoteOptions('token', ['add1']);
    
    expect(res).toEqual({ ok: true, total: 200 });
    expect(createJobFeedEvent).toHaveBeenCalled();
    expect(sendContractorAlertEmail).toHaveBeenCalled();
  });
});
