import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';
import {evaluateAndTriggerMarginAlert} from '@/lib/margin-alerts';

/** Re-evaluation may repeat; the owner-notice ledger controls sending separately. */
export async function runMarginEvaluations(admin:SupabaseClient){
  const {data,error}=await admin.rpc('claim_margin_evaluations',{p_limit:5});
  if(error)throw new Error('Could not claim margin evaluations');
  let evaluated=0,failed=0;
  for(const row of data??[]){
    let succeeded=false;
    try{
      const result=await evaluateAndTriggerMarginAlert(admin,row.account_id,row.job_id,null,{dispatchOwner:false});
      succeeded=result.evaluationFailed!==true;
    }catch{/* Retain for another evaluation. */}
    const saved=await admin.rpc('finish_margin_evaluation',{p_account_id:row.account_id,p_job_id:row.job_id,p_revision:row.revision,p_lease_id:row.lease_id,p_succeeded:succeeded});
    if(saved.error || saved.data!==true){failed++;continue;}
    if(succeeded)evaluated++;else failed++;
  }
  const pending=await admin.from('margin_evaluation_requests').select('job_id',{count:'exact',head:true});
  if(pending.error)throw new Error('Could not read margin evaluation backlog');
  return {marginEvaluations:evaluated,marginEvaluationFailures:failed,marginEvaluationBacklog:pending.count??0};
}
