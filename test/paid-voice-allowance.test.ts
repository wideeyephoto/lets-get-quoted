import { beforeEach, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),resolve:vi.fn()}));
vi.mock('@/lib/auth',()=>({createAdminClient:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/billing/addon-refunds',()=>({resolveAddonRefund:mocks.resolve}));
import { grantPaidVoiceAllowance } from '@/lib/billing/paid-voice-allowance';

const account='40000000-0000-4000-8000-000000000004';
function fixture(sku='ai_voice_solo') {
  const start=1788912000,end=1791504000;
  const subscription={id:'sub_voicefixture',status:'active',livemode:false,latest_invoice:'in_voicefixture',
    metadata:{lgq_purpose:'top_up',lgq_top_up_id:sku,lgq_account_id:account},
    items:{has_more:false,data:[{current_period_start:start,current_period_end:end}]}} as unknown as Stripe.Subscription;
  const payments={has_more:false,data:[{status:'paid',livemode:false,payment:{type:'payment_intent',payment_intent:'pi_voicefixture'}}]};
  const intent={status:'succeeded',livemode:false,latest_charge:'ch_voicefixture'};
  const stripe={invoicePayments:{list:vi.fn().mockResolvedValue(payments)},paymentIntents:{retrieve:vi.fn().mockResolvedValue(intent)}};
  const contract={account_id:account,subscription_id:subscription.id,invoice_id:'in_voicefixture',top_up_id:sku,
    period_start:new Date(start*1000).toISOString(),period_end:new Date(end*1000).toISOString()};
  mocks.resolve.mockResolvedValue({contract,pending:false});
  return {subscription,payments,intent,stripe:stripe as unknown as Stripe,contract};
}
beforeEach(()=>{vi.resetAllMocks();mocks.rpc.mockResolvedValue({data:'lot',error:null});});

it.each(['ai_voice_flex','ai_voice_solo','ai_voice_growth'])('grants %s only after settled charge and exact current invoice proof',async sku=>{
  const f=fixture(sku);await grantPaidVoiceAllowance(f.stripe,f.subscription,account,false);
  expect(mocks.resolve).toHaveBeenCalledWith(f.stripe,'ch_voicefixture',false);
  expect(mocks.rpc).toHaveBeenCalledWith('grant_paid_voice_addon_period',{p_livemode:false,p_contract:f.contract});
});
it.each(['past_due','unpaid','canceled','trialing'])('does not grant a %s subscription',async status=>{
  const f=fixture();f.subscription.status=status as Stripe.Subscription.Status;
  await grantPaidVoiceAllowance(f.stripe,f.subscription,account,false);expect(mocks.rpc).not.toHaveBeenCalled();
});
it('leaves storage and seat reconciliation independent of voice',async()=>{
  const f=fixture('storage_100gb');await grantPaidVoiceAllowance(f.stripe,f.subscription,account,false);expect(mocks.resolve).not.toHaveBeenCalled();
});
it.each(['workspace','mode','unpaid','pagination','multiple_payments','unsettled','invoice','period','contract_account'])('rejects %s evidence without granting',async mutation=>{
  const f=fixture();
  if(mutation==='workspace')f.subscription.metadata.lgq_account_id='other';
  if(mutation==='mode')f.subscription.livemode=true;
  if(mutation==='unpaid')f.payments.data[0].status='open';
  if(mutation==='pagination')f.payments.has_more=true;
  if(mutation==='multiple_payments')f.payments.data.push(f.payments.data[0]);
  if(mutation==='unsettled')f.intent.status='processing';
  if(mutation==='invoice')f.contract.invoice_id='in_other';
  if(mutation==='period')f.contract.period_end='2026-12-01T00:00:00.000Z';
  if(mutation==='contract_account')f.contract.account_id='other';
  await expect(grantPaidVoiceAllowance(f.stripe,f.subscription,account,false)).rejects.toThrow();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('surfaces a failed grant so the sweep retries instead of reporting fulfillment',async()=>{
  const f=fixture();mocks.rpc.mockResolvedValue({error:{code:'40001'}});
  await expect(grantPaidVoiceAllowance(f.stripe,f.subscription,account,false)).rejects.toThrow('paid_voice_grant_pending');
});
