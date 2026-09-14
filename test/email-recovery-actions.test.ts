import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),rpc:vi.fn(),single:vi.fn(),execute:vi.fn(),redirect:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireMfaPermission:m.permission}));
vi.mock('next/navigation',()=>({redirect:m.redirect}));
vi.mock('@/lib/document-email-sends',()=>({executeDocumentEmailClaim:m.execute}));
vi.mock('resend',()=>({Resend:class{}}));
import {resolveEmailSend,resendDocumentEmail} from '@/app/admin/health/email/[source]/[id]/actions';
beforeEach(()=>{
 vi.resetAllMocks();process.env.RESEND_API_KEY='test-key';
 const admin={rpc:m.rpc,from:()=>({select:()=>({eq:()=>({single:m.single})})})};
 m.permission.mockResolvedValue({admin,adminEmail:'operator@example.test'});m.single.mockResolvedValue({data:{account_id:'account'}});m.rpc.mockResolvedValue({data:true,error:null});
});
it('rejects read-only staff before any database mutation',async()=>{
 m.permission.mockRejectedValue(new Error('Forbidden'));await expect(resolveEmailSend('document','send',new FormData())).rejects.toThrow('Forbidden');
 expect(m.permission).toHaveBeenCalledWith('ops.manage');expect(m.rpc).not.toHaveBeenCalled();
});
it('does not report an ineligible closeout as successful',async()=>{
 m.rpc.mockResolvedValue({data:false,error:null});const form=new FormData();form.set('evidence','Provider records checked and reconciled');
 await expect(resolveEmailSend('document','send',form)).rejects.toThrow('eligible');expect(m.redirect).not.toHaveBeenCalled();
});
it('reuses the form identity and dispatches only the returned durable resend claim',async()=>{
 const claim={action:'send',id:'resend-id'};m.rpc.mockResolvedValue({data:claim,error:null});const form=new FormData();form.set('request_id','11111111-1111-4111-8111-111111111111');
 await resendDocumentEmail('original',form);await resendDocumentEmail('original',form);
 expect(m.rpc.mock.calls[0][1].p_idempotency_key).toBe(m.rpc.mock.calls[1][1].p_idempotency_key);expect(m.execute).toHaveBeenCalledWith(expect.anything(),expect.anything(),'account',claim);
});
