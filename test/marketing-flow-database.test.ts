import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

const db = new PGlite();
const account = '11111111-1111-4111-8111-111111111111';
const job = '22222222-2222-4222-8222-222222222222';
const proof = '33333333-3333-4333-8333-333333333333';
const quote = '44444444-4444-4444-8444-444444444444';
const lease = '55555555-5555-4555-8555-555555555555';
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table public.accounts(id uuid primary key);
    create table public.jobs(id uuid primary key,account_id uuid,status text);
    create table public.sites(id uuid primary key,account_id uuid,content jsonb);
    create function public.office_can(uuid,text) returns boolean language sql as 'select false';`);
  for (const filename of ['20260904120000_merchandise_orders.sql','20260905120000_merchandise_hardening.sql','20260905170000_merchandise_card_operations.sql','20260905180000_neighborhood_halo_campaigns.sql','20260831210000_managed_ads_atomic_wallet_operations.sql','20260910104058_marketing_flow_repair.sql']) {
    await db.exec(readFileSync(`migrations/${filename}`, 'utf8'));
  }
  await db.exec(`insert into public.accounts values('${account}'); insert into public.jobs values('${job}','${account}','complete');
    insert into public.sites values('${account}','${account}','{"adCampaign":{"walletBalanceCents":10000}}');
    insert into public.merchandise_card_designs(id,account_id) values('${proof}','${account}');
    insert into public.merchandise_card_proofs(id,account_id,design_id,front_asset_key,front_asset_hash,back_asset_key,back_asset_hash,approval_hash,is_approved,preflight_passed)
      values('${proof}','${account}','${proof}','front','hash','back','hash','approval',true,true);
    insert into public.merchandise_order_quotes(id,account_id,proof_id,card_count,pack_plan,subtotal_cents,shipping_cost_cents,total_cents,wholesale_cost_cents,platform_fee_cents,destination_fingerprint,expires_at)
      values('${quote}','${account}','${proof}',100,'{}',3500,1200,4700,1800,1700,'fingerprint',now()+interval '1 hour');`);
}, 30000);
afterAll(async () => { await db.close(); });

describe('Marketing transaction boundaries', () => {
  it('creates one UUID card order and refuses concurrent claims', async () => {
    const call = `select public.claim_card_checkout('${account}','${quote}','${proof}','approval','{}','TEST-CARD','${lease}') as result`;
    const first = await db.query<{result: {order_id: string;operation_key: string}}>(call);
    expect(first.rows[0].result.order_id).toMatch(/^[a-f0-9-]{36}$/);
    await expect(db.query(call)).rejects.toThrow(/being prepared/);
    const rows = await db.query<{count:number}>('select count(*)::int as count from public.merchandise_orders');
    expect(rows.rows[0].count).toBe(1);
    await db.query(`select public.complete_card_checkout('${account}',$1,'${lease}','cs_fixture')`,[first.rows[0].result.operation_key]);
    const repeated = await db.query<{result:{session_id:string}}>(call);
    expect(repeated.rows[0].result.session_id).toBe('cs_fixture');
  });
  it('rejects cross-account quotes and mismatched proof approvals', async () => {
    await expect(db.query(`select public.claim_card_checkout('${job}','${quote}','${proof}','approval','{}','OTHER','${lease}')`)).rejects.toThrow(/unavailable/);
    await expect(db.query(`select public.claim_card_checkout('${account}','${quote}','${proof}','wrong','{}','OTHER','${lease}')`)).rejects.toThrow(/proof/);
  });
  it('reserves Halo funds atomically and refunds only once across terminal replays', async () => {
    const details = { budget_dollars:25,duration_days:5,radius_miles:1,center_lat:30,center_lng:-97,street_name:'Main St',city:'Austin',daily_budget_dollars:5,ad_copy:{},landing_page_url:'https://example.com',expires_at:new Date(Date.now()+86400000).toISOString() };
    await db.query(`select public.reserve_halo_campaign('${account}','${job}','${job}',$1)`,[JSON.stringify(details)]);
    await expect(db.query(`select public.reserve_halo_campaign('${account}','${job}','${lease}',$1)`,[JSON.stringify(details)])).rejects.toThrow(/already reserved/);
    const settled = await db.query<{result:{wallet_refunded_cents:number}}>(`select public.settle_halo_campaign('${account}','${job}',700,'killed','test') as result`);
    expect(settled.rows[0].result.wallet_refunded_cents).toBe(1800);
    await db.query(`select public.settle_halo_campaign('${account}','${job}',0,'completed','retry')`);
    const balance = await db.query<{balance:number}>(`select (content->'adCampaign'->>'walletBalanceCents')::int as balance from public.sites where account_id='${account}'`);
    expect(balance.rows[0].balance).toBe(9300);
  });
  it('preserves Meta IDs in the real RPC path without double crediting', async () => {
    const args=[account,'pi_fixture',500,0,null,null,'pending_provisioning',null,null,null,null,null,JSON.stringify({metaCampaignId:'123',metaAdSetId:'456',metaAdId:'789',stripeCustomerId:'cus_fixture',walletBalanceCents:999999})];
    const call='select public.atomic_ad_wallet_credit_v2('+args.map((_,i)=>`$${i+1}`).join(',')+')';
    await db.query(call,args); await db.query(call,args);
    const state=await db.query<{state:Record<string,unknown>}>(`select content->'adCampaign' as state from public.sites where account_id='${account}'`);
    expect(state.rows[0].state).toMatchObject({metaCampaignId:'123',metaAdSetId:'456',metaAdId:'789',stripeCustomerId:'cus_fixture',walletBalanceCents:9800});
  });
  it('does not expose trusted wallet and checkout functions or writable orders to browsers', async () => {
    const permissions=await db.query<{allowed:boolean}>(`select has_function_privilege('authenticated','public.claim_card_checkout(uuid,uuid,uuid,text,jsonb,text,uuid)','execute') or has_function_privilege('anon','public.settle_halo_campaign(uuid,uuid,integer,text,text)','execute') or has_table_privilege('authenticated','public.merchandise_orders','update') or has_table_privilege('authenticated','public.neighborhood_halo_campaigns','update') as allowed`);
    expect(permissions.rows[0].allowed).toBe(false);
  });
  it('records payment and fulfillment once, and ignores delayed production callbacks', async () => {
    const found = await db.query<{id:string}>("select id from public.merchandise_orders where order_number='TEST-CARD'");
    const id = found.rows[0].id;
    const claim = `select public.claim_card_fulfillment('${account}','${id}','cs_fixture','pi_card',5000,300,'${lease}',175) as result`;
    await db.query(claim);
    await expect(db.query(claim)).rejects.toThrow(/already being processed/);
    await db.query(`select public.finish_card_fulfillment('${account}','${id}','${lease}','{"ok":true,"printfulOrderId":123,"status":"pending"}')`);
    expect((await db.query<{result:{completed:boolean}}>(claim)).rows[0].result.completed).toBe(true);
    const revenue = await db.query<{count:number;fee:number}>("select count(*)::int count,max(stripe_processing_fee)::float8 fee from public.merchandise_revenue_ledger where event_key='card-payment:pi_card'");
    expect(revenue.rows[0]).toEqual({count:1,fee:1.75});
    await db.query(`select public.apply_printful_order_event('TEST-CARD',123,'{"status":"shipped","fulfillment_status":"shipped","tracking_number":"REAL-TRACKING"}')`);
    await db.query(`select public.apply_printful_order_event('TEST-CARD',123,'{"status":"in_production","fulfillment_status":"in_production"}')`);
    const order = await db.query<{status:string;payment_status:string}>("select status,payment_status from public.merchandise_orders where order_number='TEST-CARD'");
    expect(order.rows[0]).toEqual({status:'shipped',payment_status:'paid'});
  });
  it('serializes Halo delivery changes and never lowers cumulative spend', async () => {
    await db.exec(`update public.neighborhood_halo_campaigns set status='active' where id='${job}'`);
    const claim = `select public.claim_halo_delivery('${account}','${job}','${lease}') as claimed`;
    expect((await db.query<{claimed:boolean}>(claim)).rows[0].claimed).toBe(true);
    expect((await db.query<{claimed:boolean}>(claim)).rows[0].claimed).toBe(false);
    await db.exec(`select public.release_halo_delivery('${account}','${job}','${lease}');
      select public.sync_halo_metrics('${job}',1000,100,10,2);
      select public.sync_halo_metrics('${job}',500,50,5,1);`);
    const row=await db.query<{spend:number;clicks:number}>(`select spend_dollars::float8 spend,clicks from public.neighborhood_halo_campaigns where id='${job}'`);
    expect(row.rows[0]).toEqual({spend:10,clicks:10});
    await db.exec(`update public.neighborhood_halo_campaigns set status='completed' where id='${job}'`);
    expect((await db.query<{changed:boolean}>(`select public.sync_halo_metrics('${job}',1500,200,20,3) as changed`)).rows[0].changed).toBe(false);
  });
  it('starts an unfunded wallet at zero and preserves a credit across lifecycle changes', async () => {
    const fresh='66666666-6666-4666-8666-666666666666';
    await db.exec(`insert into public.accounts values('${fresh}'); insert into public.sites values('${fresh}','${fresh}','{}');
      select public.atomic_ad_wallet_credit_v2('${fresh}','pi_new',500);
      select public.set_ad_lifecycle_state('${fresh}','paused',null,null);`);
    const row=await db.query<{balance:number}>(`select (content->'adCampaign'->>'walletBalanceCents')::int balance from public.sites where id='${fresh}'`);
    expect(row.rows[0].balance).toBe(500);
    await expect(db.query(`select public.set_ad_lifecycle_state('${fresh}','active',null,'wrong')`)).rejects.toThrow(/resources changed/);
  });
});
