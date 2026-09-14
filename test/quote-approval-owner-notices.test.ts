import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({job:vi.fn(),lead:vi.fn(),notices:vi.fn()}));
vi.mock('@/lib/jobs',()=>({getJob:mocks.job,formatMoney:(amount:number)=>`$${amount}`}));
vi.mock('@/lib/leads',()=>({getLeadByConvertedJob:mocks.lead,updateLeadStatus:vi.fn()}));
vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.notices}));
import {applyQuoteAcceptance} from '@/lib/job-feed';
beforeEach(()=>{vi.clearAllMocks();mocks.job.mockResolvedValue({id:'job-1',account_id:'account-1',client_name:'Client',quoted_amount:100,status:'in_progress'});mocks.lead.mockResolvedValue(null);mocks.notices.mockResolvedValue({});});
function fixture(options:{conflict?:boolean;insertError?:boolean;historical?:boolean}={}){
  let saved:Record<string,unknown>|null=options.historical?{id:'old-event',meta:null}:null;
  const inserts:Record<string,unknown>[]=[];const filters:unknown[][]=[];
  const db={from:(table:string)=>{
    let inserting=false;
    const q={update:()=>q,select:()=>q,eq:(...args:unknown[])=>{filters.push(args);return q;},
      insert:(value:Record<string,unknown>)=>{inserting=true;inserts.push(value);return q;},
      maybeSingle:async()=>({data:table==='jobs'?null:saved,error:null}),
      single:async()=>{
        if(!inserting)throw new Error('unexpected read');
        if(options.insertError)return {data:null,error:{code:'XX000'}};
        saved={...inserts.at(-1),id:'approval-event'};
        return options.conflict?{data:null,error:{code:'23505'}}:{data:saved,error:null};
      }};return q;
  }} as unknown as SupabaseClient;
  return {db,inserts,filters};
}
it('marks only client-link acceptance and dispatches the saved approval event',async()=>{
  const f=fixture();await applyQuoteAcceptance(f.db,'account-1','job-1',{source:'client_link'});
  expect(f.inserts[0]).toMatchObject({kind:'quote_approved',source_table:'jobs',source_id:'job-1',meta:{owner_email_notice:'quote_approval_v1',acceptance_source:'client_link'}});
  expect(mocks.notices).toHaveBeenCalledWith(f.db,{sourceId:'approval-event',accountId:'account-1'});
});
it('reuses the same saved approval on repeated submissions',async()=>{
  const f=fixture();await applyQuoteAcceptance(f.db,'account-1','job-1',{source:'client_link'});await applyQuoteAcceptance(f.db,'account-1','job-1',{source:'client_link'});
  expect(f.inserts).toHaveLength(1);expect(mocks.notices.mock.calls.map(call=>call[1].sourceId)).toEqual(['approval-event','approval-event']);
});
it('recovers the scoped winning feed record after an insertion race',async()=>{
  const f=fixture({conflict:true});await expect(applyQuoteAcceptance(f.db,'account-1','job-1',{source:'client_link'})).resolves.toMatchObject({recorded:true});
  expect(f.filters).toContainEqual(['account_id','account-1']);expect(f.filters).toContainEqual(['job_id','job-1']);expect(mocks.notices).toHaveBeenCalledWith(f.db,{sourceId:'approval-event',accountId:'account-1'});
});
it('does not backfill notices for historical approvals',async()=>{
  const f=fixture({historical:true});await applyQuoteAcceptance(f.db,'account-1','job-1',{source:'client_link'});expect(f.inserts).toHaveLength(0);expect(mocks.notices).not.toHaveBeenCalled();
});
it('does not notify the owner about an approval they recorded themselves',async()=>{
  const f=fixture();await applyQuoteAcceptance(f.db,'account-1','job-1',{source:'owner_verbal'});expect(f.inserts[0].meta).toBeNull();expect(mocks.notices).not.toHaveBeenCalled();
});
it('preserves acceptance when inline queue pickup fails',async()=>{
  const f=fixture();mocks.notices.mockRejectedValueOnce(new Error('pickup failed'));await expect(applyQuoteAcceptance(f.db,'account-1','job-1',{source:'client_link'})).resolves.toMatchObject({recorded:true});
});
it('does not announce an approval if its source could not be saved',async()=>{
  const f=fixture({insertError:true});await expect(applyQuoteAcceptance(f.db,'account-1','job-1',{source:'client_link'})).rejects.toMatchObject({code:'XX000'});expect(mocks.notices).not.toHaveBeenCalled();
});

it('does not move a job backwards if it left the quote stage during acceptance',async()=>{
  mocks.job.mockResolvedValue({id:'job-1',account_id:'account-1',client_name:'Client',quoted_amount:100,status:'new_lead'});
  const f=fixture();await expect(applyQuoteAcceptance(f.db,'account-1','job-1',{source:'client_link'})).resolves.toMatchObject({recorded:true,promoted:false});
  expect(f.filters).toContainEqual(['status','new_lead']);
});
