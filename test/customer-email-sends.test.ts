import {beforeEach,expect,it,vi} from 'vitest';
import {sendCustomerEmail} from '@/lib/customer-email-sends';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {EmailProvider} from '@/lib/email-recovery-execution';
const rpc=vi.fn(),suppression=vi.fn(),fetchRequest=vi.fn();
const admin={rpc,from:()=>({select:()=>({eq:()=>({in:suppression})})})} as unknown as SupabaseClient;
const provider={key:'configured-provider',fetchRequest} as unknown as EmailProvider;
const context={accountId:'account',kind:'campaign',idempotencyKey:'occurrence'};
const payload={from:'Builder <quotes@builder.example>',to:'client@example.test',subject:'Campaign',html:'Original',tags:[{name:'account_id',value:'account'},{name:'kind',value:'campaign'}]};
beforeEach(()=>{
 vi.resetAllMocks();suppression.mockResolvedValue({data:[],error:null});fetchRequest.mockResolvedValue({data:{id:'provider-id'},error:null});
 rpc.mockImplementation(async (name,args)=>({data:name==='claim_customer_email_send'?{action:'send',id:'intent',token:'lease',phase:'primary',key:'saved-key',payload:args.p_payload,retry_before:new Date(Date.now()+60000).toISOString()}:true,error:null}));
});
it('sends the saved payload only after the final suppression lookup and uses the configured provider',async()=>{
 await sendCustomerEmail(admin,provider,context,payload);
 expect(suppression).toHaveBeenCalledTimes(2);
 expect(suppression.mock.invocationCallOrder[1]).toBeLessThan(fetchRequest.mock.invocationCallOrder[0]);
 expect(fetchRequest.mock.calls[0][1].headers.Authorization).toBe('Bearer configured-provider');
 expect(JSON.parse(fetchRequest.mock.calls[0][1].body)).toEqual(payload);
});
it.each([{data:[{reason:'one_click_unsubscribe'}],error:null},{data:null,error:{message:'unavailable'}}])('stops blocked or uncertain preferences before claiming',async response=>{
 suppression.mockResolvedValue(response);await expect(sendCustomerEmail(admin,provider,context,payload)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();expect(fetchRequest).not.toHaveBeenCalled();
});
it('does not submit if the recipient opts out while the intent is being saved',async()=>{
 suppression.mockResolvedValueOnce({data:[],error:null}).mockResolvedValue({data:[{reason:'one_click_unsubscribe'}],error:null});
 await expect(sendCustomerEmail(admin,provider,context,payload)).rejects.toThrow();expect(fetchRequest).not.toHaveBeenCalled();
 expect(rpc).toHaveBeenCalledWith('finish_customer_email_send',expect.objectContaining({p_provider_id:null}));
});
it('refuses a saved claim from a different workspace',async()=>{
 rpc.mockResolvedValueOnce({data:{action:'send',id:'intent',token:'lease',phase:'primary',key:'saved',payload:{...payload,tags:[{name:'account_id',value:'other'}]},retry_before:new Date(Date.now()+60000).toISOString()},error:null});
 await expect(sendCustomerEmail(admin,provider,context,payload)).rejects.toThrow();expect(fetchRequest).not.toHaveBeenCalled();
});
