import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';

import {
  closeDisposablePg17Clients,
  disposablePg17ApplicationNames,
  openDisposablePg17Clients,
  rollbackIfOpen,
  waitForApplicationLock,
  type DisposablePg17Clients,
} from './helpers/disposable-pg17';
import {
  addManualLateSuccessTask,
  attachManualTaskToCurrent,
  attachManualTaskToCurrentInOpenTransaction,
  claimGenerationThree,
  completeCurrentCheckout,
  createLateSuccessFixture,
  fingerprint,
  insertReceivedEvent,
  planLateSuccess,
  retainRpcParameters,
  RETAIN_RPC_SQL,
  settleRpcParameters,
  SETTLE_RPC_SQL,
  type LateSuccessFixture,
  type LateSuccessPlan,
} from './helpers/late-success-fixture';

type SqlResult = Awaited<ReturnType<DisposablePg17Clients['control']['query']>>;
type AsyncOutcome<T> =
  | Readonly<{ ok: true; result: T }>
  | Readonly<{ ok: false; error: unknown }>;
type CurrentExpirationRace = Readonly<{
  eventId: string;
  claimToken: string;
  providerEventId: string;
  providerCreatedAt: string;
  projection: Readonly<Record<string, unknown>>;
}>;

let clients: DisposablePg17Clients | undefined;

function pg(): DisposablePg17Clients {
  if (!clients) throw new Error('Disposable PG17 clients were not initialized.');
  return clients;
}

function row(result: SqlResult): Record<string, unknown> {
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw new Error('Expected exactly one PostgreSQL result row.');
  }
  return result.rows[0];
}

