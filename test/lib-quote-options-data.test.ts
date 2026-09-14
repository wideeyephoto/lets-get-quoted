vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:vi.fn().mockResolvedValue({})}));
import {runOwnerEventNotices} from '@/lib/owner-event-notices';
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
      rpc: vi.fn().mockResolvedValue({data:{event_id:"saved-event",total:200},error:null}),
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
    queryMock.then = vi.fn((resolve: any) => resolve({ data: [] })); // payments

    (jobsModule.parseQuoteItems as any).mockReturnValue([{ id: 'add1', kind: 'addon' }]);
    (quoteOptionsModule.quoteOptionsWindow as any).mockReturnValue({ open: false });

    const res = await updateClientQuoteOptions('token', ['add1']);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/no longer open/);
    }
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

    queryMock.then = vi.fn((resolve: any) => resolve({ data: [] })); // payments

    const fakeItems = [{ id: 'add1', kind: 'addon' }];
    (jobsModule.parseQuoteItems as any).mockReturnValue(fakeItems);
    (quoteOptionsModule.quoteOptionsWindow as any).mockReturnValue({ open: true });
    
    (quoteOptionsModule.describeOptionChange as any).mockReturnValue({ changed: true, removed: [], added: ['add1'] });
    (quoteOptionsModule.applyOptionChoice as any).mockReturnValue([{ id: 'add1', kind: 'addon', selected: true }]);
    (jobsModule.computeQuoteTotal as any).mockReturnValue(200);
    
    queryMock.update.mockReturnValue(queryMock);
    queryMock.eq.mockReturnValue(queryMock);
    // for the final update:
    queryMock.then.mockImplementationOnce((resolve: any) => resolve({ data: [], error: null })); // payments read precedes update

    (quoteOptionsModule.optionChangeSentence as any).mockReturnValue('They added a thing.');
    (getAccountOwnerEmail as any).mockResolvedValue('owner@example.com');

    const res = await updateClientQuoteOptions('token', ['add1']);
    
    expect(res).toEqual({ ok: true, total: 200 });
    expect(supabaseMock.rpc).toHaveBeenCalledWith('save_client_quote_options',expect.objectContaining({p_account_id:'a1',p_job_id:'j1',p_total:200}));
    expect(runOwnerEventNotices).toHaveBeenCalledWith(supabaseMock,{sourceId:'saved-event',accountId:'a1'});
    expect(createJobFeedEvent).not.toHaveBeenCalled();expect(sendContractorAlertEmail).not.toHaveBeenCalled();
  });

  it.each([false,true])('handles saved owner pickup failure without changing the result: %s',async failSave=>{
    vi.mocked(resolveJobAccess).mockResolvedValue({accountId:'a1',jobId:'j1'} as any);
    queryMock.maybeSingle.mockResolvedValueOnce({data:{id:'j1',quote_items:[],quoted_amount:100,status:'in_progress',ref:'JOB-1',client_name:'Client'}})
      .mockResolvedValueOnce({data:{client_quote_changes:true}}).mockResolvedValueOnce({data:null});
    queryMock.then.mockImplementation((resolve:any)=>resolve({data:[],error:null}));
    vi.mocked(jobsModule.parseQuoteItems).mockReturnValue([{id:'add1',kind:'addon'}] as any);
    vi.mocked(quoteOptionsModule.quoteOptionsWindow).mockReturnValue({open:true,floor:0,until:null});
    vi.mocked(quoteOptionsModule.describeOptionChange).mockReturnValue({changed:true,removed:['Gate'],added:[]});
    vi.mocked(quoteOptionsModule.applyOptionChoice).mockReturnValue([]);
    vi.mocked(jobsModule.computeQuoteTotal).mockReturnValue(200);
    vi.mocked(quoteOptionsModule.optionChangeSentence).mockReturnValue('Removed Gate.');
    if(failSave)supabaseMock.rpc.mockResolvedValue({data:null,error:{message:'conflict'}});
    else vi.mocked(runOwnerEventNotices).mockRejectedValueOnce(new Error('pickup unavailable'));
    const result=await updateClientQuoteOptions('token',[]);
    expect(result.ok).toBe(!failSave);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('save_client_quote_options',expect.objectContaining({
      p_title:'Client removed work from JOB-1',p_body:expect.stringContaining('Check any existing invoice'),
      p_expected:{status:'in_progress',started_at:null,scheduled_for:null,quote_items:[],quoted_amount:100}
    }));
    if(failSave)expect(runOwnerEventNotices).not.toHaveBeenCalled();
    expect(createJobFeedEvent).not.toHaveBeenCalled();expect(sendContractorAlertEmail).not.toHaveBeenCalled();
  });

  it.each(['job', 'settings', 'plan', 'payments'])('does not change the quote or notify when the %s read fails', async failedTable => {
    vi.mocked(resolveJobAccess).mockResolvedValue({accountId:'a1',jobId:'j1'} as any);
    queryMock.maybeSingle
      .mockResolvedValueOnce({data:{id:'j1'},error:failedTable==='job'?{message:'unavailable'}:null})
      .mockResolvedValueOnce({data:{client_quote_changes:true},error:failedTable==='settings'?{message:'unavailable'}:null})
      .mockResolvedValueOnce({data:null,error:failedTable==='plan'?{message:'unavailable'}:null});
    queryMock.then.mockImplementation((resolve:any)=>resolve({data:[],error:failedTable==='payments'?{message:'unavailable'}:null}));
    expect((await updateClientQuoteOptions('token',['add1'])).ok).toBe(false);
    expect(queryMock.update).not.toHaveBeenCalled();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(createJobFeedEvent).not.toHaveBeenCalled();
    expect(sendContractorAlertEmail).not.toHaveBeenCalled();
  });

  it.each([null, [{amount:null}], [{amount:'invalid'}], [{amount:-1}], [{amount:Infinity}], [{amount:Number.MAX_VALUE},{amount:Number.MAX_VALUE}]])('rejects unavailable or invalid payment totals %j', async paidRows => {
    vi.mocked(resolveJobAccess).mockResolvedValue({accountId:'a1',jobId:'j1'} as any);
    queryMock.maybeSingle
      .mockResolvedValueOnce({data:{id:'j1'}})
      .mockResolvedValueOnce({data:{client_quote_changes:true}})
      .mockResolvedValueOnce({data:null});
    queryMock.then.mockImplementation((resolve:any)=>resolve({data:paidRows,error:null}));
    expect((await updateClientQuoteOptions('token',['add1'])).ok).toBe(false);
    expect(queryMock.update).not.toHaveBeenCalled();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(createJobFeedEvent).not.toHaveBeenCalled();
    expect(sendContractorAlertEmail).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1])('does not save an invalid computed quote total %s', async total => {
    vi.mocked(resolveJobAccess).mockResolvedValue({accountId:'a1',jobId:'j1'} as any);
    queryMock.maybeSingle
      .mockResolvedValueOnce({data:{id:'j1',quoted_amount:100}})
      .mockResolvedValueOnce({data:{client_quote_changes:true}})
      .mockResolvedValueOnce({data:null});
    queryMock.then.mockImplementation((resolve:any)=>resolve({data:[],error:null}));
    vi.mocked(jobsModule.parseQuoteItems).mockReturnValue([{id:'add1',kind:'addon'}] as any);
    vi.mocked(quoteOptionsModule.quoteOptionsWindow).mockReturnValue({open:true,floor:0,until:null});
    vi.mocked(quoteOptionsModule.describeOptionChange).mockReturnValue({changed:true,removed:[],added:['add1']});
    vi.mocked(quoteOptionsModule.applyOptionChoice).mockReturnValue([]);
    vi.mocked(jobsModule.computeQuoteTotal).mockReturnValue(total);
    expect((await updateClientQuoteOptions('token',['add1'])).ok).toBe(false);
    expect(queryMock.update).not.toHaveBeenCalled();
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(createJobFeedEvent).not.toHaveBeenCalled();
    expect(sendContractorAlertEmail).not.toHaveBeenCalled();
  });
});
