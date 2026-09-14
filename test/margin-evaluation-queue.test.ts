import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({evaluate:vi.fn()}));
vi.mock('@/lib/margin-alerts',()=>({evaluateAndTriggerMarginAlert:mocks.evaluate}));
import {runMarginEvaluations} from '@/lib/margin-evaluation-queue';
beforeEach(()=>{vi.clearAllMocks();mocks.evaluate.mockResolvedValue({triggered:false});});
const row={account_id:'account',job_id:'job',revision:'revision',lease_id:'lease'};
function fixture(finish=true){const rpc=vi.fn(async(name:string)=>name==='claim_margin_evaluations'?{data:[row],error:null}:{data:finish,error:null});return {rpc,db:{rpc,from:()=>({select:async()=>({count:0,error:null})})} as unknown as SupabaseClient};}
it('finishes healthy checks and leaves sending to the bounded owner worker',async()=>{
  const {rpc,db}=fixture();expect(await runMarginEvaluations(db)).toEqual({marginEvaluations:1,marginEvaluationFailures:0,marginEvaluationBacklog:0});
  expect(mocks.evaluate).toHaveBeenCalledWith(db,'account','job',null,{dispatchOwner:false});
  expect(rpc).toHaveBeenCalledWith('finish_margin_evaluation',{p_account_id:'account',p_job_id:'job',p_revision:'revision',p_lease_id:'lease',p_succeeded:true});
});
it.each(['failed','thrown'])('retains %s checks for recovery',async mode=>{
  const {rpc,db}=fixture();if(mode==='failed')mocks.evaluate.mockResolvedValueOnce({triggered:false,evaluationFailed:true});else mocks.evaluate.mockRejectedValueOnce(new Error('unavailable'));
  expect((await runMarginEvaluations(db)).marginEvaluationFailures).toBe(1);
  expect(rpc).toHaveBeenCalledWith('finish_margin_evaluation',expect.objectContaining({p_succeeded:false}));
});
it('reports lost lease or closeout failure without claiming completion',async()=>{const {db}=fixture(false);expect(await runMarginEvaluations(db)).toEqual({marginEvaluations:0,marginEvaluationFailures:1,marginEvaluationBacklog:0});});
