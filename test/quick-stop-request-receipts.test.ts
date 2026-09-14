import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({upload:vi.fn(),capacity:vi.fn(),bucket:vi.fn()}));
vi.mock('@/lib/auth',()=>({createAdminClient:()=>({storage:{getBucket:mocks.bucket,from:()=>({upload:mocks.upload})}})}));
vi.mock('@/lib/billing/storage-usage',()=>({assertStorageCapacity:mocks.capacity}));
import {uploadLeadPhoto} from '@/lib/lead-photo-storage';
import {quickStopRequestHash,findQuickStopReceipt} from '@/lib/quick-stop-request-receipts';
const requestId='e7390b32-9c62-4d9e-bc50-d4033aa63141';
const file=(bytes='photo')=>new File([bytes],'tap.jpg',{type:'image/jpeg'});
beforeEach(()=>{vi.clearAllMocks();mocks.bucket.mockResolvedValue({data:{id:'lead-photos'}});mocks.upload.mockResolvedValue({error:null});});
it('binds request content to file bytes, names and ordering',async()=>{
  const original=await quickStopRequestHash({issue:'tap'},[file()]);
  expect(await quickStopRequestHash({issue:'tap'},[file()])).toBe(original);
  expect(await quickStopRequestHash({issue:'other'},[file()])).not.toBe(original);
  expect(await quickStopRequestHash({issue:'tap'},[file('changed')])).not.toBe(original);
  expect(await quickStopRequestHash({issue:'tap'},[new File(['photo'],'other.jpg',{type:'image/jpeg'})])).not.toBe(original);
  await expect(quickStopRequestHash({},Array.from({length:7},()=>file()))).rejects.toThrow();
  await expect(quickStopRequestHash({},[new File(['bad'],'bad.exe',{type:'application/octet-stream'})])).rejects.toThrow();
});
it('reuses a completed attachment after uncertain upload, preserving the public storage exemption',async()=>{
  const identity={requestId,fileIndex:0};
  const first=await uploadLeadPhoto('account-1',file(),'public_visitor',identity);
  mocks.upload.mockResolvedValueOnce({error:{statusCode:'409'}});
  expect(await uploadLeadPhoto('account-1',file(),'public_visitor',identity)).toBe(first);
  expect(mocks.capacity).not.toHaveBeenCalled();
  expect(mocks.upload.mock.calls[0][2].upsert).toBe(false);
  expect(await uploadLeadPhoto('account-2',file(),'public_visitor',identity)).not.toBe(first);
  expect(await uploadLeadPhoto('account-1',file('different'),'public_visitor',identity)).not.toBe(first);
  expect(await uploadLeadPhoto('account-1',file(),'public_visitor',{...identity,fileIndex:1})).not.toBe(first);
});
it('does not swallow unknown upload failures or duplicates on random uploads',async()=>{
  mocks.upload.mockResolvedValueOnce({error:{statusCode:'503'}});
  await expect(uploadLeadPhoto('account',file(),'public_visitor',{requestId,fileIndex:0})).rejects.toBeTruthy();
  mocks.upload.mockResolvedValueOnce({error:{statusCode:'409'}});
  await expect(uploadLeadPhoto('account',file(),'workspace')).rejects.toBeTruthy();
  expect(mocks.capacity).toHaveBeenCalled();
  await expect(uploadLeadPhoto('account',file(),'public_visitor',{requestId:'../bad',fileIndex:0})).rejects.toThrow();
});
it('checks receipt account and request, preserves tombstones and fails closed on mismatch or lookup errors',async()=>{
  const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);
  const admin={from:vi.fn(()=>q)} as unknown as SupabaseClient;
  q.maybeSingle.mockResolvedValueOnce({data:{payload_hash:'hash',quick_stop_id:null}});
  expect(await findQuickStopReceipt(admin,'account',requestId,'hash')).toEqual({payload_hash:'hash',quick_stop_id:null});
  expect(q.eq).toHaveBeenCalledWith('account_id','account');expect(q.eq).toHaveBeenCalledWith('request_id',requestId);
  q.maybeSingle.mockResolvedValueOnce({data:{payload_hash:'other',quick_stop_id:'id'}});
  await expect(findQuickStopReceipt(admin,'account',requestId,'hash')).rejects.toThrow('different details');
  q.maybeSingle.mockResolvedValueOnce({error:{message:'offline'}});
  await expect(findQuickStopReceipt(admin,'account',requestId,'hash')).rejects.toThrow('unavailable');
});
