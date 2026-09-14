import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailCampaignAdmin } from './helpers/email-campaign-admin';
import { platformCampaignEligibility } from '@/lib/platform-email-policy';
import { makeUnsubscribeToken, parseUnsubscribeToken, suppressEmail } from '@/lib/email-suppression';
import { resolvePlatformCampaignRecipients, sendPlatformCampaignBlast, sendTestPlatformCampaignEmail } from '@/lib/admin-platform-campaigns';
import { POST, GET } from '@/app/api/email/unsubscribe/route';
import { unsubscribeAction } from '@/app/unsubscribe/actions';
import UnsubscribePage from '@/app/unsubscribe/page';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({ send: vi.fn(), admin: null as unknown as SupabaseClient, log: vi.fn() }));
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation(() => ({ emails: { send: mocks.send } })) }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => mocks.admin }));
vi.mock('@/lib/admin', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/webhook-failures', () => ({ logWebhookFailure: mocks.log }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('@/components/save-button', () => ({ default: () => 'Unsubscribe me' }));
const a = '10000000-0000-4000-8000-000000000001', b = '10000000-0000-4000-8000-000000000002';
const email = 'owner@reliabletrades.com';
const input = { subject: 'An update', heading: 'News', body: 'Your business update.' };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'synthetic-test';
  mocks.send.mockResolvedValue({ data: { id: 'provider-id' }, error: null });
});
const adminFor = (tables: Record<string, any[]> = {}) => emailCampaignAdmin(tables) as unknown as SupabaseClient;

