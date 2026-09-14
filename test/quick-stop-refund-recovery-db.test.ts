import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SupabaseLegacyQuickStopPaymentStore } from '@/lib/billing/legacy-quick-stop-payment-store';

const ACCOUNT = '10000000-0000-4000-8000-000000000001';
const REQUEST = '20000000-0000-4000-8000-000000000001';
const PAYMENT = '30000000-0000-4000-8000-000000000001';
const JOB = '40000000-0000-4000-8000-000000000001';
let db: PGlite;
async function row(sql: string, args: unknown[] = []) { return (await db.query<Record<string, any>>(sql, args)).rows[0]; }
const cancel = (kind = 'customer_cancel', expected = 'confirmed', pct = 75, reporting = false) => row(
  'select cancel_quick_stop_request($1,$2,$3,$4,$5,$6,$7) as claimed',
  [ACCOUNT, REQUEST, expected, kind, pct, 'Test resolution', reporting],
);
describe('Quick Stop cancellation and refund SQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table accounts(id uuid primary key,timezone text,extra_stop_locked_until timestamptz,extra_stop_lock_reason text);
      create table jobs(id uuid primary key,account_id uuid,status text);
      create table payments(id uuid primary key,account_id uuid,job_id uuid,kind text default 'deposit',
        status text,paid_at timestamptz,stripe_payment_intent text,charge_model text default 'destination',
        amount numeric,platform_fee numeric default 1,refunded_amount numeric default 0,
        platform_fee_refunded numeric default 0,refunded_at timestamptz);
      create table extra_stop_requests(id uuid primary key,account_id uuid,job_id uuid,payment_id uuid,
        status text,fee_cents integer,refund_cents integer default 0,paid_at timestamptz,arrived_at timestamptz,
        arrival_date date,arrival_start time,arrival_end time,canceled_at timestamptz,cancel_reason text,
        no_show_confirmed_at timestamptz,no_show_reported_at timestamptz,updated_at timestamptz);
      create table extra_stop_events(id uuid default gen_random_uuid(),account_id uuid,request_id uuid,
        actor text,from_status text,to_status text,meta jsonb,dedupe_key text);
      create unique index on extra_stop_events(request_id,dedupe_key) where dedupe_key is not null;
    `);
    const windowMigration = readFileSync(join(process.cwd(), 'migrations/20260914132825_quick_stop_atomic_sweep.sql'), 'utf8');
    const helperStart = windowMigration.indexOf('create or replace function public.quick_stop_window_instant');
    const helperEnd = windowMigration.indexOf('$$;', helperStart) + 3;
    await db.exec(windowMigration.slice(helperStart, helperEnd));
    await db.exec(readFileSync(join(process.cwd(), 'migrations/20260914132411_quick_stop_refund_recovery.sql'), 'utf8'));
    await db.exec(readFileSync(join(process.cwd(), 'migrations/20260914134359_quick_stop_no_show_lock.sql'), 'utf8'));
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec('drop table if exists public.quick_stop_payment_tasks');
    await db.exec('truncate quick_stop_refund_tasks,extra_stop_requests,payments,jobs,accounts,extra_stop_events cascade');
    await db.query('insert into accounts(id,timezone) values($1,$2)', [ACCOUNT, 'America/New_York']);
    await db.query('insert into jobs values($1,$2,$3)', [JOB, ACCOUNT, 'in_progress']);
    await db.query(`insert into payments(id,account_id,job_id,status,paid_at,stripe_payment_intent,amount)
      values($1,$2,$3,'paid',now()-interval '30 minutes','pi_test',100)`, [PAYMENT, ACCOUNT, JOB]);
    await db.query(`insert into extra_stop_requests(id,account_id,job_id,payment_id,status,fee_cents,paid_at,
      arrival_date,arrival_start,arrival_end) values($1,$2,$3,$4,'confirmed',10000,now()-interval '30 minutes',
      (now() at time zone 'America/New_York')::date-1,'13:00','15:00')`, [REQUEST, ACCOUNT, JOB, PAYMENT]);
  });
  it('atomically archives the appointment and preserves a partial refund obligation', async () => {
    expect(await cancel()).toEqual({ claimed: true });
    expect(await row('select status,refund_due_cents,refund_cents,refund_state from extra_stop_requests')).toEqual({
      status: 'customer_canceled', refund_due_cents: 7500, refund_cents: 0, refund_state: 'pending',
    });
    expect(await row('select status from jobs')).toEqual({ status: 'archived' });
    expect(await row('select target_cents,state from quick_stop_refund_tasks')).toEqual({ target_cents: 7500, state: 'pending' });
  });
  it('repeated resolution does not move money again or reset its evidence', async () => {
    await cancel();
    await db.exec('update extra_stop_requests set refund_cents=7500,refund_state=\'completed\'');
    expect(await cancel('customer_cancel', 'customer_canceled')).toEqual({ claimed: false });
    expect(await row('select refund_cents from extra_stop_requests')).toEqual({ refund_cents: 7500 });
    expect(await row('select count(*)::integer n from quick_stop_refund_tasks')).toEqual({ n: 1 });
  });
  it('a lost status CAS has no financial or calendar effects', async () => {
    expect(await cancel('customer_cancel', 'en_route')).toEqual({ claimed: false });
    expect(await row('select count(*)::integer n from quick_stop_refund_tasks')).toEqual({ n: 0 });
    expect(await row('select status from jobs')).toEqual({ status: 'in_progress' });
  });
  it.each(['contractor_declined', 'offer_expired', 'contractor_canceled', 'refunded'])('rejects no-show adjudication from %s', async (status) => {
    await db.query('update extra_stop_requests set status=$1', [status]);
    await expect(cancel('no_show', status, 100)).rejects.toThrow('cannot be canceled');
    expect(await row('select count(*)::integer n from quick_stop_refund_tasks')).toEqual({ n: 0 });
  });
  it('rejects no-show without captured-payment evidence', async () => {
    await db.exec('update payments set status=\'requested\',paid_at=null');
    await expect(cancel('no_show', 'confirmed', 100)).rejects.toThrow('paid scheduled visit');
  });
  it('permits staff post-completion adjudication after the customer deadline', async () => {
    await db.exec('update extra_stop_requests set status=\'completed\'');
    expect(await cancel('no_show', 'completed', 100)).toEqual({ claimed: true });
    expect((await row('select result from quick_stop_no_show_enforcements')).result).toMatchObject({tier:1,changed:true,priorNoShows:0});
    expect((await row('select extra_stop_locked_until is not null as locked from accounts')).locked).toBe(true);
  });
  it('rolls back cancellation, refund intent and job archival if enforcement cannot be preserved', async () => {
    await db.exec(`create function reject_enforcement() returns trigger language plpgsql as $$ begin raise exception 'enforcement unavailable'; end $$;
      create trigger reject_enforcement before insert on quick_stop_no_show_enforcements for each row execute function reject_enforcement();`);
    try {
      await expect(cancel('no_show','confirmed',100)).rejects.toThrow('enforcement unavailable');
      expect(await row('select status,no_show_confirmed_at from extra_stop_requests')).toEqual({status:'confirmed',no_show_confirmed_at:null});
      expect(await row('select status from jobs')).toEqual({status:'in_progress'});
      expect(await row('select count(*)::integer n from quick_stop_refund_tasks')).toEqual({n:0});
      expect(await row('select extra_stop_locked_until from accounts')).toEqual({extra_stop_locked_until:null});
    } finally {
      await db.exec('drop trigger reject_enforcement on quick_stop_no_show_enforcements; drop function reject_enforcement()');
    }
  });
  it('customer no-show must be after the actual end and within two hours', async () => {
    await expect(cancel('no_show', 'confirmed', 100, true)).rejects.toThrow('reporting window');
    await db.exec('update extra_stop_requests set arrival_date=arrival_date+2');
    await expect(cancel('no_show', 'confirmed', 100, false)).rejects.toThrow('reporting window');
  });
  it('creates an obligation before settlement and claims it only after payment arrives', async () => {
    await db.exec("update payments set status='requested',paid_at=null; update extra_stop_requests set status='awaiting_customer_payment',paid_at=null");
    await cancel('customer_cancel', 'awaiting_customer_payment', 100);
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toEqual([]);
    await db.exec("update payments set status='paid',paid_at=now()");
    const result = await row('select * from reconcile_legacy_quick_stop_payment($1)', [PAYMENT]);
    expect(result.reconcile_status).toBe('refund_queued');
    expect(await row('select target_cents from quick_stop_refund_tasks')).toEqual({ target_cents: 10000 });
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toHaveLength(1);
  });
  it('late webhook replay preserves partial and zero-tier cancellation decisions', async () => {
    await cancel();
    await row('select * from reconcile_legacy_quick_stop_payment($1)', [PAYMENT]);
    expect(await row('select target_cents from quick_stop_refund_tasks')).toEqual({ target_cents: 7500 });
    await db.exec("delete from quick_stop_refund_tasks; update extra_stop_requests set refund_due_cents=0,refund_state='none'");
    expect((await row('select * from reconcile_legacy_quick_stop_payment($1)', [PAYMENT])).reconcile_status).toBe('not_actionable');
    expect(await row('select count(*)::integer n from quick_stop_refund_tasks')).toEqual({ n: 0 });
  });
  it('leases work once and refuses changed amount or a stale lease snapshot', async () => {
    await cancel();
    const claim = await row('select * from claim_quick_stop_refunds()');
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toEqual([]);
    expect((await db.query('select * from prepare_quick_stop_refund($1,$2,$3,$4)', [claim.id, claim.lease_token, 'pi_test', 7500])).rows).toHaveLength(1);
    expect((await db.query('select * from prepare_quick_stop_refund($1,$2,$3,$4)', [claim.id, claim.lease_token, 'pi_test', 5000])).rows).toEqual([]);
    await row('select finish_quick_stop_refund($1,$2,$3,$4,$5)', [claim.id, claim.lease_token, 'retry', 0, 'unknown']);
    expect((await db.query('select * from prepare_quick_stop_refund($1,$2,$3,$4)', [claim.id, claim.lease_token, 'pi_test', 7500])).rows).toEqual([]);
  });
  it('completion reconciles confirmed money while retaining the canceled booking', async () => {
    await cancel();
    const claim = await row('select * from claim_quick_stop_refunds()');
    await expect(row('select finish_quick_stop_refund($1,$2,$3,$4)', [claim.id,claim.lease_token,'completed',7000])).rejects.toThrow('exact provider evidence');
    await row('select finish_quick_stop_refund($1,$2,$3,$4)', [claim.id,claim.lease_token,'completed',7500]);
    expect(await row('select refund_state,refund_cents,status from extra_stop_requests')).toEqual({ refund_state:'completed',refund_cents:7500,status:'customer_canceled' });
    expect(await row('select refunded_amount::float8 refunded from payments')).toEqual({ refunded:75 });
    const rpc = async () => ({ data: (await db.query('select * from reconcile_legacy_quick_stop_payment($1)', [PAYMENT])).rows, error: null });
    const store = new SupabaseLegacyQuickStopPaymentStore({ rpc } as never);
    await expect(store.reconcile(PAYMENT)).resolves.toMatchObject({ status:'refund_reconciled', taskId:null });
  });
  it('confirmation activates request and job atomically and cannot reactivate cancellation', async () => {
    await db.exec("update extra_stop_requests set status='awaiting_customer_payment',paid_at=null; update jobs set status='new_lead'");
    expect((await db.query('select * from confirm_quick_stop_payment($1)', [PAYMENT])).rows).toHaveLength(1);
    expect(await row('select status from jobs')).toEqual({ status:'in_progress' });
    await cancel();
    expect((await db.query('select * from confirm_quick_stop_payment($1)', [PAYMENT])).rows).toEqual([]);
    expect(await row('select status from jobs')).toEqual({ status:'archived' });
  });
  it('holds automatic refund while an earlier manual request is in flight', async () => {
    const manual = await row('select begin_quick_stop_manual_refund($1,$2,$3) token', [ACCOUNT,PAYMENT,2500]);
    await cancel();
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toEqual([]);
    // The manual refund succeeds; the automatic obligation may now refund only
    // its remaining cumulative target (covered by provider worker unit test).
    await db.exec('update payments set refunded_amount=25');
    await row('select finish_quick_stop_manual_refund($1,$2,$3,true)', [ACCOUNT,PAYMENT,manual.token]);
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toHaveLength(1);
    expect(await row('select refund_cents,refund_due_cents from extra_stop_requests')).toEqual({ refund_cents:2500,refund_due_cents:7500 });
  });
  it('rejects a manual reservation after the automatic obligation was queued', async () => {
    await cancel();
    await expect(row('select begin_quick_stop_manual_refund($1,$2,$3)', [ACCOUNT,PAYMENT,2500])).rejects.toThrow('refund in progress');
  });
  it('rejects a stale second manual refund snapshot after the first one completes', async () => {
    const first = await row('select begin_quick_stop_manual_refund($1,$2,$3,$4) token', [ACCOUNT,PAYMENT,2500,0]);
    await db.exec('update payments set refunded_amount=25');
    await row('select finish_quick_stop_manual_refund($1,$2,$3,true)', [ACCOUNT,PAYMENT,first.token]);
    await expect(row('select begin_quick_stop_manual_refund($1,$2,$3,$4)', [ACCOUNT,PAYMENT,5000,0])).rejects.toThrow('payment changed');
    expect(await row('select count(*)::integer n from quick_stop_manual_refund_reservations')).toEqual({ n:0 });
    // A refreshed request can explicitly refund another $25 toward a $50 total.
    expect((await row('select begin_quick_stop_manual_refund($1,$2,$3,$4) token', [ACCOUNT,PAYMENT,5000,2500])).token).toBeTruthy();
  });
  it.each([['refunded','destination'],['paid','direct'],['paid',null]])('checks current paid status and destination rail before reserving (%s/%s)', async (status,rail) => {
    await db.query('update payments set status=$1,charge_model=$2', [status,rail]);
    await expect(row('select begin_quick_stop_manual_refund($1,$2,$3,$4)', [ACCOUNT,PAYMENT,2500,0])).rejects.toThrow('payment changed');
  });
  it('unknown manual results remain reserved until provider proof meets the target', async () => {
    const manual = await row('select begin_quick_stop_manual_refund($1,$2,$3) token', [ACCOUNT,PAYMENT,2500]);
    await row('select finish_quick_stop_manual_refund($1,$2,$3,false)', [ACCOUNT,PAYMENT,manual.token]);
    expect(await row('select refund_state from extra_stop_requests')).toEqual({ refund_state:'review' });
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toEqual([]);
    const review = await row('select * from claim_quick_stop_refund_review($1,$2)', [ACCOUNT,REQUEST]);
    await row('select finish_quick_stop_refund($1,$2,$3,$4)', [review.id,review.lease_token,'completed',2500]);
    expect(await row('select count(*)::integer n from quick_stop_manual_refund_reservations')).toEqual({ n:0 });
  });
  it('does not report release success when local refund evidence is still missing', async () => {
    const manual = await row('select begin_quick_stop_manual_refund($1,$2,$3,$4) token', [ACCOUNT,PAYMENT,2500,0]);
    expect(await row('select finish_quick_stop_manual_refund($1,$2,$3,true) released', [ACCOUNT,PAYMENT,manual.token])).toEqual({ released:false });
    expect(await row('select state from quick_stop_manual_refund_reservations')).toEqual({ state:'unknown' });
    expect(await row('select refund_state from extra_stop_requests')).toEqual({ refund_state:'review' });
  });
  it('surfaces a crashed manual reservation for read-only staff reconciliation', async () => {
    await row('select begin_quick_stop_manual_refund($1,$2,$3)', [ACCOUNT,PAYMENT,2500]);
    await db.exec("update quick_stop_manual_refund_reservations set created_at=now()-interval '10 minutes'");
    await db.query('select * from claim_quick_stop_refunds()');
    expect(await row('select refund_state from extra_stop_requests')).toEqual({ refund_state:'review' });
  });
  it('preserves an increased cancellation obligation after an earlier manual reconciliation', async () => {
    const manual = await row('select begin_quick_stop_manual_refund($1,$2,$3) token', [ACCOUNT,PAYMENT,2500]);
    await row('select finish_quick_stop_manual_refund($1,$2,$3,false)', [ACCOUNT,PAYMENT,manual.token]);
    const review = await row('select * from claim_quick_stop_refund_review($1,$2)', [ACCOUNT,REQUEST]);
    await row('select finish_quick_stop_refund($1,$2,$3,$4)', [review.id,review.lease_token,'completed',2500]);
    await cancel();
    expect(await row('select target_cents,state,last_error from quick_stop_refund_tasks')).toEqual({
      target_cents:7500,state:'review',last_error:'refund_obligation_increased',
    });
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toEqual([]);
  });
  it('only staff service role can claim or mutate the queue', async () => {
    for (const name of ['anon', 'authenticated']) {
      expect((await row('select has_function_privilege($1,$2,$3) allowed', [name,'public.claim_quick_stop_refunds(integer,uuid,uuid)','execute'])).allowed).toBe(false);
      expect((await row('select has_table_privilege($1,$2,$3) allowed', [name,'public.quick_stop_refund_tasks','update'])).allowed).toBe(false);
    }
  });
  it.each(['ready','leased','retry_wait','dead_letter'])('quarantines retained legacy %s tasks without sending another refund', async (state) => {
    await db.exec('create table quick_stop_payment_tasks(payment_id uuid,task_state text)');
    await db.query('insert into quick_stop_payment_tasks values($1,$2)', [PAYMENT,state]);
    await expect(row('select begin_quick_stop_manual_refund($1,$2,$3,$4)', [ACCOUNT,PAYMENT,2500,0])).rejects.toThrow('earlier Quick Stop refund');
    await cancel();
    expect(await row('select state,last_error from quick_stop_refund_tasks')).toEqual({ state:'review',last_error:'legacy_refund_unresolved' });
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toEqual([]);
    // Staff can still observe provider truth without creating a new operation.
    expect((await db.query('select * from claim_quick_stop_refund_review($1,$2)', [ACCOUNT,REQUEST])).rows).toHaveLength(1);
  });
  it('blocks a claimed task at prepare if an unresolved legacy task is found', async () => {
    await cancel();
    const claim = await row('select * from claim_quick_stop_refunds()');
    await db.exec('create table quick_stop_payment_tasks(payment_id uuid,task_state text)');
    await db.query('insert into quick_stop_payment_tasks values($1,$2)', [PAYMENT,'leased']);
    expect((await db.query('select * from prepare_quick_stop_refund($1,$2,$3,$4)', [claim.id,claim.lease_token,'pi_test',7500])).rows).toEqual([]);
  });
  it('does not block new recovery for a completed legacy task', async () => {
    await db.exec('create table quick_stop_payment_tasks(payment_id uuid,task_state text)');
    await db.query('insert into quick_stop_payment_tasks values($1,$2)', [PAYMENT,'completed']);
    await cancel();
    expect((await db.query('select * from claim_quick_stop_refunds()')).rows).toHaveLength(1);
  });
});
