import type {SupabaseClient} from '@supabase/supabase-js';
import {refundPayment} from '@/lib/payments';

export async function executeQuickStopCancellationRefund(admin:SupabaseClient,accountId:string,requestId:string):Promise<number>{
  const claimed=await admin.rpc('claim_quick_stop_cancellation_refund',{p_account_id:accountId,p_quick_stop_id:requestId});
  const a=claimed.data as {id:string;payment_id:string;payment_intent:string;payment_amount_cents:number;requested_cents:number;already_refunded_cents:number}|null;
  if(claimed.error || !a)throw new Error('Refund attempt needs review.');
  const requestedCents=Number(a.requested_cents),alreadyRefundedCents=Number(a.already_refunded_cents);
  try{
    await refundPayment(admin,accountId,a.payment_id,requestedCents/100,{
      id:a.id,paymentAmountCents:Number(a.payment_amount_cents),paymentIntent:a.payment_intent,alreadyRefundedCents,requestedCents,
      onProviderRefund:async refund=>{
        const saved=await admin.rpc('observe_quick_stop_cancellation_refund',{p_account_id:accountId,p_id:a.id,p_provider_id:refund.id,p_status:refund.status,p_payment_intent:typeof refund.payment_intent==='string'?refund.payment_intent:refund.payment_intent?.id,p_amount:refund.amount,p_currency:refund.currency});
        if(saved.error || saved.data!==true)throw new Error('Refund provider evidence could not be saved.');
      },
    });
    const finished=await admin.rpc('finish_quick_stop_cancellation_refund',{p_account_id:accountId,p_id:a.id,p_accounted:true});
    if(finished.error || finished.data!==true)throw new Error('Refund accounting needs review.');
    return requestedCents;
  }catch(error){
    // Failure to persist closeout leaves the durable submitting claim in place.
    // Neither state permits another automatic provider submission.
    await admin.rpc('finish_quick_stop_cancellation_refund',{p_account_id:accountId,p_id:a.id,p_accounted:false});
    throw error;
  }
}
