import type {SupabaseClient} from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({refund:vi.fn()}));
vi.mock('@/lib/payments',()=>({refundPayment:mocks.refund}));
import {executeQuickStopCancellationRefund} from '@/lib/quick-stop-cancellation-refund-attempts';
const attempt={id:'14b2d1c1-a31d-4416-bf4b-1ab0486d79bc',payment_id:'payment',payment_intent:'pi_test',payment_amount_cents:10000,requested_cents:5000,already_refunded_cents:0};
const rpc=vi.fn();const admin={rpc} as unknown as SupabaseClient;
beforeEach(()=>{vi.clearAllMocks();rpc.mockImplementation(async name=>({data:name==='claim_quick_stop_cancellation_refund'?attempt:true,error:null}));mocks.refund.mockImplementation(async(_admin,_account,_payment,_amount,options)=>{await options.onProviderRefund({id:'re_test',status:'succeeded',amount:5000,currency:'usd',payment_intent:'pi_test'} as Stripe.Refund);return {amount:50};});});
it('uses the saved attempt and persists provider evidence before completion',async()=>{
  expect(await executeQuickStopCancellationRefund(admin,'account','request')).toBe(5000);
  expect(mocks.refund).toHaveBeenCalledWith(admin,'account','payment',50,expect.objectContaining({id:attempt.id,requestedCents:5000,alreadyRefundedCents:0,paymentIntent:'pi_test'}));
  expect(rpc.mock.calls.map(c=>c[0])).toEqual(['claim_quick_stop_cancellation_refund','observe_quick_stop_cancellation_refund','finish_quick_stop_cancellation_refund']);
  expect(rpc.mock.calls[2][1]).toMatchObject({p_account_id:'account',p_id:attempt.id,p_accounted:true});
});
it('never calls the provider when a claim is unavailable or already used',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:null});await expect(executeQuickStopCancellationRefund(admin,'account','request')).rejects.toThrow('review');expect(mocks.refund).not.toHaveBeenCalled();
});
it('retains uncertainty without making a second provider call after response loss',async()=>{
  mocks.refund.mockRejectedValueOnce(new Error('Response lost'));
  await expect(executeQuickStopCancellationRefund(admin,'account','request')).rejects.toThrow('Response lost');
  expect(rpc).toHaveBeenLastCalledWith('finish_quick_stop_cancellation_refund',expect.objectContaining({p_accounted:false}));
  expect(mocks.refund).toHaveBeenCalledTimes(1);
});
it('does not mark completion when provider evidence cannot be saved',async()=>{
  rpc.mockImplementation(async name=>({data:name==='claim_quick_stop_cancellation_refund'?attempt:name==='observe_quick_stop_cancellation_refund'?false:true,error:null}));
  await expect(executeQuickStopCancellationRefund(admin,'account','request')).rejects.toThrow('evidence');
  expect(rpc).not.toHaveBeenCalledWith('finish_quick_stop_cancellation_refund',expect.objectContaining({p_accounted:true}));
  expect(rpc).toHaveBeenLastCalledWith('finish_quick_stop_cancellation_refund',expect.objectContaining({p_accounted:false}));
});
