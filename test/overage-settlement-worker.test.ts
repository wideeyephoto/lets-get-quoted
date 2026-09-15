import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), create: vi.fn(), accounts: vi.fn(), balance: vi.fn(), subscription: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/stripe', () => ({ getStripeClient: () => ({ invoiceItems: { create: mocks.create },
  accounts: { retrieve: mocks.accounts }, balance: { retrieve: mocks.balance } }) }));
import { runOverageSettlementBatch, runOveragePeriodCloseBatch, classifyStripeFailure, overageSettlementIdempotencyKey,
  overagePeriodCloseWorkerEnabled, overageSettlementWorkerEnabled, OVERAGE_PERIOD_CLOSE_FLAG, OVERAGE_SETTLEMENT_FLAG } from '@/lib/billing/overage-settlement-worker';
import { CRON_JOBS, cronSummaryHasFailures } from '@/lib/cron-jobs';
import { extractLogicalFailureReason } from '@/lib/cron-runs';

const id = '11111111-1111-4111-8111-111111111111';
const account = '22222222-2222-4222-8222-222222222222';
const token = '33333333-3333-4333-8333-333333333333';
const key = overageSettlementIdempotencyKey({ settlementId: id, chargeableCents: 100 });
const payload = { customer: 'cus_original123', amount: 100, currency: 'usd', description: 'original',
  metadata: { lgq_settlement_id: id, lgq_account_id: account } };
