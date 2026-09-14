import type Stripe from 'stripe';
import type {SupabaseClient} from '@supabase/supabase-js';
import {beforeEach,expect,it,vi} from 'vitest';
import {reconcileQuickStopCancellationRefunds} from '@/lib/quick-stop-cancellation-refund-reconciliation';
const attemptId='14b2d1c1-a31d-4416-bf4b-1ab0486d79bc';
const refund={id:'re_test',status:'succeeded',amount:5000,currency:'usd',payment_intent:{id:'pi_test'},metadata:{lgq_quick_stop_refund_attempt_id:attemptId}} as unknown as Stripe.Refund;
const rpc=vi.fn();const admin={rpc} as unknown as SupabaseClient;
beforeEach(()=>{vi.clearAllMocks();rpc.mockResolvedValue({data:true,error:null});});
it('binds verified provider evidence to the saved account, payment and attempt',async()=>{
  await reconcileQuickStopCancellationRefunds(admin,'account','payment',[refund]);
  expect(rpc).toHaveBeenCalledWith('reconcile_quick_stop_cancellation_refund',{p_account_id:'account',p_payment_id:'payment',p_id:attemptId,p_provider_id:'re_test',p_status:'succeeded',p_payment_intent:'pi_test',p_amount:5000,p_currency:'usd'});
});
it('skips unrelated refunds and rejects malformed attempt metadata',async()=>{
  await reconcileQuickStopCancellationRefunds(admin,'account','payment',[{...refund,metadata:{}}]);expect(rpc).not.toHaveBeenCalled();
  await expect(reconcileQuickStopCancellationRefunds(admin,'account','payment',[{...refund,metadata:{lgq_quick_stop_refund_attempt_id:'invalid'}}])).rejects.toThrow('invalid');expect(rpc).not.toHaveBeenCalled();
});
it('propagates rejected or unavailable reconciliation for webhook retry',async()=>{
  rpc.mockResolvedValueOnce({data:false,error:null}).mockResolvedValueOnce({data:null,error:{message:'offline'}});
  await expect(reconcileQuickStopCancellationRefunds(admin,'account','payment',[refund])).rejects.toThrow('review');
  await expect(reconcileQuickStopCancellationRefunds(admin,'account','payment',[refund])).rejects.toThrow('review');
});
