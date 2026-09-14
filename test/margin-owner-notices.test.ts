import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({admin:vi.fn(),job:vi.fn(),costs:vi.fn(),notice:vi.fn()}));
vi.mock('@/lib/auth',()=>({createAdminClient:mocks.admin}));
vi.mock('@/lib/jobs',async original=>({...await original<typeof import('@/lib/jobs')>(),getJob:mocks.job,listCosts:mocks.costs}));
vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.notice}));
import {evaluateAndTriggerMarginAlert} from '@/lib/margin-alerts';
let rpc:ReturnType<typeof vi.fn>;
function setup(floor:number|null=15,error:unknown=null,noticeSaved=true){
  rpc=vi.fn().mockResolvedValue({data:{feed_id:'saved-feed',notice_saved:noticeSaved},error:null});
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{min_margin_pct:floor},error})};
  const db={rpc,from:vi.fn(()=>q)} as unknown as SupabaseClient;mocks.admin.mockReturnValue(db);return db;
}
beforeEach(()=>{vi.clearAllMocks();mocks.job.mockResolvedValue({ref:'JOB-1',client_name:'Client',quoted_amount:1000});mocks.costs.mockResolvedValue([{type:'labor',amount:700,burden_amount:200,cost_source:'clocked'}]);mocks.notice.mockResolvedValue({ownersNotified:1});});
it('saves margin history and the eligible notice together using loaded labor cost',async()=>{
  const db=setup();const result=await evaluateAndTriggerMarginAlert(db,'account','job');
  expect(result).toMatchObject({triggered:true,totalCost:900,noticeSaved:true,emailSent:true,feedEventCreated:true});
  expect(rpc).toHaveBeenCalledWith('record_margin_owner_notice',expect.objectContaining({p_account_id:'account',p_job_id:'job',p_total_cost:900,p_floor_pct:15,p_body:expect.stringContaining('At this check:')}));
  expect(mocks.notice).toHaveBeenCalledWith(db,{sourceId:'saved-feed',accountId:'account'});
});
it('leaves the saved notice successful when immediate pickup fails',async()=>{
  const db=setup();mocks.notice.mockRejectedValueOnce(new Error('unavailable'));
  expect(await evaluateAndTriggerMarginAlert(db,'account','job')).toMatchObject({triggered:true,noticeSaved:true,emailSent:false,feedEventCreated:true});
});
it('does not dispatch when the database cooldown suppresses a notice',async()=>{
  const db=setup(15,null,false);expect(await evaluateAndTriggerMarginAlert(db,'account','job')).toMatchObject({triggered:true,noticeSaved:false,emailSent:false,feedEventCreated:true});expect(mocks.notice).not.toHaveBeenCalled();
});
it('preserves a zero margin floor while still reporting losses',async()=>{
  const db=setup(0);expect((await evaluateAndTriggerMarginAlert(db,'account','job')).triggered).toBe(false);expect(rpc).not.toHaveBeenCalled();
  mocks.costs.mockResolvedValueOnce([{type:'material',amount:1100,cost_source:'estimated'}]);
  expect(await evaluateAndTriggerMarginAlert(db,'account','job')).toMatchObject({triggered:true,reason:'running_loss',floorPct:0});
  expect(rpc).toHaveBeenCalledWith('record_margin_owner_notice',expect.objectContaining({p_body:expect.stringContaining('estimated')}));
});
it.each(['settings','costs','save','invalid'])('does not claim a saved warning when %s fails',async mode=>{
  const db=setup(15,mode==='settings'?{}:null);
  if(mode==='costs')mocks.costs.mockRejectedValueOnce(new Error('unavailable'));
  if(mode==='save')rpc.mockResolvedValueOnce({data:null,error:{message:'stale evidence'}});
  if(mode==='invalid')mocks.costs.mockResolvedValueOnce([{type:'material',amount:Infinity}]);
  expect((await evaluateAndTriggerMarginAlert(db,'account','job')).triggered).toBe(false);expect(mocks.notice).not.toHaveBeenCalled();
});
