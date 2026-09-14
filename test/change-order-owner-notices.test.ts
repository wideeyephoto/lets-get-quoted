import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),respond:vi.fn(),feed:vi.fn(),dispatch:vi.fn()}));
vi.mock('@/lib/auth',()=>({createAdminClient:mocks.admin}));
vi.mock('@/lib/change-orders-data',()=>({respondToChangeOrder:mocks.respond}));
vi.mock('@/lib/job-feed',()=>({createJobFeedEvent:mocks.feed}));
vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.dispatch}));
import { respondAsClient } from '@/lib/change-order-client';
const input={decision:'declined' as const,signatureName:'Customer'};
const query={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};
const admin={from:vi.fn(()=>query)};
beforeEach(()=>{
  vi.clearAllMocks();mocks.admin.mockReturnValue(admin);query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValueOnce({data:{account_id:'account-1',job_id:'job-1'},error:null})
    .mockResolvedValueOnce({data:{id:'order-1',job_id:'job-1'},error:null});
  mocks.respond.mockResolvedValue({ok:true,order:{id:'order-1',status:'declined',title:'Extra work',signatureName:'Customer',amount:125}});
  mocks.feed.mockResolvedValue(undefined);mocks.dispatch.mockResolvedValue({ownersNotified:1});
});
it('dispatches the saved decision under the freshly resolved account',async()=>{
  expect(await respondAsClient('token','order-1',input)).toEqual({ok:true,decision:'declined'});
  expect(mocks.dispatch).toHaveBeenCalledWith(admin,{sourceId:'order-1',accountId:'account-1'});
  expect(mocks.respond.mock.invocationCallOrder[0]).toBeLessThan(mocks.dispatch.mock.invocationCallOrder[0]);
});
it('never dispatches after an already answered decision',async()=>{
  mocks.respond.mockResolvedValueOnce({ok:false,message:'Already answered'});
  expect((await respondAsClient('token','order-1',input)).ok).toBe(false);
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
it('retains the saved decision when immediate pickup fails',async()=>{
  mocks.dispatch.mockRejectedValueOnce(new Error('unavailable'));
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{expect(await respondAsClient('token','order-1',input)).toEqual({ok:true,decision:'declined'});}finally{log.mockRestore();}
});
