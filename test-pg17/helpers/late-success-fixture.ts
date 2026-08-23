import { createHash, randomUUID } from 'node:crypto';

import type { Client } from 'pg';

import { PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';

const AMOUNT_CENTS = 10_000;
const FEE_BASIS_CENTS = 10_000;
const FEE_CENTS = 125;
const FEE_RATE_BPS = 125;
const FEE_RATE = '0.0125';

// Taken from the catalog, not hardcoded. This was pinned to '2026-08-15-preview'
// and 20260818120000 moved the catalog to '2026-08-18-preview' -- rewriting
// initialize_workspace_pricing() along with ten other function bodies -- so
// every fixture account then initialized a version this file did not expect and
// all ten tests died at setup with "did not initialize the expected Flex
// entitlement", before reaching a single race assertion. Reading the constant
// means the next catalog bump cannot silently disarm this suite again.
const CATALOG_VERSION = PRICING_CATALOG_VERSION;

export const SETTLE_RPC_SQL = `select * from
  public.settle_direct_checkout_late_success_task(
    $1::uuid, $2::uuid, $3::uuid, $4::text,
    $5::text, $6::text, $7::text, $8::uuid
  )`;

export const RETAIN_RPC_SQL = `select * from
  public.record_direct_checkout_late_success_manual_disposition(
    $1::uuid, $2::uuid, $3::uuid, $4::text,
    $5::text, $6::text, $7::text, $8::text, $9::uuid
  )`;

type SqlRow = Record<string, unknown>;

export type LateSuccessPlan = Readonly<{
  decisionCode: string;
  eligible: boolean;
  reasonCode: string;
  paidOperationPk: string;
  currentOperationPk: string;
  currentCheckoutSessionId: string | null;
  taskSetSha256: string;
  evidenceSha256: string;
}>;

export type LateSuccessFixture = Readonly<{
  accountId: string;
  jobId: string;
  invoiceId: string;
  paymentId: string;
  paidOperationPk: string;
  currentOperationPk: string;
  currentClaimToken: string;
  paidSessionId: string;
  currentSessionId: string;
  expirationEventId: string;
  lateEventId: string;
  taskId: string;
  actorUserId: string;
  stripeAccountId: string;
  token: string;
}>;

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`PG17 fixture ${label} is missing.`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`PG17 fixture ${label} is not boolean.`);
  }
  return value;
}

async function one(client: Client, sql: string, values: unknown[] = []): Promise<SqlRow> {
  const result = await client.query(sql, values);
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw new Error('PG17 fixture query did not return exactly one row.');
  }
  return result.rows[0];
}

function token(): string {
  return randomUUID().replace(/-/g, '');
}

export function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function checkoutOperationId(paymentId: string, generation: number): string {
  return `payment:${paymentId}:checkout:${generation}`;
}

function idempotencyKey(seed: string): string {
  return `lgq:direct:v1:checkout_session.create:${fingerprint(seed)}`;
}

function inboxPayload(
  providerEventId: string,
  eventType: 'checkout.session.completed' | 'checkout.session.expired',
  stripeAccountId: string,
  checkoutSessionId: string,
): Record<string, unknown> {
  return {
    schema: 'lgq.stripe-event-inbox.v1',
    scope: 'connected_payment',
    event: {
      id: providerEventId,
      type: eventType,
      account: stripeAccountId,
      livemode: false,
    },
    data_object: {
      object: 'checkout.session',
      id: checkoutSessionId,
    },
  };
}

