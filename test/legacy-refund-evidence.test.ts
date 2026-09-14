import type Stripe from 'stripe';
import {beforeEach,expect,it,vi} from 'vitest';
import {resolveLegacyRefundEvidence} from '@/lib/billing/legacy-refund-evidence';
const retrieve=vi.fn(),list=vi.fn();
const stripe={charges:{retrieve},refunds:{list}} as unknown as Stripe;
const input={chargeId:'ch_test',paymentId:'payment',paymentIntent:'pi_test',amountCents:10000,livemode:false};
const charge={id:'ch_test',metadata:{payment_id:'payment'},payment_intent:'pi_test',livemode:false,currency:'usd',paid:true,captured:true,amount:10000,amount_captured:10000};
const refund=(id='re_test',status='succeeded',amount=1000)=>({id,status,amount,charge:'ch_test',payment_intent:'pi_test',currency:'usd'});
beforeEach(()=>{vi.clearAllMocks();retrieve.mockResolvedValue(charge);list.mockResolvedValue({data:[refund()],has_more:false});});
it('counts succeeded refunds across all pages and excludes every unfinished or failed status',async()=>{
  list.mockResolvedValueOnce({data:[refund('re_first')],has_more:true}).mockResolvedValueOnce({data:[refund('re_second','succeeded',2000),refund('re_pending','pending'),refund('re_action','requires_action'),refund('re_failed','failed'),refund('re_canceled','canceled')],has_more:false});
  expect(await resolveLegacyRefundEvidence(stripe,input)).toBe(3000);
  expect(list).toHaveBeenNthCalledWith(2,{charge:'ch_test',limit:100,starting_after:'re_first'});
});
it.each([{payment_intent:'pi_other'},{metadata:{payment_id:'other'}},{livemode:true},{currency:'eur'},{paid:false},{captured:false},{amount:5000},{amount_captured:5000}])('rejects a mismatched charge %j',async patch=>{
  retrieve.mockResolvedValueOnce({...charge,...patch});await expect(resolveLegacyRefundEvidence(stripe,input)).rejects.toThrow();expect(list).not.toHaveBeenCalled();
});
it.each([{charge:'ch_other'},{payment_intent:'pi_other'},{currency:'eur'},{amount:-1},{amount:0},{amount:10001},{status:'unknown'},{status:null}])('rejects invalid refund evidence %j',async patch=>{
  list.mockResolvedValueOnce({data:[{...refund(),...patch}],has_more:false});await expect(resolveLegacyRefundEvidence(stripe,input)).rejects.toThrow();
});
it('rejects repeated IDs rather than counting a repeated pagination result twice',async()=>{
  list.mockResolvedValueOnce({data:[refund()],has_more:true}).mockResolvedValueOnce({data:[refund()],has_more:false});
  await expect(resolveLegacyRefundEvidence(stripe,input)).rejects.toThrow();
});
it('fails closed on incomplete pages, absent completion flags and provider outages',async()=>{
  list.mockResolvedValueOnce({data:[],has_more:true});await expect(resolveLegacyRefundEvidence(stripe,input)).rejects.toThrow();
  list.mockResolvedValueOnce({data:[refund()]});await expect(resolveLegacyRefundEvidence(stripe,input)).rejects.toThrow();
  list.mockRejectedValueOnce(new Error('offline'));await expect(resolveLegacyRefundEvidence(stripe,input)).rejects.toThrow('offline');
});
it('bounds pagination without accepting a partial total',async()=>{
  let index=0;list.mockImplementation(async()=>({data:[refund('re_'+index++,'succeeded',1)],has_more:true}));
  await expect(resolveLegacyRefundEvidence(stripe,input)).rejects.toThrow('incomplete');expect(list).toHaveBeenCalledTimes(10);
});
it('accepts expanded provider bindings',async()=>{
  retrieve.mockResolvedValueOnce({...charge,payment_intent:{id:'pi_test'}});
  list.mockResolvedValueOnce({data:[{...refund(),charge:{id:'ch_test'},payment_intent:{id:'pi_test'}}],has_more:false});
  expect(await resolveLegacyRefundEvidence(stripe,input)).toBe(1000);
});

it('exposes complete verified outcomes only after pagination succeeds',async()=>{
  const collected=vi.fn();list.mockResolvedValueOnce({data:[refund('re_first')],has_more:true}).mockRejectedValueOnce(new Error('next page unavailable'));
  await expect(resolveLegacyRefundEvidence(stripe,{...input,onVerifiedRefunds:collected})).rejects.toThrow();expect(collected).not.toHaveBeenCalled();
  list.mockResolvedValueOnce({data:[refund()],has_more:false});
  expect(await resolveLegacyRefundEvidence(stripe,{...input,onVerifiedRefunds:collected})).toBe(1000);
  expect(collected).toHaveBeenCalledWith([refund()]);
});
