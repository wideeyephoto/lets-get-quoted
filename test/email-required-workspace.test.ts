import {beforeEach, describe, expect, it, vi} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),query:vi.fn(),eq:vi.fn()}));
vi.mock('resend',()=>({Resend:class{key='synthetic';emails={send:mocks.send};fetchRequest(_path:string,options:{body:string;headers:Record<string,string>}){return mocks.send(JSON.parse(options.body),{idempotencyKey:options.headers['Idempotency-Key']});}}}));
vi.mock('@/lib/auth',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:(...args:unknown[])=>{mocks.eq(...args);return {in:mocks.query,maybeSingle:async()=>({data:null,error:null})};}})})})}));
vi.mock('@/lib/email-brand',async importOriginal=>({...await importOriginal<typeof import('@/lib/email-brand')>(),loadEmailBrand:async()=>{throw new Error('Use fallback brand');}}));
import * as email from '@/lib/email';
const senders=[email.sendOfficeInvitationEmail,email.sendQuoteFollowupEmail,
 email.sendChoiceReminderTestEmail,email.sendBookingConfirmationEmail,
 email.sendClientPortalLinkEmail,email.sendCardUpdateEmail,email.sendCardSetupEmail,
 email.sendSendingDomainFailedEmail,email.sendCustomDomainConnectedEmail];
const input={prepareIntent:async()=>{},noticeId:'11111111-1111-4111-8111-111111111111',recipientEmail:'client@recipient.test',businessName:'Builder',clientName:'Client',url:'https://example.com',address:null,jobRef:'JOB-1',
 inviteUrl:'https://example.com/invite',linkUrl:'https://example.com/portal',whenLabel:'Monday',count:1,
 message:'Choose an option',domain:'builder.example',settingsUrl:'https://example.com/settings',siteUrl:'https://builder.example',planTitle:'Plan',idempotencyKey:'test-key',jobId:'job-1'};
beforeEach(()=>{vi.clearAllMocks();process.env.RESEND_API_KEY='synthetic';mocks.send.mockResolvedValue({data:{id:'accepted'},error:null});mocks.query.mockResolvedValue({data:[],error:null});});
describe('workspace required by formerly optional shared senders',()=>{
 it('preserves the failure episode identity and separates a new episode on the same domain',async()=>{
  const args={...input,accountId:'workspace-a'};
  await email.sendSendingDomainFailedEmail(args);
  await email.sendSendingDomainFailedEmail(args);
  await email.sendSendingDomainFailedEmail({...args,noticeId:'22222222-2222-4222-8222-222222222222'});
  const calls=mocks.send.mock.calls;
  expect(calls[0][1]).toEqual({idempotencyKey:`domain-failure:v1:${input.noticeId}`});
  expect(calls[1][1]).toEqual(calls[0][1]);
  expect(calls[2][1]).not.toEqual(calls[0][1]);
  expect(calls[0][0].tags).toContainEqual({name:'domain_failure_notice_id',value:input.noticeId});
  expect(calls[0][0].from).toBe("Let's Get Quoted <hello@letsgetquoted.com>");
 });
 it('rejects absent or altered failure episode identities before submission',async()=>{
  for(const noticeId of [undefined,null,'','notice-1',` ${input.noticeId}`,input.noticeId+'-retry']){
   await expect(email.sendSendingDomainFailedEmail({...input,accountId:'workspace-a',noticeId} as never)).rejects.toThrow('notice identity');
  }
  expect(mocks.send).not.toHaveBeenCalled();
 });
 it('requires an acceptance ID for a domain failure notice',async()=>{
  mocks.send.mockResolvedValue({data:{},error:null});
  await expect(email.sendSendingDomainFailedEmail({...input,accountId:'workspace-a'})).rejects.toThrow('no message ID');
 });
 for(const sender of senders){
  it(`${sender.name} rejects missing, blank and altered scope before provider submission`,async()=>{
   for(const accountId of [undefined,null,'',' ','workspace.a',' workspace-a']){
    await expect(sender.length === 2 ? sender({} as any, {...input,accountId} as never) : sender({...input,accountId} as never)).rejects.toThrow('workspace could not be verified');
   }
   expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it(`${sender.name} checks the exact supplied workspace and preserves transactional opt-outs`,async()=>{
   mocks.query.mockResolvedValue({data:[{email:input.recipientEmail,reason:'one_click_unsubscribe'}],error:null});
   await (sender.length === 2 ? sender({ rpc: vi.fn().mockImplementation(async (name) => name === 'claim_customer_email_send' ? {data: {action: 'send', id: '11111111-1111-4111-8111-111111111111', token: 'tok', key: 'key', payload: {}, phase: 'primary', retry_before: '2099-01-01T00:00:00Z'}, error: null} : {data: true, error: null}) } as any, {...input,accountId:'workspace-a'} as never) : sender({...input,accountId:'workspace-a'} as never));
   expect(mocks.eq).toHaveBeenCalledWith('account_id','workspace-a');
   expect(mocks.send).toHaveBeenCalledTimes(1);
   expect(mocks.send.mock.calls[0][0].tags).toContainEqual({name:'account_id',value:'workspace-a'});
  });
 }
 it('blocks a late hard bounce on a formerly optional sender',async()=>{
  mocks.query.mockResolvedValue({data:[{email:input.recipientEmail,reason:'hard_bounce'}],error:null});
  await expect(email.sendCardSetupEmail({...input,accountId:'workspace-a'})).rejects.toThrow('blocked');
  expect(mocks.send).not.toHaveBeenCalled();
 });
});