async function insertEvent(
  client: Client,
  input: Readonly<{
    id: string;
    accountId: string;
    stripeAccountId: string;
    providerEventId: string;
    eventType: 'checkout.session.completed' | 'checkout.session.expired';
    checkoutSessionId: string;
    providerCreatedAt: string;
    processingStatus: 'received' | 'processed';
    projectionResult?: string;
    projectionApplied?: boolean;
  }>,
): Promise<void> {
  const payload = inboxPayload(
    input.providerEventId,
    input.eventType,
    input.stripeAccountId,
    input.checkoutSessionId,
  );
  await client.query(
    `insert into public.billing_events (
       id, provider, provider_event_id, event_type, event_scope,
       account_id, provider_account_id, livemode, provider_created_at,
       payload, payload_sha256, processing_status, attempt_count,
       processing_started_at, processed_at, projection_schema_version,
       projection_applied, projection_result
     ) values (
       $1, 'stripe', $2, $3, 'connected_payment',
       $4, $5, false, $6::timestamptz,
       $7::jsonb,
       pg_catalog.encode(
         extensions.digest(
           pg_catalog.convert_to($7::jsonb::text, 'UTF8'), 'sha256'
         ), 'hex'
       ),
       $8,
       case when $8 = 'processed' then 1 else 0 end,
       null,
       case when $8 = 'processed' then $6::timestamptz else null end,
       case when $8 = 'processed' then $9 else null end,
       case when $8 = 'processed' then $10::boolean else null end,
       case when $8 = 'processed' then $11 else null end
     )`,
    [
      input.id,
      input.providerEventId,
      input.eventType,
      input.accountId,
      input.stripeAccountId,
      input.providerCreatedAt,
      JSON.stringify(payload),
      input.processingStatus,
      input.eventType === 'checkout.session.expired'
        ? 'stripe_connected_checkout_expiration_v1'
        : 'stripe_connected_payment_projection_v1',
      input.projectionApplied ?? null,
      input.projectionResult ?? null,
    ],
  );
}

async function insertLateTask(
  client: Client,
  fixture: Omit<LateSuccessFixture, 'lateEventId' | 'taskId'>,
  lateEventId: string,
  taskId: string,
  providerEventId: string,
  providerCreatedAt: string,
  paidAt: string,
  mode: 'successor_neutralized' | 'manual_review',
): Promise<void> {
  const current = await one(
    client,
    `select state, checkout_generation, checkout_lifecycle,
            provider_object_id, checkout_session_expires_at::text
              as checkout_session_expires_at
       from public.billing_payment_operations
      where id = $1`,
    [fixture.currentOperationPk],
  );
  const observedState = stringValue(current.state, 'current operation state');
  const observedGeneration = Number(current.checkout_generation);
  if (!Number.isSafeInteger(observedGeneration)) {
    throw new Error('PG17 fixture current generation is invalid.');
  }
  const currentSessionId = current.provider_object_id == null
    ? null
    : stringValue(current.provider_object_id, 'current Session ID');
  const currentExpiresAt = current.checkout_session_expires_at == null
    ? null
    : stringValue(current.checkout_session_expires_at, 'current Session expiration');

  const projection = {
    schema: 'stripe_connected_payment_projection_v1',
    provider_event_id: providerEventId,
    event_type: 'checkout.session.completed',
    event_created_at: providerCreatedAt,
    workspace_id: fixture.accountId,
    payment_id: fixture.paymentId,
    operation_id: checkoutOperationId(fixture.paymentId, 1),
    checkout_session_id: fixture.paidSessionId,
    payment_intent_id: `pi_${fixture.token}`,
    charge_id: `ch_${fixture.token}`,
    application_fee_id: `fee_${fixture.token}`,
    balance_transaction_id: `txn_${fixture.token}`,
    merchant_account_id: fixture.stripeAccountId,
    livemode: false,
    currency: 'usd',
    amount_cents: AMOUNT_CENTS,
    application_fee_cents: FEE_CENTS,
    paid_at: paidAt,
    reconciliation_status: 'reconciled',
  };
  const neutralized = mode === 'successor_neutralized';
  const reasonCode = neutralized
    ? 'successor_never_submitted'
    : 'successor_provider_state_indeterminate';

  await client.query(
    "select pg_catalog.set_config('lgq.direct_checkout_late_success_task_id', $1, true)",
    [taskId],
  );
  await client.query(
    `insert into public.billing_direct_checkout_late_success_tasks (
       id, billing_event_id, account_id, payment_id,
       stripe_account_id, livemode,
       paid_operation_pk, paid_checkout_generation,
       paid_checkout_session_id,
       observed_current_operation_pk, observed_current_generation,
       observed_current_state, observed_current_lifecycle,
       observed_current_session_id,
       expected_amount_cents, expected_application_fee_cents,
       expected_reconciliation_status,
       provider_event_id, provider_event_created_at, paid_at,
       payment_intent_id, charge_id, application_fee_id,
       balance_transaction_id, currency, amount_cents,
       application_fee_cents, provider_reconciliation_status,
       late_success_projection, late_success_projection_sha256,
       prepared_action, prepared_current_operation_pk,
       prepared_current_session_id, prepared_current_session_expires_at,
       expire_operation_id, prepared_reason_code, prepared_at,
       task_state, resolution_source, reason_code,
       neutralized_at, manual_reviewed_at
     ) values (
       $1, $2, $3, $4, $5, false,
       $6, 1, $7,
       $8, $9, $10, $11, $12,
       $13, $14, 'reconciled',
       $15, $16::timestamptz, $17::timestamptz,
       $18, $19, $20, $21, 'usd', $13, $14, 'reconciled',
       $22::jsonb,
       pg_catalog.encode(
         extensions.digest(
           pg_catalog.convert_to($22::jsonb::text, 'UTF8'), 'sha256'
         ), 'hex'
       ),
       $23, $8, $12, $24::timestamptz,
       $25, $26, pg_catalog.now(),
       $27, $28, $26,
       case when $27 = 'successor_neutralized' then pg_catalog.now() else null end,
       case when $27 = 'manual_review' then pg_catalog.now() else null end
     )`,
    [
      taskId,
      lateEventId,
      fixture.accountId,
      fixture.paymentId,
      fixture.stripeAccountId,
      fixture.paidOperationPk,
      fixture.paidSessionId,
      fixture.currentOperationPk,
      observedGeneration,
      observedState,
      current.checkout_lifecycle,
      currentSessionId,
      AMOUNT_CENTS,
      FEE_CENTS,
      providerEventId,
      providerCreatedAt,
      paidAt,
      `pi_${fixture.token}`,
      `ch_${fixture.token}`,
      `fee_${fixture.token}`,
      `txn_${fixture.token}`,
      JSON.stringify(projection),
      neutralized ? 'successor_neutralized' : 'manual_review',
      currentExpiresAt,
      `pg17-fixture:${fixture.token}`,
      reasonCode,
      mode,
      neutralized ? 'never_submitted' : null,
    ],
  );
  await client.query(
    "select pg_catalog.set_config('lgq.direct_checkout_late_success_task_id', '', true)",
  );

  await client.query(
    "select pg_catalog.set_config('lgq.direct_checkout_late_success_payment_id', $1, true)",
    [fixture.paymentId],
  );
  await client.query(
    `update public.payments
        set late_checkout_success_task_pk = $1
      where id = $2 and late_checkout_success_task_pk is null`,
    [taskId, fixture.paymentId],
  );
  await client.query(
    "select pg_catalog.set_config('lgq.direct_checkout_late_success_payment_id', '', true)",
  );
}

