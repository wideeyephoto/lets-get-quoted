import {describe,it,expect,vi} from 'vitest';
import {assertOperationalDeliveryAllowed, operationalRecipient, resendRequest, runOperationalMonitor, sendMonitorFailure, sendMonitorRecovery} from '@/lib/operational-monitor.mjs';
const env={RESEND_API_KEY:'synthetic',ONCALL_PRIMARY_EMAIL:'ops@example.com'};
function db(reason: string|null=null, unavailable=false){
 const updates:Record<string,unknown>[]=[];
 const payload={to:['ops@example.com'],text:'Saved content',tags:[{name:'kind',value:'operational_alert'}]};
 const from=vi.fn((table:string)=>{
  let writing=false;
  const builder:any={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),
   limit:async()=>({data:[],error:null}),maybeSingle:async()=>({data:reason?{email:'ops@example.com',reason}:null,error:unavailable?{message:'offline'}:null}),
   update:(value:Record<string,unknown>)=>{updates.push(value);writing=true;return builder;},
   then:(resolve:(value:unknown)=>void)=>resolve({data:writing?[{id:'alert'}]:[],count:0,error:null})};
  if(table==='platform_email_suppression') expect(writing).toBe(false);
  return builder;
 });
 const rpc=vi.fn(async(name:string)=>({data:name==='claim_operational_alerts'?[{id:'alert',claim_token:'lease',payload}]:name==='record_monitor_success'?[{monitor_state:'healthy'}]:0,error:null}));
 return {admin:{from,rpc} as any,updates,payload};
}
describe('operational recipient policy',()=>{
 it.each(['ops@example.com,hidden@example.com','Name <ops@example.com>','ops@example.com\r\nBcc:hidden@example.com',' ops@example.com'])('rejects malformed config %s before recovery claim',async recipient=>{
  const admin:any={rpc:vi.fn()};const fetcher=vi.fn();
  await expect(sendMonitorRecovery({admin,env:{...env,ONCALL_PRIMARY_EMAIL:recipient},fetcher})).rejects.toThrow('recipient_invalid');
  expect(admin.rpc).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
 });
 it('keeps existing recipient precedence and fallback explicit',()=>{
  expect(operationalRecipient({...env,FOUNDER_ALERT_EMAIL:'founder@example.com'})).toBe('ops@example.com');
  expect(operationalRecipient({FOUNDER_ALERT_EMAIL:'founder@example.com'})).toBe('founder@example.com');
  expect(operationalRecipient({})).toBe('hello@letsgetquoted.com');
 });
 it.each(['hard_bounce','complaint','provider_suppressed'])('quarantines queued %s without a provider attempt',async reason=>{
  const d=db(reason);const fetcher=vi.fn();
  await runOperationalMonitor({admin:d.admin,crons:[],env,fetcher,pause:async()=>{}});
  expect(fetcher).not.toHaveBeenCalled();
  expect(d.updates[0]).toMatchObject({state:'manual_review',last_error:'operational_delivery_blocked',claim_token:null});
 });
 it.each(['unsubscribe_link','one_click_unsubscribe',null])('preserves saved payload/key and allows operational mail after %s',async reason=>{
  const d=db(reason);const fetcher=vi.fn().mockResolvedValue(Response.json({id:'accepted'}));
  const original=JSON.stringify(d.payload);
  const result=await runOperationalMonitor({admin:d.admin,crons:[],env,fetcher,pause:async()=>{}});
  expect(result.accepted).toBe(1);expect(fetcher.mock.calls[0][1].body).toBe(original);
  expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('lgq-operational-alert');
  expect(fetcher.mock.calls[0][1].redirect).toBe('error');
 });
 it('defers unavailable checks without submitting',async()=>{
  const d=db(null,true);const fetcher=vi.fn();
  await runOperationalMonitor({admin:d.admin,crons:[],env,fetcher,pause:async()=>{}});
  expect(fetcher).not.toHaveBeenCalled();expect(d.updates[0]).toMatchObject({state:'pending',last_error:'operational_delivery_check_unavailable'});
 });
 it.each([{to:['old@example.com']},{to:['ops@example.com'],bcc:['hidden@example.com']},{to:['ops@example.com'],cc:'hidden@example.com'},{text:'missing destination'}])('refuses changed or extra saved recipients',async payload=>{
  const d=db();await expect(assertOperationalDeliveryAllowed(d.admin,payload,'ops@example.com')).rejects.toThrow('recipient_mismatch');
  expect(d.admin.from).not.toHaveBeenCalled();
 });
 it('keeps emergency outage notification database-independent',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({id:'emergency'}));
  expect(await sendMonitorFailure({env,fetcher,error:new Error('database unavailable')})).toBe('emergency');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each([{data:undefined,error:null},{data:{email:'other@example.com',reason:'complaint'},error:null},
  {data:{email:'ops@example.com',reason:'unknown'},error:null},new Error('connection lost')])('fails closed on incomplete or unrecognized evidence',async response=>{
  const admin:any={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{if(response instanceof Error)throw response;return response;}})})})};
  await expect(assertOperationalDeliveryAllowed(admin,{to:['ops@example.com']},'ops@example.com')).rejects.toThrow('delivery_check_unavailable');
 });
 it.each([{}, {id:''},{id:'   '}])('does not accept missing recovery provider IDs',async receipt=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json(receipt));
  await expect(sendMonitorRecovery({env,fetcher})).rejects.toThrow('resend_missing_email_id');
 });
 it('does not follow provider redirects',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(null,{status:302}));
  await expect(resendRequest('/emails',{key:'synthetic',method:'POST',fetcher})).rejects.toThrow('resend_http_302');
  expect(fetcher.mock.calls[0][1].redirect).toBe('error');
 });
});
