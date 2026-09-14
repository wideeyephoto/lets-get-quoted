import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
const mocks=vi.hoisted(()=>({rail:vi.fn(),notices:vi.fn(),feed:vi.fn()}));
vi.mock('@/lib/payments',()=>({inspectLegacyDestinationPaymentRail:mocks.rail}));
vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.notices}));
vi.mock('@/lib/job-feed',()=>({createDisputeFeedEvent:mocks.feed}));
import {reconcileLegacyDispute} from '@/lib/legacy-dispute-reconciliation';
beforeEach(()=>{vi.clearAllMocks();mocks.rail.mockResolvedValue({kind:'allowed',chargeModelColumnPresent:true});mocks.notices.mockResolvedValue({});});
function fixture(options: { payment?:Record<string,unknown>; provider?:Record<string,unknown>; readError?:boolean; writeError?:boolean; loser?:boolean; account?:string }={}) {
  const row={id:'payment-1',account_id:'account-1',job_id:null,invoice_id:null,status:'paid',amount:10,stripe_payment_intent:'pi_1',stripe_dispute_id:null,dispute_status:null,dispute_notice_event_id:null,...options.payment};
  const current={id:'du_1',payment_intent:'pi_1',amount:1000,currency:'usd',livemode:false,status:'needs_response',reason:'general',created:1760000000,evidence_details:{due_by:1761000000},...options.provider};
  const retrieve=vi.fn().mockResolvedValue(current);
  const update=vi.fn();const filters:unknown[][]=[];let writing=false;
  const q={select:()=>q,eq:(...v:unknown[])=>{if(writing)filters.push(v);return q;},is:(...v:unknown[])=>{if(writing)filters.push(v);return q;},
    update:(v:unknown)=>{writing=true;update(v);return q;},
    maybeSingle:async()=>writing?{data:options.loser?null:{id:row.id},error:options.writeError?new Error('write failed'):null}:{data:row,error:options.readError?new Error('read failed'):null}};
  const db={from:()=>q} as unknown as SupabaseClient;
  const event={type:'charge.dispute.created',account:options.account,livemode:false,data:{object:{id:'du_1',payment_intent:'pi_1',status:'needs_response'}}} as Stripe.Event;
  const stripe={disputes:{retrieve}} as unknown as Stripe;
  return {db,event,stripe,update,filters,retrieve,run:()=>reconcileLegacyDispute(db,stripe,event)};
}
it('saves the verified opening with scoped compare-and-set guards and dispatches its saved notice',async()=>{
  const f=fixture();await f.run();expect(f.retrieve).toHaveBeenCalledWith('du_1');
  expect(f.update).toHaveBeenCalledWith(expect.objectContaining({status:'disputed',stripe_dispute_id:'du_1',dispute_notice_event_id:expect.any(String)}));
  for(const filter of [['account_id','account-1'],['stripe_payment_intent','pi_1'],['amount',10],['stripe_dispute_id',null],['charge_model','destination']])expect(f.filters).toContainEqual(filter);
  expect(mocks.notices).toHaveBeenCalledWith(f.db,{accountId:'account-1',sourceId:f.update.mock.calls[0][0].dispute_notice_event_id});
});
it('uses current lost status even when the opening event arrives before any local opening was saved',async()=>{
  const f=fixture({provider:{status:'lost'}});await f.run();expect(f.update).toHaveBeenCalledWith(expect.objectContaining({status:'refunded',dispute_status:'lost'}));expect(mocks.notices).toHaveBeenCalledTimes(1);
});
it('uses current won status from a delayed opening event without sending obsolete evidence instructions',async()=>{
  const f=fixture({provider:{status:'won'}});await f.run();expect(f.update).toHaveBeenCalledWith(expect.objectContaining({status:'paid',dispute_status:'won'}));expect(mocks.notices).not.toHaveBeenCalled();
});
it.each([{status:'lost',paymentStatus:'refunded'},{status:'won',paymentStatus:'paid'}])('does not repeat an already saved $status outcome',async({status,paymentStatus})=>{
  const f=fixture({payment:{status:paymentStatus,stripe_dispute_id:'du_1',dispute_status:status},provider:{status}});await f.run();expect(f.update).not.toHaveBeenCalled();expect(mocks.notices).not.toHaveBeenCalled();
});
it('rejects an older open provider observation after a terminal result',async()=>{
  const f=fixture({payment:{stripe_dispute_id:'du_1',dispute_status:'won'}});await expect(f.run()).rejects.toThrow('terminal_conflict');expect(f.update).not.toHaveBeenCalled();
});
it.each([{id:'du_wrong'},{payment_intent:'pi_other'},{currency:'eur'},{livemode:true},{amount:0},{amount:500},{amount:1100}])('rejects mismatched or partial provider evidence %j',async provider=>{
  const f=fixture({provider});await expect(f.run()).rejects.toThrow();expect(f.update).not.toHaveBeenCalled();expect(mocks.notices).not.toHaveBeenCalled();
});
it('rejects a different saved dispute identity',async()=>{
  const f=fixture({payment:{stripe_dispute_id:'du_other'}});await expect(f.run()).rejects.toThrow('identity_conflict');expect(f.update).not.toHaveBeenCalled();
});
it.each(['warning_needs_response','warning_under_review','warning_closed','prevented'])('does not represent %s as a formal chargeback',async status=>{
  const f=fixture({provider:{status}});await f.run();expect(f.update).not.toHaveBeenCalled();
});
it('rejects connected-account scope before reading or submitting',async()=>{
  const f=fixture({account:'acct_connected'});await expect(f.run()).rejects.toThrow('connected_scope');expect(f.retrieve).not.toHaveBeenCalled();
});
it('does not query provider or write for a different payment rail',async()=>{
  mocks.rail.mockResolvedValue({kind:'blocked'});const f=fixture();await f.run();expect(f.retrieve).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();
});
it.each([{readError:true},{writeError:true},{loser:true}])('propagates failure for retry %j',async options=>{
  const f=fixture(options);await expect(f.run()).rejects.toThrow();expect(mocks.notices).not.toHaveBeenCalled();
});
it('keeps saved dispute success if immediate notice pickup fails',async()=>{
  mocks.notices.mockRejectedValueOnce(new Error('pickup unavailable'));const f=fixture();await expect(f.run()).resolves.toBeUndefined();expect(f.update).toHaveBeenCalledTimes(1);
});
it('does not mutate payments if the provider lookup fails',async()=>{
  const f=fixture();f.retrieve.mockRejectedValueOnce(new Error('unavailable'));await expect(f.run()).rejects.toThrow('unavailable');expect(f.update).not.toHaveBeenCalled();
});
it('requires accounting review when the payment already has a partial refund',async()=>{
  const f=fixture({payment:{refunded_amount:5},provider:{status:'lost'}});await expect(f.run()).rejects.toThrow('payment_state_review_required');expect(f.update).not.toHaveBeenCalled();
});
