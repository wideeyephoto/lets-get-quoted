import type Stripe from 'stripe';
import type {SupabaseClient} from '@supabase/supabase-js';
import {validClientRequestId} from '@/lib/client-owner-requests';

/** Only pass the complete, provider-verified refund list from legacy-refund-evidence. */
export async function reconcileQuickStopCancellationRefunds(admin:SupabaseClient,accountId:string,paymentId:string,refunds:readonly Stripe.Refund[]){
  for(const refund of refunds){
    const attemptId=refund.metadata?.lgq_quick_stop_refund_attempt_id;
    if(!attemptId)continue;
    if(!validClientRequestId(attemptId))throw new Error('Refund attempt identity is invalid.');
    const result=await admin.rpc('reconcile_quick_stop_cancellation_refund',{
      p_account_id:accountId,p_payment_id:paymentId,p_id:attemptId,p_provider_id:refund.id,p_status:refund.status,
      p_payment_intent:typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id,
      p_amount:refund.amount,p_currency:refund.currency,
    });
    if(result.error || result.data!==true)throw new Error('Refund attempt reconciliation needs review.');
  }
}
