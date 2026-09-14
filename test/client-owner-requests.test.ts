import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientRequestHash, findClientRequest, saveClientRequest, validClientRequestId } from '@/lib/client-owner-requests';

it('binds changed body, category and attachment content to different fingerprints',()=>{
  const original=clientRequestHash('followup','Help',['photo-hash-a']);
  expect(original).toMatch(/^[a-f0-9]{64}$/);
  expect(clientRequestHash('followup','Help',['photo-hash-a'])).toBe(original);
  for(const hash of [clientRequestHash('warranty','Help',['photo-hash-a']),clientRequestHash('followup','Changed',['photo-hash-a']),clientRequestHash('followup','Help',['photo-hash-b'])]) expect(hash).not.toBe(original);
  expect(validClientRequestId('11111111-1111-4111-8111-111111111111')).toBe(true);
  expect(validClientRequestId('')).toBe(false);expect(validClientRequestId('unsafe')).toBe(false);
});
it('reads receipts using both workspace and job, rejects changed content and query errors',async()=>{
  const maybeSingle=vi.fn().mockResolvedValue({data:{payload_hash:'original',feed_id:'feed-1'},error:null});
  const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),maybeSingle};
  const admin={from:vi.fn(()=>query)} as unknown as SupabaseClient;
  expect(await findClientRequest(admin,'account','job','request','original')).toMatchObject({feed_id:'feed-1'});
  expect(query.eq.mock.calls).toEqual([['account_id','account'],['job_id','job'],['request_id','request']]);
  await expect(findClientRequest(admin,'account','job','request','changed')).rejects.toThrow('different content');
  maybeSingle.mockResolvedValueOnce({data:null,error:{message:'Unavailable'}} as never);
  await expect(findClientRequest(admin,'account','job','request','original')).rejects.toThrow('could not be checked');
});
it('requires a confirmed receipt from atomic submission and preserves deletion tombstones',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:{feed_id:null,replayed:true},error:null});
  const admin={rpc} as unknown as SupabaseClient;
  const input={accountId:'account',jobId:'job',requestId:'request',hash:'hash',kind:'client_question',title:'Question',body:'Help'};
  expect(await saveClientRequest(admin,input)).toEqual({feed_id:null,replayed:true});
  expect(rpc).toHaveBeenCalledWith('submit_client_owner_request',expect.objectContaining({p_account_id:'account',p_job_id:'job',p_request_id:'request',p_payload_hash:'hash'}));
  rpc.mockResolvedValueOnce({data:{},error:null} as never);
  await expect(saveClientRequest(admin,input)).rejects.toThrow('could not be saved');
});
