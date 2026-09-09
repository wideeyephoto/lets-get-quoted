// Disposable PostgreSQL 17 regression for refunds. No network or credentials.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import os, { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { os.userInfo(); } catch (error) {
  if (error?.code !== 'ERR_SYSTEM_ERROR') throw error;
  os.userInfo = () => ({ uid: -1, gid: -1, username: process.env.USERNAME || 'windows-user', homedir: process.env.USERPROFILE || '', shell: null });
  syncBuiltinESMExports();
}
const platform = process.platform === 'win32' ? 'windows-x64' : process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64';
const bin = join(root, 'node_modules/@embedded-postgres', platform, 'native/bin');
process.env.PATH = `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`;
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dir = mkdtempSync(join(tmpdir(), 'lgq-addon-refunds-'));
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port: 54391, persistent: false, onLog: () => {}, onError: () => {} });
const read = name => readFileSync(join(root, 'migrations', name), 'utf8').replace(/\r\n/g, '\n');
const ledger = read('20260815213142_pricing_entitlements.sql');
function table(name) { const s = ledger.indexOf(`create table if not exists public.${name} (`); assert(s >= 0); return ledger.slice(s, ledger.indexOf('\n);', s) + 3); }
function fn(name, source = ledger) { const s = source.indexOf(`create or replace function public.${name}(`); assert(s >= 0); const tag = source.slice(s).match(/\nas (\$\w*\$)\n/); assert(tag); return source.slice(s, source.indexOf(`\n${tag[1]};`, s + tag.index + tag[0].length) + tag[1].length + 2); }
let db;
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase('refunds'); db = pg.getPgClient('refunds'); await db.connect();
  const q = (sql, args) => db.query(sql, args);
  const one = async (sql, args) => (await q(sql, args)).rows[0];
  await q(`create role anon; create role authenticated; create role service_role bypassrls;
    create table accounts(id uuid primary key); create table billing_events(id uuid primary key,account_id uuid);
    create function is_owner(uuid) returns boolean language sql as $$select false$$;
    -- Only the immutable purchase attribution columns read by this migration.
    create table billing_top_up_purchase_operations(account_id uuid,livemode boolean,provider_object_id text,state text,
      top_up_id text,stripe_price_id text,resource_code text,units bigint);`);
  for (const name of ['workspace_entitlements','usage_credit_lots','usage_reservations','usage_reservation_allocations']) await q(table(name));
  for (const name of ['grant_usage_credits','reserve_usage_credits','commit_usage_reservation','release_usage_reservation']) await q(fn(name));
  await q(fn('reserve_usage_credits', read('20260904160000_credits_never_expire.sql')));
  await q(read('20260818210000_workspace_purchased_capacity.sql'));
  const voiceAllowance = read('20260819190000_voice_minute_allowance.sql');
  const skuStart = voiceAllowance.indexOf('alter table public.workspace_purchased_capacity');
  const skuEnd = voiceAllowance.indexOf(';', voiceAllowance.indexOf('add constraint workspace_purchased_capacity_top_up_id_check', skuStart)) + 1;
  assert(skuStart > 0 && skuEnd > skuStart);
  await q(voiceAllowance.slice(skuStart, skuEnd));
  // Install the real expanded catalog constraint without the unrelated canary
  // backfill and telephony triggers from that migration.
  const voiceCatalog = read('20260904190000_unify_voice_settings_and_forwarding_triggers.sql');
  const catalogStart = voiceCatalog.indexOf('alter table public.workspace_purchased_capacity');
  const catalogEnd = voiceCatalog.indexOf('-- 2. Provision');
  assert(catalogStart > 0 && catalogEnd > catalogStart);
  await q(voiceCatalog.slice(catalogStart, catalogEnd));
  await q(read('20260819020000_purchased_capacity_lifecycle.sql'));
  await q('grant select on workspace_entitlements,usage_credit_lots,billing_top_up_purchase_operations,workspace_purchased_capacity to service_role');
  await q(read('20260908175533_addon_refund_reversal_and_future_credit_debt.sql'));
  await q(fn('voice_minute_lot_tail', voiceAllowance));
  await q(fn('grant_voice_minute_allowance', read('20260820110000_voice_allowance_survives_a_moved_period.sql')));
  await q(read('20260909211000_paid_voice_invoice_allowance.sql'));
  const account = '11111111-1111-4111-8111-111111111111';
  await q('insert into accounts values($1)', [account]);
  await q("insert into workspace_entitlements(account_id,plan_code,billing_interval,billing_status,entitlement_state,catalog_version,platform_fee_bps) values($1,'flex','none','free','active','fixture',0)", [account]);
  await q("insert into billing_top_up_purchase_operations values($1,false,'cs_test_pack','checkout_created','voice_minutes_100','price_Pack12345678','voice_minutes',100)", [account]);
  const pack = (await one("select grant_usage_credits($1,'voice_minutes',100,'purchase','pack',null,null,null,null,'{\"lgq_checkout_session_id\":\"cs_test_pack\"}') id", [account])).id;
  await q('set role service_role');
  const ingest = event => one("select ingest_addon_refund_event(false,$1,'ch_Pack12345678',repeat('a',64)) inserted", [event]);
  assert.equal((await ingest('evt_Pack1')).inserted,true); assert.equal((await ingest('evt_Pack1')).inserted,false); pass('duplicate receipt does not enqueue twice');
  const job = await one('select * from claim_addon_refund_job(false)');
  const contract = { account_id:account,checkout_session_id:'cs_test_pack',subscription_id:null,invoice_id:null,top_up_id:'voice_minutes_100',price_id:'price_Pack12345678',charge_amount:3500,refunded_amount:1750,period_start:null,period_end:null };
  const apply = async amount => (await one('select apply_addon_refund($1,$2,$3) r',[job.id,job.claim_token,{...contract,refunded_amount:amount}])).r;
  assert.equal((await apply(1750)).reversed_units,50); assert.equal((await apply(1750)).reversed_units,50); assert.equal((await apply(875)).reversed_units,50); pass('partial, duplicate and stale refunds retain cumulative high-water mark');
  const used = (await one("select reserve_usage_credits($1,'voice_minutes',25,'used','usage') id",[account])).id;
  await q("select commit_usage_reservation($1,'commit')",[used]);
  const hold = (await one("select reserve_usage_credits($1,'voice_minutes',15,'held','usage') id",[account])).id;
  assert.equal((await apply(3500)).debt_remaining,40); pass('full refund protects consumed and reserved minutes and records debt');
  const future = (await one("select grant_usage_credits($1,'voice_minutes',30,'adjustment','future') id",[account])).id;
  assert.equal(Number((await one('select revoked_units from usage_credit_lots where id=$1',[future])).revoked_units),30); pass('new grant offsets debt before it is spendable');
  await q("select release_usage_reservation($1,'release')",[hold]);
  const balance = await one('select consumed_units,reserved_units,revoked_units from usage_credit_lots where id=$1',[pack]);
  assert.deepEqual(balance,{consumed_units:'25',reserved_units:'0',revoked_units:'70'});
  assert.equal(Number((await one('select debt_remaining from addon_refund_reversals')).debt_remaining),0); pass('released hold offsets remaining debt without losing excess credit');
  await ingest('evt_Pack2');await q("select finish_addon_refund_job($1,$2,'complete')",[job.id,job.claim_token]);
  assert.equal((await one('select state from addon_refund_jobs')).state,'pending');pass('receipt arriving during processing survives finish');
  const replay = await one('select * from claim_addon_refund_job(false)'); await q("select finish_addon_refund_job($1,$2,'complete')",[replay.id,replay.claim_token]);
  for (const [sku,resource,units] of [['storage_100gb','storage_gb',100],['office_user','office_users',1]]) {
    await q('reset role');const sub = 'sub_'+sku.replaceAll('_','')+'12345678', session = 'cs_test_'+sku, charge = 'ch_'+sku.replaceAll('_','');
    await q("insert into billing_top_up_purchase_operations values($1,false,$2,'checkout_created',$3,'price_Capacity12345678',$4,$5)",[account,session,sku,resource,units]);
    await q("insert into workspace_purchased_capacity(account_id,top_up_id,resource_code,units,unit_amount_cents,catalog_version,livemode,stripe_subscription_id,current_period_end) values($1,$2,$3,$4,1500,'2026-08-18-preview',false,$5,'2026-10-08')",[account,sku,resource,units,sub]);
    await q('set role service_role');await q("select ingest_addon_refund_event(false,$1,$2,repeat('b',64))",['evt_'+sku.replaceAll('_',''),charge]);
    const capJob = await one('select * from claim_addon_refund_job(false)');
    const capContract = {...contract,checkout_session_id:session,subscription_id:sub,invoice_id:'in_Capacity12345678',top_up_id:sku,price_id:'price_Capacity12345678',charge_amount:1500,refunded_amount:750,period_start:'2026-09-08',period_end:'2026-10-08'};
    await q('select apply_addon_refund($1,$2,$3)',[capJob.id,capJob.claim_token,capContract]);
    const remaining = async () => Number((await one('select workspace_purchased_capacity_units($1,$2) n',[account,resource])).n);
    assert.equal(await remaining(),units-Math.floor(units/2));pass(`${sku}: partial refund removes whole proportional units`);
    await q("select apply_purchased_capacity_provider_state(false,$1,'active','2026-11-08')",[sub]);assert.equal(await remaining(),units);pass(`${sku}: next service period restores subscribed quantity`);
    await q('select apply_addon_refund($1,$2,$3)',[capJob.id,capJob.claim_token,{...capContract,refunded_amount:1500}]);
    assert.equal(await remaining(),0);assert.equal((await one('select status from workspace_purchased_capacity where stripe_subscription_id=$1',[sub])).status,'canceled');pass(`${sku}: historical full refund cancels capacity`);
    await q("select finish_addon_refund_job($1,$2,'complete')",[capJob.id,capJob.claim_token]);
  }
  for (const [index, sku, units, price] of [[2,'ai_voice_flex',100,6900],[3,'ai_voice_solo',100,5900],[4,'ai_voice_growth',200,5500]]) {
    await q('reset role');
    const owner = `11111111-1111-4111-8111-11111111111${index}`;
    const session = 'cs_test_'+sku, sub = 'sub_'+sku.replaceAll('_','')+'12345678';
    await q('insert into accounts values($1)', [owner]);
    await q("insert into workspace_entitlements(account_id,plan_code,billing_interval,billing_status,entitlement_state,catalog_version,platform_fee_bps) values($1,'flex','none','free','active','fixture',0)", [owner]);
    await q("insert into billing_top_up_purchase_operations values($1,false,$2,'checkout_created',$3,'price_Voice12345678','voice_minutes',$4)",[owner,session,sku,units]);
    await q("insert into workspace_purchased_capacity(account_id,top_up_id,resource_code,units,unit_amount_cents,catalog_version,livemode,stripe_subscription_id,current_period_end) values($1,$2,'voice_minutes',$3,$4,'2026-08-18-preview',false,$5,'2026-10-08')",[owner,sku,units,price,sub]);
    await q("update workspace_purchased_capacity set metadata=metadata||'{\"voice_allowance_basis\":\"legacy_base_period\"}' where stripe_subscription_id=$1",[sub]);
    await q('set role service_role');
    await q("select ingest_addon_refund_event(false,$1,$2,repeat('c',64))",['evt_'+sku.replaceAll('_',''),'ch_'+sku.replaceAll('_','')]);
    const voiceJob = await one('select * from claim_addon_refund_job(false)');
    const voiceContract = {...contract,account_id:owner,checkout_session_id:session,subscription_id:sub,invoice_id:'in_Voice12345678',top_up_id:sku,price_id:'price_Voice12345678',charge_amount:price,refunded_amount:price/2,period_start:'2026-09-08',period_end:'2026-10-08'};
    const voiceApply = amount => one('select apply_addon_refund($1,$2,$3) result',[voiceJob.id,voiceJob.claim_token,{...voiceContract,refunded_amount:amount}]);
    await assert.rejects(voiceApply(price/2), /refund_credit_grant_not_resolved/);
    assert.equal(Number((await one('select count(*) n from addon_refund_reversals where account_id=$1',[owner])).n),0);
    pass(`${sku}: refund before fulfillment rolls back for retry`);
    const lot = (await one("select grant_usage_credits($1,'voice_minutes',$2,'voice_addon',$3,null,null,null,null,$4) id",[owner,units,'allowance-'+sku,{period_start:'2026-09-08',period_end:'2026-10-08',purchased_minutes:units}])).id;
    assert.equal((await voiceApply(price/2)).result.reversed_units,units/2);
    assert.equal((await voiceApply(price/2)).result.reversed_units,units/2);
    assert.equal(Number((await one('select revoked_units from usage_credit_lots where id=$1',[lot])).revoked_units),units/2);
    pass(`${sku}: retry after fulfillment and duplicate partial debit exactly once`);
    await q('reset role');
    await q("update workspace_entitlements set plan_code='scale',billing_interval='monthly',billing_status='active' where account_id=$1",[owner]);
    await q('set role service_role');
    assert.equal((await voiceApply(price)).result.cancel_subscription,sub);
    assert.equal(Number((await one('select revoked_units from usage_credit_lots where id=$1',[lot])).revoked_units),units);
    assert.equal((await one('select status from workspace_purchased_capacity where stripe_subscription_id=$1',[sub])).status,'canceled');
    assert.equal((await voiceApply(price/2)).result.reversed_units,units);
    pass(`${sku}: base-plan change preserves original refund attribution; stale partial cannot restore capacity or minutes`);
    // Model a crash after the money-side reversal but before provider cancellation.
    await q('reset role');
    await q("update addon_refund_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[voiceJob.id]);
    await q('set role service_role');
    const successor = await one('select * from claim_addon_refund_job(false)');
    assert.notEqual(successor.claim_token,voiceJob.claim_token);
    await assert.rejects(voiceApply(price), /refund_claim_lost/);
    assert.equal((await one("select finish_addon_refund_job($1,$2,'complete') ok",[voiceJob.id,voiceJob.claim_token])).ok,false);
    const retried = await one('select apply_addon_refund($1,$2,$3) result',[successor.id,successor.claim_token,{...voiceContract,refunded_amount:price}]);
    assert.equal(retried.result.cancel_subscription,sub);
    assert.equal(Number((await one('select revoked_units from usage_credit_lots where id=$1',[lot])).revoked_units),units);
    await q("select finish_addon_refund_job($1,$2,'complete')",[successor.id,successor.claim_token]);
    pass(`${sku}: lease recovery repeats cancellation intent without another debit`);
  }
  for (const [index,sku,units,price] of [[7,'ai_voice_flex',100,6900],[8,'ai_voice_solo',100,5900],[9,'ai_voice_growth',200,5500]]) {
    await q('reset role');
    const owner=`11111111-1111-4111-8111-11111111111${index}`, sub='sub_paidvoice'+index+'12345678', session='cs_test_paidvoice'+index;
    await q('insert into accounts values($1)',[owner]);
    await q("insert into workspace_entitlements(account_id,plan_code,billing_interval,billing_status,entitlement_state,catalog_version,platform_fee_bps,feature_limits) values($1,'scale','monthly','active','active','fixture',0,'{\"voice_included_minutes\":100}')",[owner]);
    await q("select grant_voice_minute_allowance($1,'2026-08-23','2026-09-23')",[owner]);
    const original=await one("select id from usage_credit_lots where account_id=$1",[owner]);
    await q("insert into billing_top_up_purchase_operations values($1,false,$2,'checkout_created',$3,'price_PaidVoice12345678','voice_minutes',$4)",[owner,session,sku,units]);
    await q("insert into workspace_purchased_capacity(account_id,top_up_id,resource_code,units,unit_amount_cents,catalog_version,livemode,stripe_subscription_id,current_period_end,metadata) values($1,$2,'voice_minutes',$3,$4,'2026-08-18-preview',false,$5,'2026-10-09',$6)",[owner,sku,units,price,sub,{lgq_checkout_session_id:session}]);
    const paid={account_id:owner,checkout_session_id:session,subscription_id:sub,invoice_id:'in_PaidVoice'+index,top_up_id:sku,price_id:'price_PaidVoice12345678',charge_amount:price,refunded_amount:0,period_start:'2026-09-09',period_end:'2026-10-09'};
    await q('set role service_role');
    await q("select ingest_addon_refund_event(false,$1,$2,repeat('f',64))",['evt_PaidVoice'+index,'ch_PaidVoice'+index]);
    const refundJob=await one('select * from claim_addon_refund_job(false)');
    await assert.rejects(q('select apply_addon_refund($1,$2,$3)',[refundJob.id,refundJob.claim_token,{...paid,refunded_amount:price}]),/refund_credit_grant_not_resolved/);
    pass(`${sku}: refund before invoice fulfillment cannot fall back to the pre-existing allowance`);
    const grant=async c=>(await one('select grant_paid_voice_addon_period(false,$1) id',[c])).id;
    const invoiceLot=await grant(paid);
    assert.equal(await grant(paid),invoiceLot);
    assert.equal(Number((await one('select granted_units from usage_credit_lots where id=$1',[invoiceLot])).granted_units),units);
    assert.equal(Number((await one("select grant_voice_minute_allowance($1,'2026-08-23','2026-09-23') n",[owner])).n),0);
    pass(`${sku}: an existing allowance cannot swallow a paid invoice grant; replay grants once`);
    assert.equal(Number((await one("select grant_voice_minute_allowance($1,'2026-09-23','2026-10-23') n",[owner])).n),100);
    pass(`${sku}: next base-plan period grants only its inclusion, without duplicating paid add-on minutes`);
    await assert.rejects(grant({...paid,period_start:'2026-09-10'}),/paid_voice_invoice_identity_conflict/);
    await assert.rejects(grant({...paid,checkout_session_id:'cs_test_unrelated'}),/query returned no rows/);
    await q("select apply_purchased_capacity_provider_state(false,$1,'active','2026-11-09')",[sub]);
    const renewed={...paid,invoice_id:'in_RenewedVoice'+index,period_start:'2026-10-09',period_end:'2026-11-09'};
    const renewalLot=await grant(renewed);
    assert.notEqual(renewalLot,invoiceLot);
    assert.equal(await grant(renewed),renewalLot);
    pass(`${sku}: a distinct paid invoice grants its next period once despite overlapping base periods`);
    await q('select apply_addon_refund($1,$2,$3)',[refundJob.id,refundJob.claim_token,{...paid,refunded_amount:price}]);
    assert.equal(Number((await one('select revoked_units from usage_credit_lots where id=$1',[invoiceLot])).revoked_units),units);
    assert.equal(Number((await one('select revoked_units from usage_credit_lots where id=$1',[renewalLot])).revoked_units),0);
    assert.equal(Number((await one('select revoked_units from usage_credit_lots where id=$1',[original.id])).revoked_units),0);
    await q("select finish_addon_refund_job($1,$2,'complete')",[refundJob.id,refundJob.claim_token]);
    pass(`${sku}: refund touches its exact invoice lot and preserves the legacy and renewal lots`);
  }
  await assert.rejects(q("select ingest_addon_refund_event(false,'evt_Pack1','ch_Pack12345678',repeat('d',64))"), /refund_event_identity_conflict/);
  pass('same event ID with different payload is rejected');
  await q("select ingest_addon_refund_event(true,'evt_LiveModeOnly','ch_LiveModeOnly',repeat('e',64))");
  assert.equal((await q('select * from claim_addon_refund_job(false)')).rows.length,0);
  pass('test worker cannot claim a live-mode refund');
  for (const role of ['anon','authenticated']) {
    await q('reset role'); await q(`set role ${role}`);
    await assert.rejects(q('select * from addon_refund_reversals'), /permission denied/);
    await assert.rejects(q('select * from claim_addon_refund_job(false)'), /permission denied/);
    await assert.rejects(q("select grant_paid_voice_addon_period(false,'{}')"), /permission denied/);
    pass(`${role}: no ledger reads or refund execution`);
  }
  console.log(`${checks}/${checks} PostgreSQL refund checks passed`);
} finally {
  await db?.end();
  let stopped = false;
  try { await promisify(execFile)(join(bin,process.platform==='win32'?'pg_ctl.exe':'pg_ctl'),['stop','-D',dir,'-m','fast','-w','-t','8'],{windowsHide:true,timeout:10000});stopped=true; }
  finally { if(stopped && dirname(resolve(dir))===resolve(tmpdir()) && basename(dir).startsWith('lgq-addon-refunds-'))rmSync(dir,{recursive:true,force:true}); }
}