describe('platform campaign scope and final eligibility', () => {
  it('does not let one workspace preference exclude another occurrence of the same address', async () => {
    const admin = adminFor({ accounts: [{ id:a },{ id:b }], owners:[{ account_id:a,email },{ account_id:b,email }],
      email_suppression:[{ account_id:a,email }] });
    expect(await resolvePlatformCampaignRecipients(admin,'all_contractors')).toEqual([expect.objectContaining({ accountId:b,email })]);
  });
  it('filters platform opt-outs from custom recipients', async () => {
    const admin = adminFor({ platform_email_suppression:[{ email }] });
    expect(await resolvePlatformCampaignRecipients(admin,'custom',email)).toEqual([]);
  });
  it('blocks an opt-out recorded after audience selection without calling the provider', async () => {
    const admin = adminFor();
    let calls = 0;
    vi.spyOn(admin,'rpc').mockImplementation((_name, args) => Promise.resolve({ data: args!.p_recipients.map((pair: object) => ({ ...pair,blocked:++calls>1 })),error:null }) as never);
    const result = await sendPlatformCampaignBlast(admin,{ adminEmail:'staff@example.com' },{ ...input,audience:'custom',customEmails:email });
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('uses the same real platform token in test HTML, text and header', async () => {
    await sendTestPlatformCampaignEmail(adminFor(),input,email);
    const message = mocks.send.mock.calls[0][0];
    const token = makeUnsubscribeToken('platform',email);
    expect(message.html).toContain(encodeURIComponent(token));
    expect(message.text).toContain(encodeURIComponent(token));
    expect(message.headers['List-Unsubscribe']).toContain(encodeURIComponent(token));
    expect(message.html).not.toContain(encodeURIComponent(makeUnsubscribeToken('test-preview',email)));
  });
  it('checks test messages and does not submit a suppressed test', async () => {
    await expect(sendTestPlatformCampaignEmail(adminFor({ platform_email_suppression:[{email}] }),input,email)).rejects.toThrow('opted out');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('uses platform unsubscribe scope for live workspace campaigns while retaining the audit account tag', async () => {
    const admin=adminFor({accounts:[{id:a}],owners:[{account_id:a,email}]});
    const result=await sendPlatformCampaignBlast(admin,{adminEmail:'staff@example.com'},{...input,audience:'all_contractors'});
    expect(result.sentCount).toBe(1);
    const message=mocks.send.mock.calls[0][0];
    const token=encodeURIComponent(makeUnsubscribeToken('platform',email));
    expect(message.html).toContain(token);
    expect(message.text).toContain(token);
    expect(message.headers['List-Unsubscribe']).toContain(token);
    expect(message.tags).toContainEqual({name:'account_id',value:a});
  });
  it('does not submit when the final lookup fails after a successful audience read', async () => {
    const admin=adminFor();
    vi.spyOn(admin,'rpc').mockResolvedValueOnce({data:[{email,account_id:null,blocked:false}],error:null} as never)
      .mockResolvedValueOnce({data:null,error:{message:'offline'}} as never);
    const result=await sendPlatformCampaignBlast(admin,{adminEmail:'staff@example.com'},{...input,audience:'custom',customEmails:email});
    expect(result.failedCount).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rejects recipient header injection before querying', async () => {
    const admin=adminFor(); const rpc=vi.spyOn(admin,'rpc');
    await expect(platformCampaignEligibility(admin,[{email:'owner@example.com\r\nBcc:hidden@example.com',accountId:null}])).rejects.toThrow('could not be verified');
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ data:null,error:{message:'rejected'} },{ data:null,error:null }])('requires provider acceptance for test and real sends', async response => {
    mocks.send.mockResolvedValue(response);
    expect((await sendTestPlatformCampaignEmail(adminFor(),input,email)).success).toBe(false);
    const result = await sendPlatformCampaignBlast(adminFor(),{adminEmail:'staff@example.com'},{...input,audience:'custom',customEmails:email});
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(1);
  });
  it('checks every recipient through bounded batches', async () => {
    const admin=adminFor();
    const rpc=vi.spyOn(admin,'rpc');
    expect(await platformCampaignEligibility(admin,Array.from({length:201},(_,i)=>({email:`owner${i}@example.com`,accountId:null})))).toHaveLength(201);
    expect(rpc.mock.calls.map(call=>call[1]!.p_recipients.length)).toEqual([100,100,1]);
  });
  it.each([null,[],[{email,account_id:b,blocked:false}],[{email,account_id:a,blocked:null}]])('fails closed on incomplete or mismatched eligibility', async data => {
    const admin=adminFor();
    vi.spyOn(admin,'rpc').mockResolvedValue({data,error:null} as never);
    await expect(platformCampaignEligibility(admin,[{email,accountId:a}])).rejects.toThrow('lookup failed');
  });
});

describe('signed platform unsubscribe routes', () => {
  it('renders platform confirmation without tenant lookups or writes, and verifies stored success', async () => {
    const rpc=vi.fn().mockImplementation(async (_name, args) => ({data:args.p_recipients.map((pair:object)=>({...pair,blocked:false})),error:null}));
    mocks.admin={rpc} as unknown as SupabaseClient;
    const params={token:makeUnsubscribeToken('platform',email),done:'1'};
    const confirmation=renderToStaticMarkup(await UnsubscribePage({searchParams:Promise.resolve(params)}));
    expect(confirmation).toContain('Unsubscribe me');
    expect(confirmation).toContain('platform updates and announcements');
    expect(rpc).toHaveBeenCalledWith('platform_campaign_recipient_status',{p_recipients:[{email,account_id:null}]});
    rpc.mockImplementation(async (_name,args)=>({data:args.p_recipients.map((pair:object)=>({...pair,blocked:true})),error:null}));
    const completed=renderToStaticMarkup(await UnsubscribePage({searchParams:Promise.resolve(params)}));
    expect(completed).toContain('You&#x27;re unsubscribed');
    expect(completed).not.toContain('Unsubscribe me');
  });
  it.each(['platform','test-preview'])('persists old and new signed %s tokens without a workspace UUID', async scope => {
    const rpc=vi.fn().mockResolvedValue({data:true,error:null});
    mocks.admin={rpc} as unknown as SupabaseClient;
    const token=makeUnsubscribeToken(scope,email);
    const url=`https://example.com/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
    expect((await GET(new Request(url))).status).toBe(302);
    expect(rpc).not.toHaveBeenCalled();
    expect((await POST(new Request(url,{method:'POST'}))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('record_platform_email_suppression',{p_email:email,p_reason:'one_click_unsubscribe'});
    const form=new FormData(); form.set('token',token);
    await expect(unsubscribeAction(form)).rejects.toThrow('done=1');
    expect(rpc).toHaveBeenLastCalledWith('record_platform_email_suppression',{p_email:email,p_reason:'unsubscribe_link'});
  });
  it('does not acknowledge failed platform persistence and rejects tampering', async () => {
    const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'offline'}});
    mocks.admin={rpc} as unknown as SupabaseClient;
    const token=makeUnsubscribeToken('platform',email);
    expect((await POST(new Request(`https://example.com/api/email/unsubscribe?token=${token}`,{method:'POST'}))).status).toBe(500);
    expect(parseUnsubscribeToken(`${token}x`)).toBeNull();
    expect((await POST(new Request('https://example.com/api/email/unsubscribe?token=bad',{method:'POST'}))).status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('keeps workspace tokens in workspace storage', async () => {
    const insert=vi.fn().mockResolvedValue({error:null});
    const rpc=vi.fn();
    const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),limit:vi.fn().mockReturnThis(),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null}),insert};
    const admin={rpc,from:()=>query} as unknown as SupabaseClient;
    expect(await suppressEmail(admin,a,email,'unsubscribe_link')).toBe(true);
    expect(insert).toHaveBeenCalledWith({account_id:a,email,reason:'unsubscribe_link'});
    expect(rpc).not.toHaveBeenCalled();
  });
});
