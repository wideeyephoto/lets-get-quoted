import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CreateEmailOptions, Resend } from 'resend';
import { sendPlatformTransactionalEmail } from '@/lib/platform-transactional-email';
import { sendWithDomainFallback } from '@/lib/email-domain-fallback';

const mocks=vi.hoisted(()=>({send:vi.fn(),lookup:vi.fn(),generateLink:vi.fn(),insert:vi.fn()}));
vi.mock('resend',()=>({Resend:vi.fn().mockImplementation(()=>({emails:{send:mocks.send}}))}));
vi.mock('@/lib/auth',()=>({createAdminClient:()=>({
  from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.lookup})}),insert:mocks.insert}),
  auth:{admin:{generateLink:mocks.generateLink}},
})}));
const payload:CreateEmailOptions={from:'hello@letsgetquoted.com',to:'Owner <OWNER@example.com>',subject:'Sign in',html:'Link',tags:[{name:'kind',value:'magic_link'}]};
const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.lookup})})})} as unknown as SupabaseClient;
const client={emails:{send:mocks.send}} as unknown as Resend;
beforeEach(()=>{
  vi.clearAllMocks(); process.env.RESEND_API_KEY='synthetic';
  mocks.lookup.mockResolvedValue({data:null,error:null});
  mocks.send.mockResolvedValue({data:{id:'accepted'},error:null});
  mocks.generateLink.mockResolvedValue({data:{properties:{hashed_token:'saved-token'}},error:null});
});
describe('platform transactional delivery check',()=>{
  it.each(['hard_bounce','complaint','provider_suppressed'])('blocks %s',async reason=>{
    mocks.lookup.mockResolvedValue({data:{email:'owner@example.com',reason},error:null});
    await expect(sendPlatformTransactionalEmail(admin,client,payload)).rejects.toThrow('blocked');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each(['unsubscribe_link','one_click_unsubscribe'])('allows requested transactional mail after %s',async reason=>{
    mocks.lookup.mockResolvedValue({data:{email:'owner@example.com',reason},error:null});
    await sendPlatformTransactionalEmail(admin,client,payload);
    expect(mocks.send.mock.calls[0][0].tags).toContainEqual({name:'delivery_scope',value:'platform_transactional'});
  });
  it.each([{data:null,error:{message:'offline'}},{data:undefined,error:null},
    {data:{email:'other@example.com',reason:'unsubscribe_link'},error:null}])('fails closed on unavailable or mismatched data',async response=>{
    mocks.lookup.mockResolvedValue(response);
    await expect(sendPlatformTransactionalEmail(admin,client,payload)).rejects.toThrow('could not be checked');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('checks all normalized To/Cc/Bcc recipients with the real client, including literal wildcard characters',async()=>{
    const queried:string[]=[];
    const actual=createClient('https://synthetic.supabase.co','synthetic-secret',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
      const request=new Request(input,init); const url=new URL(request.url);
      expect(request.method).toBe('GET');
      expect(url.pathname).toBe('/rest/v1/platform_email_suppression');
      const address=url.searchParams.get('email')!; queried.push(address);
      return Response.json(address==='eq.literal_%@example.com'?[{email:'literal_%@example.com',reason:'complaint'}]:[]);
    }}});
    await expect(sendPlatformTransactionalEmail(actual,client,{...payload,cc:'owner@example.com',bcc:['other@example.com','literal_%@example.com']})).rejects.toThrow('blocked');
    expect(queried).toEqual(['eq.owner@example.com','eq.other@example.com','eq.literal_%@example.com']);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('refuses tenant scope and header injection before querying',async()=>{
    await expect(sendPlatformTransactionalEmail(admin,client,{...payload,tags:[{name:'account_id',value:'workspace'}]})).rejects.toThrow('scope');
    await expect(sendPlatformTransactionalEmail(admin,client,{...payload,to:'Owner\r\nBcc:hidden@example.com'})).rejects.toThrow('recipients');
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it('preserves provider options and rechecks before a domain fallback',async()=>{
    mocks.lookup.mockResolvedValueOnce({data:null,error:null}).mockResolvedValueOnce({data:{email:'owner@example.com',reason:'complaint'},error:null});
    mocks.send.mockResolvedValueOnce({data:null,error:{name:'validation_error',message:'The unverified.example domain is not verified.'}});
    await expect(sendWithDomainFallback((message,options)=>sendPlatformTransactionalEmail(admin,client,message,options),
      {...payload,from:'Builder <hello@unverified.example>'},{query:{test_option:'saved-request'}})).rejects.toThrow('blocked');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1]).toEqual({query:{test_option:'saved-request'}});
  });
});
describe('staff, contact and support paths use platform scope',()=>{
  it('blocks an operational alert without assigning the customer workspace to staff',async()=>{
    process.env.FOUNDER_ALERT_EMAIL='owner@example.com';
    const {sendOperationalEmergencyAlert}=await import('@/lib/founder-alerts');
    mocks.lookup.mockResolvedValue({data:{email:'owner@example.com',reason:'complaint'},error:null});
    const result=await sendOperationalEmergencyAlert({incidentType:'uptime',severity:'critical',title:'Unavailable',summary:'Service needs attention'});
    expect(result.dispatched).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('gates all three shared contact/support sends and preserves marketing-only opt-outs',async()=>{
    const api=await import('@/lib/email');
    const contact=()=>api.sendContactMessageEmail({fromName:'Owner',fromEmail:'owner@example.com',message:'Help'});
    const staff=()=>api.sendSupportCaseStaffEmail({kind:'opened',caseId:'case-1',subject:'Help',body:'Question',requesterEmail:'owner@example.com',businessName:null});
    const customer=()=>api.sendSupportCaseCustomerEmail({kind:'reply',caseId:'case-1',subject:'Help',to:'hello@letsgetquoted.com',body:'Answer'});
    mocks.lookup.mockResolvedValue({data:{email:'hello@letsgetquoted.com',reason:'one_click_unsubscribe'},error:null});
    for(const send of [contact,staff,customer]) await send();
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls.every(call=>call[0].tags.some((tag:{name:string;value:string})=>tag.name==='delivery_scope'&&tag.value==='platform_transactional'))).toBe(true);
    mocks.send.mockClear();
    mocks.lookup.mockResolvedValue({data:{email:'hello@letsgetquoted.com',reason:'hard_bounce'},error:null});
    for(const send of [contact,staff,customer]) await expect(send()).rejects.toThrow('blocked');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
describe('owner login uses the platform gate',()=>{
  it('queues magic link to platform_event_notices',async()=>{
    const {sendMagicLinkEmail}=await import('@/lib/magic-link');
    mocks.generateLink.mockResolvedValue({data:{properties:{hashed_token:'saved-token'}},error:null});
    mocks.insert.mockResolvedValue({error:null});
    await sendMagicLinkEmail('owner@example.com','https://untrusted.example/');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_family: 'auth_link',
      payload: expect.objectContaining({ to: 'owner@example.com' })
    }));
  });
  it('throws if insert fails',async()=>{
    const {sendMagicLinkEmail}=await import('@/lib/magic-link');
    mocks.insert.mockResolvedValue({error: {message: 'insert failed'}});
    await expect(sendMagicLinkEmail('owner@example.com')).rejects.toThrow('queue magic link email');
  });
});
