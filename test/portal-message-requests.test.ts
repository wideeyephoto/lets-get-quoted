import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({notice:vi.fn(),sms:vi.fn()}));
vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.notice}));
vi.mock('@/lib/sms',()=>({sendOwnerPortalMessageAlertSms:mocks.sms}));
import {portalMessagePayloadHash,findPortalMessageReceipt} from '@/lib/portal-message-requests';
import {submitPortalMessage} from '@/lib/client-portal-data';
const input={accountId:'account-1',clientId:'client-1',requestId:'10000000-0000-4000-8000-000000000099',body:' Hello ',jobId:null};
beforeEach(()=>{vi.clearAllMocks();mocks.notice.mockResolvedValue({});mocks.sms.mockResolvedValue(true);});
function fixture(options:{receipt?:Record<string,unknown>;readError?:boolean;saveError?:boolean;replayed?:boolean;missingClient?:boolean}={}){
  const rpc=vi.fn().mockResolvedValue({data:{message_id:'saved-message',job_id:null,replayed:options.replayed??false},error:options.saveError?{}:null});
  const queries:unknown[][]=[];
  const from=vi.fn((table:string)=>{const q={select:()=>q,eq:(...args:unknown[])=>{queries.push([table,...args]);return q;},maybeSingle:async()=>({data:table==='portal_message_requests'?options.receipt??null:table==='clients'?options.missingClient?null:{name:'Client',phone:'+15551234567'}:table==='accounts'?{business_name:'Business',alert_phone:'+15557654321',high_value_sms_enabled:true}:{company_name:'Business'},error:options.readError?{}:null})};return q;});
  return {db:{from,rpc} as unknown as SupabaseClient,rpc,from,queries};
}
it('hashes normalized content and binds client and explicitly selected job',()=>{
  expect(portalMessagePayloadHash(input)).toBe(portalMessagePayloadHash({...input,body:'Hello'}));
  expect(portalMessagePayloadHash(input)).not.toBe(portalMessagePayloadHash({...input,clientId:'client-2'}));
  expect(portalMessagePayloadHash(input)).not.toBe(portalMessagePayloadHash({...input,jobId:'job-2'}));
});
it('rejects missing request identities and oversized bodies before storage',async()=>{
  const f=fixture();expect((await submitPortalMessage(f.db,{...input,requestId:''})).ok).toBe(false);expect((await submitPortalMessage(f.db,{...input,body:'x'.repeat(4001)})).ok).toBe(false);expect(f.from).not.toHaveBeenCalled();
});
it('submits normalized phone and message once with a stable SMS key',async()=>{
  const f=fixture();expect(await submitPortalMessage(f.db,input)).toEqual({ok:true,messageId:'saved-message'});
  expect(f.rpc).toHaveBeenCalledWith('submit_portal_message_request',expect.objectContaining({p_body:'Hello',p_phone:'+15551234567',p_client_id:'client-1',p_request_id:input.requestId}));
  expect(mocks.notice).toHaveBeenCalledWith(f.db,{sourceId:'saved-message',accountId:'account-1'});
  expect(mocks.sms).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:'owner-portal-msg:v1:saved-message'}));
});
it('reuses a completed receipt without reading changed contacts or repeating SMS',async()=>{
  const f=fixture({receipt:{id:'saved-message',payload_hash:portalMessagePayloadHash(input),job_id:null}});
  expect(await submitPortalMessage(f.db,input)).toEqual({ok:true,messageId:'saved-message'});expect(f.rpc).not.toHaveBeenCalled();expect(f.from).toHaveBeenCalledTimes(1);expect(mocks.sms).not.toHaveBeenCalled();
  expect(f.queries).toContainEqual(['portal_message_requests','account_id','account-1']);
});
it('rejects changed content under an already used request ID',async()=>{
  const f=fixture({receipt:{id:'saved-message',payload_hash:'a'.repeat(64)}});await expect(findPortalMessageReceipt(f.db,input)).rejects.toThrow('different message');expect(f.rpc).not.toHaveBeenCalled();
});
it.each([{readError:true},{saveError:true},{missingClient:true}])('never announces success or notifies after a failed save %j',async options=>{
  const f=fixture(options);expect((await submitPortalMessage(f.db,input)).ok).toBe(false);expect(mocks.notice).not.toHaveBeenCalled();expect(mocks.sms).not.toHaveBeenCalled();
});
it('preserves saved success after queue pickup failure',async()=>{
  mocks.notice.mockRejectedValueOnce(new Error('pickup failed'));const f=fixture();expect((await submitPortalMessage(f.db,input)).ok).toBe(true);
});
it('does not repeat owner SMS after a competing request wins the transaction',async()=>{
  const f=fixture({replayed:true});expect(await submitPortalMessage(f.db,input)).toEqual({ok:true,messageId:'saved-message'});expect(mocks.sms).not.toHaveBeenCalled();
});
