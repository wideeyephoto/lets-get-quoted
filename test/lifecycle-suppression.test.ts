import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadLifecycleSuppressedRecipients } from '@/lib/lifecycle-suppression';

const pair = (n:number) => ({accountId:'10000000-0000-4000-8000-000000000001',email:`owner${n}@example.com`});
describe('bounded lifecycle suppression preflight', () => {
  it('uses the installed client to send bounded, normalized exact pairs and deduplicates repeats', async () => {
    const requests: Array<Array<{account_id:string;email:string}>>=[];
    const admin=createClient('https://synthetic.supabase.co','synthetic-secret',{
      auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async (input,init)=>{
        const request=new Request(input,init);
        expect(new URL(request.url).pathname).toBe('/rest/v1/rpc/lifecycle_recipient_suppression');
        const {p_recipients}=await request.json(); requests.push(p_recipients);
        return Response.json(p_recipients.map((r:object,index:number)=>({...r,blocked:index===0})));
      }},
    });
    const result=await loadLifecycleSuppressedRecipients(admin,[...Array.from({length:201},(_,i)=>pair(i)),{...pair(0),email:' OWNER0@Example.com '}]);
    expect(requests.map(r=>r.length)).toEqual([100,100,1]);
    expect(result).toEqual(new Set([0,100,200].map(n=>`${pair(n).accountId}:${pair(n).email}`)));
  });
  it.each([null,[],[{account_id:pair(0).accountId,email:'other@example.com',blocked:false}],
    [{account_id:pair(0).accountId,email:pair(0).email,blocked:null}]])('refuses partial or mismatched results',async data=>{
    const admin={rpc:vi.fn().mockResolvedValue({data,error:null})} as unknown as SupabaseClient;
    await expect(loadLifecycleSuppressedRecipients(admin,[pair(0)])).rejects.toThrow('lookup failed');
  });
  it('discards earlier results when a later batch fails',async()=>{
    const rpc=vi.fn().mockImplementation(async(_name,args)=>({data:args.p_recipients.map((r:object)=>({...r,blocked:false})),error:null}));
    rpc.mockImplementationOnce(async(_name,args)=>({data:args.p_recipients.map((r:object)=>({...r,blocked:true})),error:null}))
      .mockResolvedValueOnce({data:null,error:{message:'offline'}} as never);
    await expect(loadLifecycleSuppressedRecipients({rpc} as unknown as SupabaseClient,Array.from({length:201},(_,i)=>pair(i)))).rejects.toThrow('lookup failed');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('enforces the 500 unique-recipient limit before querying',async()=>{
    const rpc=vi.fn();
    await expect(loadLifecycleSuppressedRecipients({rpc} as unknown as SupabaseClient,Array.from({length:501},(_,i)=>pair(i)))).rejects.toThrow('500');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects absent workspace scope and performs no work for an empty list',async()=>{
    const rpc=vi.fn(); const admin={rpc} as unknown as SupabaseClient;
    await expect(loadLifecycleSuppressedRecipients(admin,[{...pair(0),accountId:''}])).rejects.toThrow('verified');
    expect(await loadLifecycleSuppressedRecipients(admin,[])).toEqual(new Set());
    expect(rpc).not.toHaveBeenCalled();
  });
});