export async function createLateSuccessFixture(
  client: Client,
  options: Readonly<{
    taskMode?: 'successor_neutralized' | 'manual_review' | 'none';
    submitCurrentBeforeTask?: boolean;
  }> = {},
): Promise<LateSuccessFixture> {
  const fixtureToken = token();
  const ids = {
    accountId: randomUUID(),
    jobId: randomUUID(),
    invoiceId: randomUUID(),
    paymentId: randomUUID(),
    expirationEventId: randomUUID(),
    lateEventId: randomUUID(),
    taskId: randomUUID(),
    actorUserId: randomUUID(),
  };
  const stripeAccountId = `acct_${fixtureToken.slice(0, 16)}`;
  const paidSessionId = `cs_test_paid_${fixtureToken}`;
  const currentSessionId = `cs_test_current_${fixtureToken}`;
  const actorEmail = `pg17-${fixtureToken}@operator-race.invalid`;
  const taskMode = options.taskMode ?? 'successor_neutralized';

  await client.query('begin');
  try {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values ($1, '00000000-0000-0000-0000-000000000000',
               'authenticated', 'authenticated', $2)`,
      [ids.actorUserId, actorEmail],
    );
    await client.query(
      `insert into public.accounts (
         id, business_name, stripe_merchant_account_id,
         merchant_onboarding_state, merchant_requirements_checked_at,
         merchant_ready_at, merchant_livemode, merchant_dashboard_type,
         merchant_card_payments_active, merchant_payouts_active,
         merchant_fees_collector, merchant_losses_collector,
         merchant_configuration_api_version,
         merchant_configuration_snapshot,
         merchant_configuration_snapshot_sha256,
         merchant_configuration_verified_at
       ) values (
         $1, 'Disposable PG17 payment race', $2,
         'ready', pg_catalog.now(), pg_catalog.now(), false, 'full',
         true, true, 'stripe', 'stripe', '2026-08-15.preview',
         '{}'::jsonb, $3, pg_catalog.now()
       )`,
      [ids.accountId, stripeAccountId, fingerprint(`merchant:${fixtureToken}`)],
    );
    const entitlement = await one(
      client,
      `select plan_code = 'flex'
              and billing_interval = 'none'
              and billing_status = 'free'
              and entitlement_state = 'active'
              and catalog_version = $2
              and platform_fee_bps = $3 as valid
         from public.workspace_entitlements where account_id = $1`,
      [ids.accountId, CATALOG_VERSION, FEE_RATE_BPS],
    );
    if (!booleanValue(entitlement.valid, 'initialized Flex entitlement')) {
      throw new Error('PG17 fixture account did not initialize the expected Flex entitlement.');
    }
    await client.query(
      `insert into public.jobs (id, account_id, ref, client_name, status)
       values ($1, $2, $3, 'Disposable customer', 'in_progress')`,
      [ids.jobId, ids.accountId, `PG17-${fixtureToken}`],
    );
    await client.query(
      `insert into public.invoices (
         id, account_id, job_id, ref, status, total,
         discount_percent, tax_rate
       ) values ($1, $2, $3, $4, 'sent', 100.00, 0, 0)`,
      [ids.invoiceId, ids.accountId, ids.jobId, `INV-${fixtureToken}`],
    );
    await client.query(
      `insert into public.invoice_items (
         id, invoice_id, description, amount, sort_order
       ) values ($1, $2, 'Disposable race fixture', 100.00, 0)`,
      [randomUUID(), ids.invoiceId],
    );
    await client.query(
      `insert into public.payments (
         id, account_id, job_id, invoice_id, kind, label, amount, status,
         fee_basis_amount, fee_plan_code, fee_catalog_version,
         fee_rate_bps, fee_rate, platform_fee, stripe_account_id,
         stripe_livemode, charge_model, reconciliation_status
       ) values (
         $1, $2, $3, $4, 'deposit', 'Disposable PG17 fixture',
         100.00, 'requested', 100.00, 'flex', $5,
         $6, $7::numeric, 1.25, $8, false, 'direct', 'pending'
       )`,
      [
        ids.paymentId,
        ids.accountId,
        ids.jobId,
        ids.invoiceId,
        CATALOG_VERSION,
        FEE_RATE_BPS,
        FEE_RATE,
        stripeAccountId,
      ],
    );

    const generationOne = await one(
      client,
      `select * from public.claim_one_off_direct_checkout_operation(
         $1, $2, $3, false, 1, null,
         $4, $5, $6, $7, $8, $9, 'flex', $10, $11, $12::numeric
       )`,
      [
        ids.accountId,
        ids.paymentId,
        stripeAccountId,
        checkoutOperationId(ids.paymentId, 1),
        idempotencyKey(`generation-1:${fixtureToken}`),
        fingerprint(`generation-1-request:${fixtureToken}`),
        AMOUNT_CENTS,
        FEE_BASIS_CENTS,
        FEE_CENTS,
        CATALOG_VERSION,
        FEE_RATE_BPS,
        FEE_RATE,
      ],
    );
    const paidOperationPk = stringValue(generationOne.operation_pk, 'generation-one operation');
    const paidClaimToken = stringValue(generationOne.claim_token, 'generation-one claim token');
    await one(
      client,
      'select public.begin_one_off_direct_checkout_submission($1, $2) as begun',
      [paidOperationPk, paidClaimToken],
    );
    const sessionExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const completed = await one(
      client,
      `select public.complete_one_off_direct_checkout_operation(
         $1, $2, $3, $4::timestamptz
       ) as completed`,
      [paidOperationPk, paidClaimToken, paidSessionId, sessionExpiresAt],
    );
    if (completed.completed !== true) {
      throw new Error('PG17 fixture generation-one completion was withheld unexpectedly.');
    }

    const expirationProviderEventId = `evt_exp_${fixtureToken}`;
    const expirationProviderCreatedAt = new Date(
      new Date(sessionExpiresAt).getTime() + 1_000,
    ).toISOString();
    await insertEvent(client, {
      id: ids.expirationEventId,
      accountId: ids.accountId,
      stripeAccountId,
      providerEventId: expirationProviderEventId,
      eventType: 'checkout.session.expired',
      checkoutSessionId: paidSessionId,
      providerCreatedAt: expirationProviderCreatedAt,
      processingStatus: 'processed',
      projectionResult: 'direct_checkout_expired',
      projectionApplied: true,
    });
    await client.query(
      `insert into public.stripe_connected_checkout_expirations (
         id, billing_event_id, account_id, payment_id, operation_pk,
         operation_id, stripe_account_id, livemode,
         provider_event_id, checkout_session_id, provider_created_at,
         session_expires_at, observed_mode, observed_session_status,
         observed_payment_status, observed_currency, observed_amount_cents,
         observed_payment_method_types, observed_recovered_from,
         observed_payment_intent_id, fee_plan_code, fee_catalog_version,
         fee_rate_bps, fee_basis_amount_cents, application_fee_cents
       ) values (
         $1, $2, $3, $4, $5, $6, $7, false,
         $8, $9, $10::timestamptz, $11::timestamptz,
         'payment', 'expired', 'unpaid', 'usd', $12,
         array['card']::text[], null, null, 'flex', $13, $14, $15, $16
       )`,
      [
        randomUUID(),
        ids.expirationEventId,
        ids.accountId,
        ids.paymentId,
        paidOperationPk,
        checkoutOperationId(ids.paymentId, 1),
        stripeAccountId,
        expirationProviderEventId,
        paidSessionId,
        expirationProviderCreatedAt,
        sessionExpiresAt,
        AMOUNT_CENTS,
        CATALOG_VERSION,
        FEE_RATE_BPS,
        FEE_BASIS_CENTS,
        FEE_CENTS,
      ],
    );

    const generationTwo = await one(
      client,
      `select * from public.claim_one_off_direct_checkout_operation(
         $1, $2, $3, false, 2, $4,
         $5, $6, $7, $8, $9, $10, 'flex', $11, $12, $13::numeric
       )`,
      [
        ids.accountId,
        ids.paymentId,
        stripeAccountId,
        paidOperationPk,
        checkoutOperationId(ids.paymentId, 2),
        idempotencyKey(`generation-2:${fixtureToken}`),
        fingerprint(`generation-2-request:${fixtureToken}`),
        AMOUNT_CENTS,
        FEE_BASIS_CENTS,
        FEE_CENTS,
        CATALOG_VERSION,
        FEE_RATE_BPS,
        FEE_RATE,
      ],
    );
    const currentOperationPk = stringValue(
      generationTwo.operation_pk,
      'generation-two operation',
    );
    const currentClaimToken = stringValue(
      generationTwo.claim_token,
      'generation-two claim token',
    );
    if (options.submitCurrentBeforeTask) {
      await one(
        client,
        'select public.begin_one_off_direct_checkout_submission($1, $2) as begun',
        [currentOperationPk, currentClaimToken],
      );
    }

    const fixtureWithoutTask = {
      ...ids,
      paidOperationPk,
      currentOperationPk,
      currentClaimToken,
      paidSessionId,
      currentSessionId,
      stripeAccountId,
      token: fixtureToken,
    };
    if (taskMode !== 'none') {
      const lateProviderEventId = `evt_late_${fixtureToken}`;
      const paidAt = new Date(new Date(sessionExpiresAt).getTime() + 2_000).toISOString();
      const lateProviderCreatedAt = new Date(
        new Date(sessionExpiresAt).getTime() + 3_000,
      ).toISOString();
      await insertEvent(client, {
        id: ids.lateEventId,
        accountId: ids.accountId,
        stripeAccountId,
        providerEventId: lateProviderEventId,
        eventType: 'checkout.session.completed',
        checkoutSessionId: paidSessionId,
        providerCreatedAt: lateProviderCreatedAt,
        processingStatus: 'processed',
        projectionResult: taskMode === 'successor_neutralized'
          ? 'direct_payment_late_success_resolution_pending'
          : 'direct_payment_late_success_manual_review',
        projectionApplied: false,
      });
      await insertLateTask(
        client,
        fixtureWithoutTask,
        ids.lateEventId,
        ids.taskId,
        lateProviderEventId,
        lateProviderCreatedAt,
        paidAt,
        taskMode,
      );
    }

    await client.query('commit');
    return Object.freeze(fixtureWithoutTask);
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function addManualLateSuccessTask(
  client: Client,
  fixture: LateSuccessFixture,
): Promise<Readonly<{ eventId: string; taskId: string; providerEventId: string }>> {
  const extra = {
    eventId: randomUUID(),
    taskId: randomUUID(),
    providerEventId: `evt_additional_${token()}`,
  };
  const timing = await one(
    client,
    `select (checkout_session_expires_at + interval '2 seconds')::text as paid_at,
            (checkout_session_expires_at + interval '3 seconds')::text as event_at
       from public.billing_payment_operations where id = $1`,
    [fixture.paidOperationPk],
  );
  const paidAt = stringValue(timing.paid_at, 'additional paid timestamp');
  const eventAt = stringValue(timing.event_at, 'additional event timestamp');

  await client.query('begin');
  try {
    await insertEvent(client, {
      id: extra.eventId,
      accountId: fixture.accountId,
      stripeAccountId: fixture.stripeAccountId,
      providerEventId: extra.providerEventId,
      eventType: 'checkout.session.completed',
      checkoutSessionId: fixture.paidSessionId,
      providerCreatedAt: eventAt,
      processingStatus: 'processed',
      projectionResult: 'direct_payment_additional_paid_truth_manual_review',
      projectionApplied: false,
    });
    await insertLateTask(
      client,
      fixture,
      extra.eventId,
      extra.taskId,
      extra.providerEventId,
      eventAt,
      paidAt,
      'manual_review',
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
  return Object.freeze(extra);
}

export async function planLateSuccess(
  client: Client,
  fixture: LateSuccessFixture,
  action: 'settle_paid_predecessor' | 'retain_hold',
  taskId = fixture.taskId,
): Promise<LateSuccessPlan> {
  const row = await one(
    client,
    `select * from public.plan_direct_checkout_late_success_operator_resolution(
       $1, $2, $3, $4
     )`,
    [fixture.accountId, fixture.paymentId, taskId, action],
  );
  return Object.freeze({
    decisionCode: stringValue(row.decision_code, 'plan decision code'),
    eligible: booleanValue(row.eligible, 'plan eligibility'),
    reasonCode: stringValue(row.reason_code, 'plan reason code'),
    paidOperationPk: stringValue(row.paid_operation_pk, 'plan paid operation'),
    currentOperationPk: stringValue(row.current_operation_pk, 'plan current operation'),
    currentCheckoutSessionId: row.current_checkout_session_id == null
      ? null
      : stringValue(row.current_checkout_session_id, 'plan current Session'),
    taskSetSha256: stringValue(row.task_set_sha256, 'plan task-set fingerprint'),
    evidenceSha256: stringValue(row.evidence_sha256, 'plan evidence fingerprint'),
  });
}

export function settleRpcParameters(
  fixture: LateSuccessFixture,
  plan: LateSuccessPlan,
  operationId: string,
  requestSha256 = fingerprint(`settle:${operationId}`),
): unknown[] {
  return [
    fixture.accountId,
    fixture.paymentId,
    fixture.taskId,
    operationId,
    requestSha256,
    plan.taskSetSha256,
    plan.evidenceSha256,
    fixture.actorUserId,
  ];
}

export function retainRpcParameters(
  fixture: LateSuccessFixture,
  plan: LateSuccessPlan,
  operationId: string,
  disposition = 'operator_retained_for_manual_review',
  requestSha256 = fingerprint(`retain:${operationId}`),
): unknown[] {
  return [
    fixture.accountId,
    fixture.paymentId,
    fixture.taskId,
    operationId,
    requestSha256,
    plan.taskSetSha256,
    plan.evidenceSha256,
    disposition,
    fixture.actorUserId,
  ];
}

export async function completeCurrentCheckout(
  client: Client,
  fixture: LateSuccessFixture,
): Promise<boolean> {
  const row = await one(
    client,
    `select public.complete_one_off_direct_checkout_operation(
       $1, $2, $3, pg_catalog.now() + interval '1 hour'
     ) as completed`,
    [fixture.currentOperationPk, fixture.currentClaimToken, fixture.currentSessionId],
  );
  return booleanValue(row.completed, 'current completion result');
}

export async function attachManualTaskToCurrent(
  client: Client,
  fixture: LateSuccessFixture,
): Promise<void> {
  await client.query('begin');
  try {
    await attachManualTaskToCurrentInOpenTransaction(client, fixture);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function attachManualTaskToCurrentInOpenTransaction(
  client: Client,
  fixture: LateSuccessFixture,
): Promise<void> {
  const lateProviderEventId = `evt_late_after_${token()}`;
  const lateEventId = fixture.lateEventId;
  const taskId = fixture.taskId;
  const timing = await one(
    client,
    `select (checkout_session_expires_at + interval '2 seconds')::text as paid_at,
            (checkout_session_expires_at + interval '3 seconds')::text as event_at
       from public.billing_payment_operations where id = $1`,
    [fixture.paidOperationPk],
  );
  await insertEvent(client, {
    id: lateEventId,
    accountId: fixture.accountId,
    stripeAccountId: fixture.stripeAccountId,
    providerEventId: lateProviderEventId,
    eventType: 'checkout.session.completed',
    checkoutSessionId: fixture.paidSessionId,
    providerCreatedAt: stringValue(timing.event_at, 'post-completion event time'),
    processingStatus: 'processed',
    projectionResult: 'direct_payment_late_success_manual_review',
    projectionApplied: false,
  });

  // Match the production projector's account -> payment -> ordered operations
  // lock order. This makes the race harness exercise the same serialization
  // boundary instead of relying on a fixture-only payment UPDATE side effect.
  await client.query(
    `select 1
       from public.accounts a
      where a.id = $1
        and a.stripe_merchant_account_id = $2
        and a.merchant_livemode = false
      for key share`,
    [fixture.accountId, fixture.stripeAccountId],
  );
  await client.query(
    `select 1
       from public.payments p
      where p.id = $1 and p.account_id = $2
      for update`,
    [fixture.paymentId, fixture.accountId],
  );
  await client.query(
    `select 1
       from public.billing_payment_operations o
      where o.payment_id = $1
        and o.operation_type = 'checkout_session.create'
      order by o.checkout_generation, o.id
      for update`,
    [fixture.paymentId],
  );
  await insertLateTask(
    client,
    fixture,
    lateEventId,
    taskId,
    lateProviderEventId,
    stringValue(timing.event_at, 'post-completion event time'),
    stringValue(timing.paid_at, 'post-completion paid time'),
    'manual_review',
  );
}

export async function insertReceivedEvent(
  client: Client,
  input: Omit<Parameters<typeof insertEvent>[1], 'processingStatus'>,
): Promise<void> {
  await insertEvent(client, { ...input, processingStatus: 'received' });
}

export async function claimGenerationThree(
  client: Client,
  fixture: LateSuccessFixture,
): Promise<void> {
  await client.query(
    `select * from public.claim_one_off_direct_checkout_operation(
       $1, $2, $3, false, 3, $4,
       $5, $6, $7, $8, $9, $10, 'flex', $11, $12, $13::numeric
     )`,
    [
      fixture.accountId,
      fixture.paymentId,
      fixture.stripeAccountId,
      fixture.currentOperationPk,
      checkoutOperationId(fixture.paymentId, 3),
      idempotencyKey(`generation-3:${fixture.token}`),
      fingerprint(`generation-3-request:${fixture.token}`),
      AMOUNT_CENTS,
      FEE_BASIS_CENTS,
      FEE_CENTS,
      CATALOG_VERSION,
      FEE_RATE_BPS,
      FEE_RATE,
    ],
  );
}
