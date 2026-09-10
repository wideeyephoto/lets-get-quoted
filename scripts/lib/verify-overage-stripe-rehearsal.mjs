import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import Stripe from 'stripe';

// Opt-in only. Never inherit a production key or infer the intended environment.
export async function verifyStripeRehearsal({ q, ck }) {
  const envFile=process.env.LGQ_OVERAGE_STRIPE_TEST_ENV_FILE;
  if (!envFile) throw new Error('Explicit Stripe test env file required');
  const line=readFileSync(envFile,'utf8').split(/\r?\n/).find(l=>l.startsWith('STRIPE_SECRET_KEY='));
  const key=line?.slice('STRIPE_SECRET_KEY='.length).trim().replace(/^['"]|['"]$/g,'');
  if (!key || !/^(sk|rk)_test_/.test(key)) throw new Error('A test-mode Stripe key is required');
  const stripe=new Stripe(key,{timeout:20000,maxNetworkRetries:0});
  const balance=await stripe.balance.retrieve();
  if (balance.livemode!==false) throw new Error('Refusing a live-mode rehearsal');
  const scope=await stripe.accounts.retrieve(null);
  const run=randomUUID();
  let customer,invoice,item;
  try {
    customer=await stripe.customers.create({name:'Overage recovery automated test',metadata:{lgq_rehearsal:run}});
    const account=(await q('insert into public.accounts values(gen_random_uuid()) returning id')).rows[0].id;
    const s=(await q(`insert into public.workspace_overage_settlements(account_id,period_start,period_end,lines,
      total_millicents,chargeable_cents,residual_millicents) values($1,'2026-01-01','2026-02-01','[]',100000,100,0) returning *`,[account])).rows[0];
    const idempotencyKey='lgq:billing:v1:overage.settle:'+createHash('sha256').update(`${s.id}:100`).digest('hex');
    const payload={customer:customer.id,amount:100,currency:'usd',description:'Overage recovery test',
      metadata:{lgq_settlement_id:s.id,lgq_account_id:account}};
    const claim=(await q('select public.claim_overage_settlement_v2($1,$2,false,$3,$4::jsonb) r',
      [s.id,idempotencyKey,scope.id,JSON.stringify(payload)])).rows[0].r;
    if (!claim?.claim_token) throw new Error('Rehearsal claim failed');
    item=await stripe.invoiceItems.create(payload,{idempotencyKey});
    const replay=await stripe.invoiceItems.create(payload,{idempotencyKey});
    ck('Stripe test mode deduplicates the original request',item.id===replay.id && item.livemode===false);
    await q('select public.observe_overage_invoice_item($1,$2,$3)',[s.id,claim.claim_token,item.id]);
    await q('select public.complete_overage_settlement($1,$2,$3)',[s.id,claim.claim_token,item.id]);
    const local=(await q('select * from public.workspace_overage_settlements where id=$1',[s.id])).rows[0];
    ck('real test item is linked to the completed local settlement',local.state==='charged'&&local.stripe_invoice_item_id===item.id);
    invoice=await stripe.invoices.create({customer:customer.id,auto_advance:false,pending_invoice_items_behavior:'include',metadata:{lgq_rehearsal:run}});
    const finalized=await stripe.invoices.finalizeInvoice(invoice.id,{auto_advance:false});
    const items=await stripe.invoiceItems.list({invoice:invoice.id});
    ck('created item is included in the finalized test invoice',items.data.some(i=>i.id===item.id)&&finalized.total===100&&finalized.livemode===false);
  } finally {
    if (invoice) {
      const current=await stripe.invoices.retrieve(invoice.id);
      if (current.status==='draft') await stripe.invoices.del(invoice.id);
      else if (current.status==='open') await stripe.invoices.voidInvoice(invoice.id);
    } else if (item) await stripe.invoiceItems.del(item.id);
    if (customer) await stripe.customers.del(customer.id);
  }
}
