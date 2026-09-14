import {beforeEach, describe, expect, it, vi} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),query:vi.fn(),eq:vi.fn()}));
vi.mock('resend',()=>({Resend:class{emails={send:mocks.send};}}));
vi.mock('@/lib/auth',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:(...args:unknown[])=>{mocks.eq(...args);return {in:mocks.query,maybeSingle:async()=>({data:null,error:null})};}})})})}));
vi.mock('@/lib/email-brand',async importOriginal=>({...await importOriginal<typeof import('@/lib/email-brand')>(),loadEmailBrand:async()=>{throw new Error('Use fallback brand');}}));
import * as email from '@/lib/email';
const senders=[email.sendOfficeInvitationEmail,email.sendQuoteFollowupEmail,email.sendSelectionRequestEmail,
 email.sendAppointmentReminderEmail,email.sendChoiceReminderTestEmail,email.sendBookingConfirmationEmail,
 email.sendClientPortalLinkEmail,email.sendCardUpdateEmail,email.sendCardSetupEmail,
 email.sendSendingDomainFailedEmail,email.sendCustomDomainConnectedEmail];
const input={recipientEmail:'client@recipient.test',businessName:'Builder',clientName:'Client',url:'https://example.com',address:null,jobRef:'JOB-1',
 inviteUrl:'https://example.com/invite',linkUrl:'https://example.com/portal',whenLabel:'Monday',count:1,
 message:'Choose an option',domain:'builder.example',settingsUrl:'https://example.com/settings',siteUrl:'https://builder.example',planTitle:'Plan'};
beforeEach(()=>{vi.clearAllMocks();process.env.RESEND_API_KEY='synthetic';mocks.send.mockResolvedValue({data:{id:'accepted'},error:null});mocks.query.mockResolvedValue({data:[],error:null});});
describe('workspace required by formerly optional shared senders',()=>{
 for(const sender of senders){
  it(`${sender.name} rejects missing, blank and altered scope before provider submission`,async()=>{
   for(const accountId of [undefined,null,'',' ','workspace.a',' workspace-a']){
    await expect(sender({...input,accountId} as never)).rejects.toThrow('workspace could not be verified');
   }
   expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it(`${sender.name} checks the exact supplied workspace and preserves transactional opt-outs`,async()=>{
   mocks.query.mockResolvedValue({data:[{email:input.recipientEmail,reason:'one_click_unsubscribe'}],error:null});
   await sender({...input,accountId:'workspace-a'} as never);
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