function sqlState(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

async function outcome<T>(promise: Promise<T>): Promise<AsyncOutcome<T>> {
  try {
    return { ok: true, result: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

async function expectSqlState(
  promise: Promise<unknown>,
  expected: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(sqlState(caught)).toBe(expected);
}

function operationId(kind: string): string {
  return `pg17:${kind}:${randomUUID()}`;
}

async function prepareCurrentExpiration(
  fixture: LateSuccessFixture,
): Promise<CurrentExpirationRace> {
  const operation = row(await pg().control.query(
    `select operation_id, checkout_session_expires_at::text as expires_at
       from public.billing_payment_operations where id = $1`,
    [fixture.currentOperationPk],
  ));
  const expiresAt = String(operation.expires_at);
  const providerCreatedAt = String(row(await pg().control.query(
    `select ($1::timestamptz + interval '1 second')::text as value`,
    [expiresAt],
  )).value);
  const eventId = randomUUID();
  const providerEventId = `evt_exp_current_${fixture.token}`;
  await insertReceivedEvent(pg().control, {
    id: eventId,
    accountId: fixture.accountId,
    stripeAccountId: fixture.stripeAccountId,
    providerEventId,
    eventType: 'checkout.session.expired',
    checkoutSessionId: fixture.currentSessionId,
    providerCreatedAt,
  });
  const claim = row(await pg().control.query(
    'select * from public.claim_stripe_connected_checkout_expiration_event($1)',
    [eventId],
  ));
  expect(claim.claim_status).toBe('claimed');
  if (typeof claim.claim_token !== 'string' || !claim.claim_token) {
    throw new Error('Expiration race claim token is missing.');
  }

  return Object.freeze({
    eventId,
    claimToken: claim.claim_token,
    providerEventId,
    providerCreatedAt,
    projection: Object.freeze({
      schema: 'stripe_connected_checkout_expiration_v1',
      provider_event_id: providerEventId,
      event_type: 'checkout.session.expired',
      provider_created_at: providerCreatedAt,
      workspace_id: fixture.accountId,
      payment_id: fixture.paymentId,
      operation_id: String(operation.operation_id),
      operation_pk: fixture.currentOperationPk,
      invoice_id: fixture.invoiceId,
      checkout_session_id: fixture.currentSessionId,
      merchant_account_id: fixture.stripeAccountId,
      livemode: false,
      currency: 'usd',
      amount_cents: 10_000,
      session_expires_at: expiresAt,
      mode: 'payment',
      session_status: 'expired',
      payment_status: 'unpaid',
      payment_method_types: ['card'],
      recovered_from: null,
      payment_intent_id: null,
      fee_plan_code: 'flex',
      // From the catalog, not a literal. This was the SECOND hardcoded copy of
      // '2026-08-15-preview'; fixing only the fixture's left this one, and the
      // projector correctly rejected the mismatch against live 2026-08-18
      // evidence as expiration_payment_evidence_conflict -- BEFORE taking the
      // session mutex, which is why no lock wait ever happened either. One
      // stale literal, two failing tests, neither of them about the race.
      fee_catalog_version: PRICING_CATALOG_VERSION,
      fee_rate_bps: 125,
      fee_basis_amount_cents: 10_000,
      application_fee_cents: 125,
    }),
  });
}

function projectCurrentExpiration(
  client: DisposablePg17Clients['a' | 'b'],
  race: CurrentExpirationRace,
): Promise<SqlResult> {
  return client.query(
    `select * from public.project_stripe_connected_checkout_expiration(
       $1, $2, $3::jsonb
     )`,
    [race.eventId, race.claimToken, JSON.stringify(race.projection)],
  );
}

async function insertCurrentSuccess(
  client: DisposablePg17Clients['a' | 'b'],
  fixture: LateSuccessFixture,
  race: CurrentExpirationRace,
  suffix: string,
): Promise<string> {
  const eventId = randomUUID();
  const providerEventId = `evt_success_${suffix}_${fixture.token}`;
  // billing_events_stripe_identity_format_check is ^evt_[A-Za-z0-9_]{8,}$ --
  // no hyphens, matching real Stripe IDs. A suffix of 'after-expiration' once
  // produced an id the table refused, and the insert failed inside a race the
  // test was mid-way through, so it surfaced as `expected false to be true`
  // rather than as a bad identifier. Fail here, where the name is visible.
  if (!/^evt_[A-Za-z0-9_]{8,}$/.test(providerEventId)) {
    throw new Error(`Fixture built an invalid Stripe event id: ${providerEventId}`);
  }
  await insertReceivedEvent(client, {
    id: eventId,
    accountId: fixture.accountId,
    stripeAccountId: fixture.stripeAccountId,
    providerEventId,
    eventType: 'checkout.session.completed',
    checkoutSessionId: fixture.currentSessionId,
    providerCreatedAt: race.providerCreatedAt,
  });
  return eventId;
}

async function settlementPlan(fixture: LateSuccessFixture): Promise<LateSuccessPlan> {
  const plan = await planLateSuccess(
    pg().control,
    fixture,
    'settle_paid_predecessor',
  );
  expect(plan).toMatchObject({
    decisionCode: 'accept_single_late_paid_predecessor',
    eligible: true,
    reasonCode: 'single_late_paid_predecessor_resolution_ready',
    paidOperationPk: fixture.paidOperationPk,
    currentOperationPk: fixture.currentOperationPk,
  });
  return plan;
}

beforeAll(async () => {
  // Missing/incorrect dedicated variables throw before Client construction, so
  // the normal no-env invocation fails without opening a socket.
  clients = await openDisposablePg17Clients();
});

afterEach(async () => {
  if (!clients) return;
  await Promise.all([
    rollbackIfOpen(clients.control),
    rollbackIfOpen(clients.a),
    rollbackIfOpen(clients.b),
  ]);
});

afterAll(async () => {
  await closeDisposablePg17Clients(clients);
  clients = undefined;
});

describe('direct Checkout late-success operator resolution on disposable PG17', () => {
  it('serializes identical settle RPCs and returns one applied outcome plus one replay', async () => {
    const fixture = await createLateSuccessFixture(pg().control);
    const plan = await settlementPlan(fixture);
    const id = operationId('identical-settle');
    const parameters = settleRpcParameters(fixture, plan, id);

    let committed = false;
    await pg().a.query('begin');
    try {
      const first = row(await pg().a.query(SETTLE_RPC_SQL, parameters));
      expect(first).toMatchObject({ applied: true, result_code: 'settled' });

      const second = outcome(pg().b.query(SETTLE_RPC_SQL, parameters));
      const wait = await waitForApplicationLock(
        pg().control,
        disposablePg17ApplicationNames.b,
      );
      expect(wait.query).toContain('settle_direct_checkout_late_success_task');

      await pg().a.query('commit');
      committed = true;
      const replay = await second;
      expect(replay.ok).toBe(true);
      if (!replay.ok) throw replay.error;
      expect(row(replay.result)).toMatchObject({
        applied: false,
        result_code: 'already_settled',
        resolution_id: first.resolution_id,
      });
    } finally {
      if (!committed) await rollbackIfOpen(pg().a);
    }

    const durable = row(await pg().control.query(
      `select
         (select pg_catalog.count(*)::integer
            from public.billing_direct_checkout_late_success_resolutions
           where payment_id = $1) as resolution_count,
         (select pg_catalog.count(*)::integer
            from public.billing_direct_payment_settlement_tasks
           where payment_id = $1) as settlement_task_count,
         p.status::text as payment_status,
         i.status::text as invoice_status,
         public.direct_checkout_late_success_canonical_release_is_valid(p.id)
           as canonical_release,
         public.direct_checkout_late_success_has_active_hold(p.id)
           as active_hold
       from public.payments p
       join public.invoices i on i.id = p.invoice_id
      where p.id = $1`,
      [fixture.paymentId],
    ));
    expect(durable).toMatchObject({
      resolution_count: 1,
      settlement_task_count: 1,
      payment_status: 'paid',
      invoice_status: 'paid',
      canonical_release: true,
      active_hold: false,
    });
  });

  it('serializes retain-hold against settle and rejects the conflicting outcome', async () => {
    const fixture = await createLateSuccessFixture(pg().control);
    const settlePlan = await settlementPlan(fixture);
    const retainPlan = await planLateSuccess(pg().control, fixture, 'retain_hold');
    expect(retainPlan).toMatchObject({
      decisionCode: 'retain_operator_hold',
      eligible: true,
      reasonCode: 'operator_hold_requested',
    });

    const retainId = operationId('retain-wins');
    const retainParameters = retainRpcParameters(fixture, retainPlan, retainId);
    const settleParameters = settleRpcParameters(
      fixture,
      settlePlan,
      operationId('conflicting-settle'),
    );

    let committed = false;
    await pg().a.query('begin');
    try {
      const retained = row(await pg().a.query(RETAIN_RPC_SQL, retainParameters));
      expect(retained).toMatchObject({ applied: true, result_code: 'hold_retained' });

      const blockedSettle = outcome(pg().b.query(SETTLE_RPC_SQL, settleParameters));
      await waitForApplicationLock(pg().control, disposablePg17ApplicationNames.b);
      await pg().a.query('commit');
      committed = true;

      const conflict = await blockedSettle;
      expect(conflict.ok).toBe(false);
      if (conflict.ok) throw new Error('Conflicting settle unexpectedly succeeded.');
      expect(sqlState(conflict.error)).toBe('22000');
    } finally {
      if (!committed) await rollbackIfOpen(pg().a);
    }

    const replay = row(await pg().a.query(RETAIN_RPC_SQL, retainParameters));
    expect(replay).toMatchObject({
      applied: false,
      result_code: 'already_retained',
    });
    const held = row(await pg().control.query(
      `select p.status::text as payment_status,
              (select pg_catalog.count(*)::integer
                 from public.billing_direct_payment_settlement_tasks t
                where t.payment_id = p.id) as settlement_task_count,
              public.direct_checkout_late_success_has_active_hold(p.id)
                as active_hold,
              public.direct_checkout_late_success_refund_release_is_valid(p.id)
                as refund_release
         from public.payments p where p.id = $1`,
      [fixture.paymentId],
    ));
    expect(held).toMatchObject({
      payment_status: 'processing',
      settlement_task_count: 0,
      active_hold: true,
      refund_release: false,
    });
    await expect(planLateSuccess(
      pg().control,
      fixture,
      'settle_paid_predecessor',
    )).resolves.toMatchObject({
      decisionCode: 'reject_task_already_resolved',
      eligible: false,
      reasonCode: 'task_already_resolved',
    });
  });

  it('rolls back an uncommitted resolution, then applies and replays it exactly once', async () => {
    const fixture = await createLateSuccessFixture(pg().control);
    const plan = await settlementPlan(fixture);
    const id = operationId('rollback-retry');
    const parameters = settleRpcParameters(fixture, plan, id);

    await pg().a.query('begin');
    const rolledBack = row(await pg().a.query(SETTLE_RPC_SQL, parameters));
    expect(rolledBack).toMatchObject({ applied: true, result_code: 'settled' });
    await pg().a.query('rollback');

    const afterRollback = row(await pg().control.query(
      `select p.status::text as payment_status,
              p.paid_checkout_operation_pk,
              p.late_checkout_success_resolution_pk,
              (select pg_catalog.count(*)::integer
                 from public.billing_direct_checkout_late_success_resolutions r
                where r.payment_id = p.id) as resolution_count
         from public.payments p where p.id = $1`,
      [fixture.paymentId],
    ));
    expect(afterRollback).toMatchObject({
      payment_status: 'processing',
      paid_checkout_operation_pk: null,
      late_checkout_success_resolution_pk: null,
      resolution_count: 0,
    });

    const applied = row(await pg().b.query(SETTLE_RPC_SQL, parameters));
    const replay = row(await pg().b.query(SETTLE_RPC_SQL, parameters));
    expect(applied).toMatchObject({ applied: true, result_code: 'settled' });
    expect(replay).toMatchObject({
      applied: false,
      result_code: 'already_settled',
      resolution_id: applied.resolution_id,
    });
  });

  it('re-holds a canonical release when a distinct additional paid fact arrives', async () => {
    const fixture = await createLateSuccessFixture(pg().control);
    const plan = await settlementPlan(fixture);
    const id = operationId('additional-fact');
    const parameters = settleRpcParameters(fixture, plan, id);
    expect(row(await pg().control.query(SETTLE_RPC_SQL, parameters))).toMatchObject({
      applied: true,
      result_code: 'settled',
    });

    const released = row(await pg().control.query(
      `select
         public.direct_checkout_late_success_canonical_release_is_valid($1)
           as canonical_release,
         public.direct_checkout_late_success_has_active_hold($1) as active_hold,
         public.direct_checkout_late_success_refund_release_is_valid($1)
           as refund_release`,
      [fixture.paymentId],
    ));
    expect(released).toMatchObject({
      canonical_release: true,
      active_hold: false,
      refund_release: true,
    });

    const additional = await addManualLateSuccessTask(pg().control, fixture);
    const reheld = row(await pg().control.query(
      `select
         public.direct_checkout_late_success_canonical_release_is_valid($1)
           as canonical_release,
         public.direct_checkout_late_success_has_active_hold($1) as active_hold,
         public.direct_checkout_late_success_refund_release_is_valid($1)
           as refund_release`,
      [fixture.paymentId],
    ));
    expect(reheld).toMatchObject({
      canonical_release: true,
      active_hold: true,
      refund_release: false,
    });

    const changedPlan = await planLateSuccess(
      pg().control,
      fixture,
      'settle_paid_predecessor',
    );
    expect(changedPlan).toMatchObject({
      decisionCode: 'reject_additional_paid_truth',
      eligible: false,
      reasonCode: 'additional_paid_truth_present',
    });
    expect(changedPlan.taskSetSha256).not.toBe(plan.taskSetSha256);
    await expectSqlState(pg().control.query(SETTLE_RPC_SQL, parameters), '22000');

    await expectSqlState(
      pg().control.query(
        `insert into public.billing_events (
           id, provider, provider_event_id, event_type, event_scope,
           account_id, provider_account_id, livemode, provider_created_at,
           payload, payload_sha256, processing_status, attempt_count,
           processed_at, projection_schema_version, projection_applied,
           projection_result
         )
         select $1, provider, provider_event_id, event_type, event_scope,
                account_id, provider_account_id, livemode, provider_created_at,
                payload, payload_sha256, processing_status, attempt_count,
                processed_at, projection_schema_version, projection_applied,
                projection_result
           from public.billing_events where id = $2`,
        [randomUUID(), additional.eventId],
      ),
      '23505',
    );
  });

  it('serializes completion behind a hold and withholds the in-flight successor URL', async () => {
    const fixture = await createLateSuccessFixture(pg().control, {
      taskMode: 'none',
      submitCurrentBeforeTask: true,
    });

    let committed = false;
    let completion: Promise<AsyncOutcome<boolean>> | undefined;
    await pg().a.query('begin');
    try {
      await attachManualTaskToCurrentInOpenTransaction(pg().a, fixture);
      completion = outcome(completeCurrentCheckout(pg().b, fixture));
      const wait = await waitForApplicationLock(
        pg().control,
        disposablePg17ApplicationNames.b,
      );
      expect(wait.query).toContain('complete_one_off_direct_checkout_operation');
      await pg().a.query('commit');
      committed = true;
      const completed = await completion;
      expect(completed.ok).toBe(true);
      if (!completed.ok) throw completed.error;
      expect(completed.result).toBe(false);
    } finally {
      if (!committed) await rollbackIfOpen(pg().a);
      if (completion) await completion;
    }

    // confirm_one_off_direct_checkout_presentation, not
    // can_present_one_off_direct_checkout_session. The latter never existed --
    // two call sites, zero definitions, introduced by fb5b7d57 alongside these
    // tests, so this assertion has never once run. Despite the `confirm_` name
    // the existing function performs no INSERT, UPDATE or DELETE: it is the
    // locking read gate the application itself calls via confirmPresentation(),
    // and its own comment says "false means the Session must remain
    // undisclosed" -- exactly what is being asserted here.
    const state = row(await pg().control.query(
      `select o.state, o.provider_object_id,
              p.stripe_checkout_session, p.late_checkout_success_task_pk,
              public.confirm_one_off_direct_checkout_presentation(o.id, $2)
                as can_present,
              public.direct_checkout_late_success_has_active_hold(p.id)
                as active_hold
         from public.payments p
         join public.billing_payment_operations o
           on o.id = p.current_checkout_operation_pk
        where p.id = $1`,
      [fixture.paymentId, fixture.currentSessionId],
    ));
    expect(state).toMatchObject({
      state: 'succeeded',
      provider_object_id: fixture.currentSessionId,
      stripe_checkout_session: fixture.currentSessionId,
      late_checkout_success_task_pk: fixture.taskId,
      can_present: false,
      active_hold: true,
    });
    await expectSqlState(claimGenerationThree(pg().control, fixture), '55000');
  });

  it('serializes a hold behind completion and blocks the committed successor URL', async () => {
    const fixture = await createLateSuccessFixture(pg().control, {
      taskMode: 'none',
      submitCurrentBeforeTask: true,
    });

    let committed = false;
    let hold: Promise<AsyncOutcome<void>> | undefined;
    await pg().a.query('begin');
    try {
      expect(await completeCurrentCheckout(pg().a, fixture)).toBe(true);
      hold = outcome(attachManualTaskToCurrent(pg().b, fixture));
      const wait = await waitForApplicationLock(
        pg().control,
        disposablePg17ApplicationNames.b,
      );
      expect(wait.query).toContain('from public.payments');
      await pg().a.query('commit');
      committed = true;
      const attached = await hold;
      expect(attached.ok).toBe(true);
      if (!attached.ok) throw attached.error;
    } finally {
      if (!committed) await rollbackIfOpen(pg().a);
      if (hold) await hold;
    }

    const fenced = row(await pg().control.query(
      `select
         public.confirm_one_off_direct_checkout_presentation($1, $2)
           as can_present,
         public.direct_checkout_late_success_has_active_hold($3)
           as active_hold,
         public.direct_checkout_late_success_refund_release_is_valid($3)
           as refund_release`,
      [fixture.currentOperationPk, fixture.currentSessionId, fixture.paymentId],
    ));
    expect(fenced).toMatchObject({
      can_present: false,
      active_hold: true,
      refund_release: false,
    });
  });

  it('serializes expiration behind a signed success receipt and rejects expiration', async () => {
    const fixture = await createLateSuccessFixture(pg().control, {
      taskMode: 'none',
      submitCurrentBeforeTask: true,
    });
    expect(await completeCurrentCheckout(pg().control, fixture)).toBe(true);
    const race = await prepareCurrentExpiration(fixture);

    let committed = false;
    let expiration: Promise<AsyncOutcome<SqlResult>> | undefined;
    await pg().a.query('begin');
    try {
      await insertCurrentSuccess(pg().a, fixture, race, 'first');
      expiration = outcome(projectCurrentExpiration(pg().b, race));
      const wait = await waitForApplicationLock(
        pg().control,
        disposablePg17ApplicationNames.b,
      );
      expect(wait.query).toContain('project_stripe_connected_checkout_expiration');
      await pg().a.query('commit');
      committed = true;
    } finally {
      if (!committed) await rollbackIfOpen(pg().a);
      if (!committed && expiration) await expiration;
    }
    if (!expiration) throw new Error('Expiration race did not start.');
    const expirationOutcome = await expiration;
    expect(expirationOutcome.ok).toBe(true);
    if (!expirationOutcome.ok) throw expirationOutcome.error;
    const projected = row(expirationOutcome.result);
    expect(projected).toMatchObject({
      processing_status: 'failed',
      error_code: 'expiration_success_event_conflict',
      projection_applied: false,
    });
  });

  it('serializes a success receipt behind expiration and preserves expiration truth', async () => {
    const fixture = await createLateSuccessFixture(pg().control, {
      taskMode: 'none',
      submitCurrentBeforeTask: true,
    });
    expect(await completeCurrentCheckout(pg().control, fixture)).toBe(true);
    const race = await prepareCurrentExpiration(fixture);

    let committed = false;
    let success: Promise<AsyncOutcome<string>> | undefined;
    await pg().a.query('begin');
    try {
      expect(row(await projectCurrentExpiration(pg().a, race))).toMatchObject({
        processing_status: 'processed',
        error_code: null,
        projection_applied: true,
      });
      success = outcome(insertCurrentSuccess(
        pg().b,
        fixture,
        race,
        'after_expiration',
      ));
      const wait = await waitForApplicationLock(
        pg().control,
        disposablePg17ApplicationNames.b,
      );
      expect(wait.query).toContain('insert into public.billing_events');
      await pg().a.query('commit');
      committed = true;
      const successOutcome = await success;
      expect(successOutcome.ok).toBe(true);
      if (!successOutcome.ok) throw successOutcome.error;
      const successEventId = successOutcome.result;
      const durable = row(await pg().control.query(
        `select o.checkout_lifecycle,
                (select pg_catalog.count(*)::integer
                   from public.stripe_connected_checkout_expirations x
                  where x.operation_pk = $1) as expiration_count,
                (select e.processing_status
                   from public.billing_events e where e.id = $2)
                  as success_event_status
           from public.billing_payment_operations o where o.id = $1`,
        [fixture.currentOperationPk, successEventId],
      ));
      expect(durable).toMatchObject({
        checkout_lifecycle: 'expired_unpaid',
        expiration_count: 1,
        success_event_status: 'received',
      });
    } finally {
      if (!committed) await rollbackIfOpen(pg().a);
      if (success) await success;
    }
  });

  it('proves expiration-first late success remains eligible for exact operator resolution', async () => {
    const fixture = await createLateSuccessFixture(pg().control);
    const plan = await settlementPlan(fixture);
    const facts = row(await pg().control.query(
      `select
         (select pg_catalog.count(*)::integer
            from public.stripe_connected_checkout_expirations x
           where x.operation_pk = $1) as expiration_count,
         (select pg_catalog.count(*)::integer
            from public.billing_events e
           where e.id in ($2, $3)) as signed_event_count,
         public.direct_checkout_late_success_has_active_hold($4) as active_hold`,
      [
        fixture.paidOperationPk,
        fixture.expirationEventId,
        fixture.lateEventId,
        fixture.paymentId,
      ],
    ));
    expect(facts).toMatchObject({
      expiration_count: 1,
      signed_event_count: 2,
      active_hold: true,
    });
    expect(plan.eligible).toBe(true);
  });

  it('uses different operation/request identities as a hard conflict, not a replay', async () => {
    const fixture = await createLateSuccessFixture(pg().control);
    const plan = await settlementPlan(fixture);
    const firstId = operationId('fixed-identity');
    const first = settleRpcParameters(fixture, plan, firstId);
    expect(row(await pg().control.query(SETTLE_RPC_SQL, first))).toMatchObject({
      applied: true,
    });

    const conflictingRequest = settleRpcParameters(
      fixture,
      plan,
      firstId,
      fingerprint(`conflicting-request:${firstId}`),
    );
    await expectSqlState(
      pg().control.query(SETTLE_RPC_SQL, conflictingRequest),
      '22000',
    );
  });
});