let rows: Record<string, unknown>[];
let results: Record<string, unknown>;
const ok = (data: unknown) => ({ data, error: null });
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('LGQ_OVERAGE_SETTLEMENT_ACCOUNT_IDS', undefined);
  rows = [{ id, account_id: account, chargeable_cents: 100, attempt_count: 0, period_start: '2026-01-01', period_end: '2026-02-01' }];
  results = {};
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name in results) {
      if (results[name] instanceof Error) throw results[name];
      return results[name];
    }
    if (name === 'reap_overage_settlement_leases') return ok(0);
    if (name === 'list_claimable_overage_settlements') return ok(rows);
    if (name === 'claim_overage_settlement_v2') return ok({ claim_token: token, payload: args.p_payload, idempotency_key: args.p_stripe_idempotency_key,
      retry_deadline_at: new Date(Date.now()+23*3600000).toISOString(), lease_expires_at: new Date(Date.now()+300000).toISOString() });
    return ok(true);
  });
  const query: Record<string, unknown> = {};
  for (const name of ['select','eq','not','order','limit']) query[name] = () => query;
  query.maybeSingle = mocks.subscription;
  mocks.from.mockReturnValue(query);
  mocks.subscription.mockResolvedValue(ok({ provider_customer_id: 'cus_original123', livemode: false }));
  mocks.accounts.mockResolvedValue({ id: 'acct_original123' });
  mocks.balance.mockResolvedValue({ livemode: false });
  mocks.create.mockResolvedValue({ id: 'ii_original123' });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('settlement execution', () => {
  it('claims before creating and counts only confirmed completion', async () => {
    expect(await runOverageSettlementBatch()).toMatchObject({ charged: 1, completion_unconfirmed: 0, worker_errors: 0 });
    const claimIndex = mocks.rpc.mock.calls.findIndex(([name]) => name === 'claim_overage_settlement_v2');
    expect(mocks.rpc.mock.invocationCallOrder[claimIndex]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 100 }),
      { idempotencyKey: key, timeout: 20000, maxNetworkRetries: 0 });
  });
  it.each([ok(false),ok(null),{ data: null, error: { message: 'lost write' } },new Error('network')])('never counts unconfirmed completion: %j', async (result) => {
    results.complete_overage_settlement = result;
    expect(await runOverageSettlementBatch()).toMatchObject({ charged: 0, completion_unconfirmed: 1 });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'complete_overage_settlement')).toHaveLength(2);
    expect(mocks.rpc.mock.calls.some(([name]) => name === 'fail_overage_settlement')).toBe(false);
  });
  it('retries only local completion when its first response is lost', async () => {
    const base = mocks.rpc.getMockImplementation()!;
    let completed = false;
    mocks.rpc.mockImplementation(async (...args) => {
      if (args[0] === 'complete_overage_settlement' && !completed) { completed = true; throw new Error('lost reply'); }
      return base(...args);
    });
    expect((await runOverageSettlementBatch()).charged).toBe(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('reuses the frozen payload and customer on retries', async () => {
    rows[0] = { ...rows[0], attempt_count: 1, stripe_account_id: 'acct_original123', livemode: false, request_payload: payload, stripe_idempotency_key: key };
    expect((await runOverageSettlementBatch()).charged).toBe(1);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0]).toEqual(payload);
  });
  it('completes locally from previously saved provider evidence', async () => {
    results.claim_overage_settlement_v2=ok({claim_token:token,payload,idempotency_key:key,invoice_item_id:'ii_prior12345',
      retry_deadline_at:new Date(Date.now()+3600000).toISOString(),lease_expires_at:new Date(Date.now()+300000).toISOString()});
    expect((await runOverageSettlementBatch()).charged).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('complete_overage_settlement',expect.objectContaining({p_invoice_item_id:'ii_prior12345'}));
  });
  it.each([null,{}, { claim_token: null }])('cannot dispatch with a missing/malformed claim %j', async (claim) => {
    results.claim_overage_settlement_v2 = ok(claim);
    await runOverageSettlementBatch();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not recreate a provider object after its idempotency cache expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T00:00:00Z'));
    let objectCount = 0;
    let cachedAt = -Infinity;
    mocks.create.mockImplementation(async () => {
      if (Date.now()-cachedAt >= 86400000) { objectCount += 1; cachedAt = Date.now(); }
      return { id: `ii_original12${objectCount}` };
    });
    await runOverageSettlementBatch();
    vi.setSystemTime(new Date('2026-09-12T00:00:00Z'));
    // Defense at dispatch even if a stale/incorrect candidate reaches the worker.
    results.claim_overage_settlement_v2 = ok({ claim_token: token, payload, idempotency_key: key,
      retry_deadline_at:'2026-09-10T23:00:00Z',lease_expires_at:'2026-09-12T00:05:00Z' });
    await runOverageSettlementBatch();
    expect(objectCount).toBe(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('distinguishes customer lookup outage from verified absence', async () => {
    mocks.subscription.mockResolvedValue({ data: null, error: { message:'unavailable' } });
    expect(await runOverageSettlementBatch()).toMatchObject({ no_customer:0,worker_errors:1 });
    expect(mocks.rpc.mock.calls.some(([name]) => name==='fail_overage_settlement')).toBe(false);
  });
  it('records verified missing customer only after the database confirms', async () => {
    mocks.subscription.mockResolvedValue(ok(null));
    expect((await runOverageSettlementBatch()).no_customer).toBe(1);
    results.fail_overage_settlement=ok(false);
    expect(await runOverageSettlementBatch()).toMatchObject({ no_customer:0,worker_errors:1 });
  });
  it('does not submit in the wrong mode', async () => {
    mocks.balance.mockResolvedValue({ livemode:true });
    expect((await runOverageSettlementBatch()).worker_errors).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('stops and reports a reaper error', async () => {
    results.reap_overage_settlement_leases={ data:null,error:{message:'missing RPC'} };
    expect((await runOverageSettlementBatch()).worker_errors).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('reports failure-write errors and uses shaped provider error codes', async () => {
    mocks.create.mockRejectedValue({type:'StripeConnectionError'});
    results.fail_overage_settlement={data:null,error:{message:'db down'}};
    expect(await runOverageSettlementBatch()).toMatchObject({indeterminate:1,worker_errors:1,charged:0});
    expect(mocks.rpc).toHaveBeenCalledWith('fail_overage_settlement',expect.objectContaining({p_error_code:'stripe_connection_error',p_indeterminate:true}));
  });
  it('never treats a rejection of an earlier uncertain attempt as proof of failure', async () => {
    rows[0]={...rows[0],attempt_count:1,stripe_account_id:'acct_original123',livemode:false,request_payload:payload,stripe_idempotency_key:key};
    mocks.create.mockRejectedValue({type:'StripeInvalidRequestError'});
    expect((await runOverageSettlementBatch()).indeterminate).toBe(1);
  });
  it('passes a validated canary scope into SQL before limit', async () => {
    vi.stubEnv('LGQ_OVERAGE_SETTLEMENT_ACCOUNT_IDS',account);
    await runOverageSettlementBatch(1);
    expect(mocks.rpc).toHaveBeenCalledWith('list_claimable_overage_settlements',{p_limit:1,p_accounts:[account]});
  });
  it('rejects malformed canary scope', async () => {
    vi.stubEnv('LGQ_OVERAGE_SETTLEMENT_ACCOUNT_IDS','not-an-account');
    expect((await runOverageSettlementBatch()).worker_errors).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('close and operational accounting', () => {
  it.each([['closed','closed'],['nothing_owed','nothing_owed']])('counts %s results',async (state,counter) => {
    results.list_unclosed_overage_periods=ok([{account_id:account,period_start:'2026-01-01',period_end:'2026-02-01'}]);
    results.close_overage_period=ok({id,state});
    expect((await runOveragePeriodCloseBatch())[counter as 'closed'|'nothing_owed']).toBe(1);
  });
  it('does not count null close response as success',async () => {
    results.list_unclosed_overage_periods=ok([{account_id:account,period_start:'2026-01-01',period_end:'2026-02-01'}]);
    results.close_overage_period=ok(null);
    expect(await runOveragePeriodCloseBatch()).toMatchObject({closed:0,failures:1});
  });
  it.each(['nothing_owed','already_closed','deferred'])('does not alarm on resolved or deferred %s work', (field) => {
    const summary={candidates:1,closed:0,failures:0,[field]:1};
    expect(cronSummaryHasFailures(summary)).toBe(false);
    expect(extractLogicalFailureReason('overage-period-close',summary)).not.toContain('reported 0 closed periods');
  });
  it('alerts on unconfirmed completions and retains money-critical registry entries', () => {
    expect(cronSummaryHasFailures({completion_unconfirmed:1})).toBe(true);
    expect(extractLogicalFailureReason('overage-settlement',{completion_unconfirmed:1})).toContain('completion_unconfirmed=1');
    for (const job of ['overage-period-close','overage-settlement']) expect(CRON_JOBS.find(j=>j.job===job)?.importance).toBe('money');
  });
});

describe('stable key, shaped failures and independent opt-in flags', () => {
  it('keeps the existing key algorithm', () => {
    expect(key).toMatch(/^lgq:billing:v1:overage\.settle:[0-9a-f]{64}$/);
    expect(key).toBe(overageSettlementIdempotencyKey({settlementId:id,chargeableCents:100}));
    expect(key).not.toBe(overageSettlementIdempotencyKey({settlementId:id,chargeableCents:101}));
  });
  it.each([null,{}, {type:'StripeAPIError'}, {type:'StripeConnectionError'}, {type:'StripeIdempotencyError'}])('unknown or ambiguous %j stays uncertain',err => {
    expect(classifyStripeFailure(err).indeterminate).toBe(true);
    expect(classifyStripeFailure(err).code).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
  });
  it('flags are off unless explicitly enabled', () => {
    for (const value of [undefined,'','true','0','1 ']) {
      expect(overagePeriodCloseWorkerEnabled({[OVERAGE_PERIOD_CLOSE_FLAG]:value})).toBe(false);
      expect(overageSettlementWorkerEnabled({[OVERAGE_SETTLEMENT_FLAG]:value})).toBe(false);
    }
    expect(overagePeriodCloseWorkerEnabled({[OVERAGE_PERIOD_CLOSE_FLAG]:'1'})).toBe(true);
    expect(overageSettlementWorkerEnabled({[OVERAGE_SETTLEMENT_FLAG]:'1'})).toBe(true);
  });
});
