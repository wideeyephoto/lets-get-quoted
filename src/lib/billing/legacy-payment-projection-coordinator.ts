import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { createAdminClient } from '@/lib/auth';
import {
  SupabaseLegacyPaymentPlanProjectionStore,
  projectLegacyPaymentPlanPayment,
  type LegacyPaymentPlanProjectionInput,
  type LegacyPaymentPlanProjectionResult,
} from '@/lib/billing/legacy-payment-plan-projector';
import {
  SupabaseLegacyQuickStopPaymentStore,
  reconcileLegacyQuickStopPayment,
  type LegacyQuickStopReconcileResult,
} from '@/lib/billing/legacy-quick-stop-payment-store';

/**
 * DARK cutover boundary for legacy destination-payment side effects.
 *
 * This module has no active caller. A future signed legacy Stripe webhook may
 * replace (never layer) its plan and Quick Stop callbacks with the transactional
 * RPCs by calling this coordinator. While both exact-1 flags are off, the
 * coordinator returns through the supplied legacy callbacks before constructing
 * an admin client, reading a payment binding, or calling either new RPC.
 */

export const LEGACY_PAYMENT_PLAN_PROJECTION_FLAG =
  'LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED' as const;
export const LEGACY_QUICK_STOP_RECONCILIATION_FLAG =
  'LGQ_LEGACY_QUICK_STOP_RECONCILIATION_ENABLED' as const;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_PATTERN = /^evt_[A-Za-z0-9_]+$/;
const CHECKOUT_SESSION_PATTERN = /^cs_(?:test_)?[A-Za-z0-9_]+$/;
const PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9_]+$/;
const CHARGE_PATTERN = /^ch_[A-Za-z0-9_]+$/;

export type LegacyProjectionEventType =
  | 'checkout.session.completed'
  | 'checkout.session.async_payment_succeeded'
  | 'payment_intent.succeeded'
  | 'checkout.session.async_payment_failed'
  | 'checkout.session.expired'
  | 'charge.failed';

export type LegacyProjectionOutcome = 'settled' | 'failed';

export type LegacyProjectionEventBinding = Readonly<{
  /** ID from the already signature-verified platform Stripe event. */
  eventId: string;
  eventType: LegacyProjectionEventType;
  /** Session, PaymentIntent, or Charge ID from event.data.object.id. */
  eventObjectId: string;
  /** Exact PaymentIntent carried by the Session/Charge, or the PI object ID. */
  paymentIntentId: string | null;
  /** payments.id copied from the verified provider object's metadata. */
  paymentId: string;
  outcome: LegacyProjectionOutcome;
}>;

export type LegacyProjectionSavedCardEvidence = Readonly<{
  stripeCustomerId?: string | null;
  stripePaymentMethodId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
}>;

export type LegacyDestinationPaymentBinding = Readonly<{
  paymentId: string;
  paymentPlanId: string | null;
  kind: 'deposit' | 'plan_installment' | 'final' | 'other';
  status: 'paid' | 'failed' | 'canceled' | 'other';
  chargeModel: 'destination' | 'other';
  imported: boolean;
  stripeCheckoutSession: string | null;
  stripePaymentIntent: string | null;
}>;

export interface LegacyProjectionBindingStore {
  load(paymentId: string): Promise<LegacyDestinationPaymentBinding>;
}

export type LegacyProjectionCoordinatorServices = Readonly<{
  loadBinding(paymentId: string): Promise<LegacyDestinationPaymentBinding>;
  projectPlan(input: LegacyPaymentPlanProjectionInput): Promise<LegacyPaymentPlanProjectionResult>;
  reconcileQuickStop(paymentId: string): Promise<LegacyQuickStopReconcileResult>;
}>;

export type LegacyProjectionCallbacks = Readonly<{
  /** The exact pre-cutover plan callback, omitted when the old path was a no-op. */
  plan?: () => Promise<void>;
  /** The exact pre-cutover Quick Stop callback, omitted outside its old path. */
  quickStop?: () => Promise<void>;
}>;

export type LegacyProjectionCoordinatorInput = Readonly<{
  event: LegacyProjectionEventBinding;
  savedCard?: LegacyProjectionSavedCardEvidence;
  legacy: LegacyProjectionCallbacks;
}>;

export type LegacyProjectionCoordinatorResult = Readonly<{
  bindingChecked: boolean;
  plan: 'legacy' | 'projected' | 'not_applicable';
  quickStop: 'legacy' | 'reconciled' | 'not_requested';
  planProjection: LegacyPaymentPlanProjectionResult | null;
  quickStopReconciliation: LegacyQuickStopReconcileResult | null;
}>;

export type LegacyProjectionCoordinatorOptions = Readonly<{
  env?: ServerEnvironment;
  services?: LegacyProjectionCoordinatorServices;
}>;

export class LegacyPaymentProjectionContractError extends Error {
  override readonly name = 'LegacyPaymentProjectionContractError';

  constructor(readonly code: string) {
    super(code);
  }
}

function contract(code: string): never {
  throw new LegacyPaymentProjectionContractError(code);
}

function normalizedUuid(value: unknown, code: string): string {
  if (typeof value !== 'string') return contract(code);
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) return contract(code);
  return normalized;
}

function requiredProviderId(value: unknown, pattern: RegExp, code: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) return contract(code);
  return value;
}

function nullableProviderId(value: unknown, pattern: RegExp, code: string): string | null {
  return value == null ? null : requiredProviderId(value, pattern, code);
}

function exactOneRow(value: unknown): Record<string, unknown> {
  const candidate = Array.isArray(value)
    ? value.length === 1 ? value[0] : null
    : value;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return contract('payment_binding_invalid');
  }
  return candidate as Record<string, unknown>;
}

function parsePaymentBinding(value: unknown, expectedPaymentId: string): LegacyDestinationPaymentBinding {
  const row = exactOneRow(value);
  const paymentId = normalizedUuid(row.id, 'payment_binding_id_invalid');
  if (paymentId !== expectedPaymentId) return contract('payment_binding_id_mismatch');
  if (typeof row.imported !== 'boolean') return contract('payment_imported_binding_invalid');

  const paymentPlanId = row.payment_plan_id == null
    ? null
    : normalizedUuid(row.payment_plan_id, 'payment_plan_binding_invalid');
  const kind = row.kind === 'deposit'
    || row.kind === 'plan_installment'
    || row.kind === 'final'
    ? row.kind
    : 'other';
  const status = row.status === 'paid' || row.status === 'failed' || row.status === 'canceled'
    ? row.status
    : 'other';

  return Object.freeze({
    paymentId,
    paymentPlanId,
    kind,
    status,
    chargeModel: row.charge_model === 'destination' ? 'destination' : 'other',
    imported: row.imported,
    stripeCheckoutSession: nullableProviderId(
      row.stripe_checkout_session,
      CHECKOUT_SESSION_PATTERN,
      'payment_checkout_binding_invalid',
    ),
    stripePaymentIntent: nullableProviderId(
      row.stripe_payment_intent,
      PAYMENT_INTENT_PATTERN,
      'payment_intent_binding_invalid',
    ),
  });
}

export class SupabaseLegacyProjectionBindingStore implements LegacyProjectionBindingStore {
  constructor(private readonly admin: SupabaseClient = createAdminClient()) {}

  async load(paymentId: string): Promise<LegacyDestinationPaymentBinding> {
    const normalizedPaymentId = normalizedUuid(paymentId, 'payment_id_invalid');
    const { data, error } = await this.admin
      .from('payments')
      .select([
        'id',
        'payment_plan_id',
        'kind',
        'status',
        'charge_model',
        'imported',
        'stripe_checkout_session',
        'stripe_payment_intent',
      ].join(', '))
      .eq('id', normalizedPaymentId)
      .maybeSingle();
    // Preserve the database/PostgREST error. The webhook caller must return a
    // retryable failure instead of silently falling back after an ambiguous read.
    if (error) throw error;
    return parsePaymentBinding(data, normalizedPaymentId);
  }
}

export function legacyPaymentPlanProjectionEnabled(
  env: ServerEnvironment = process.env,
): boolean {
  return env[LEGACY_PAYMENT_PLAN_PROJECTION_FLAG] === '1';
}

export function legacyQuickStopReconciliationEnabled(
  env: ServerEnvironment = process.env,
): boolean {
  return env[LEGACY_QUICK_STOP_RECONCILIATION_FLAG] === '1';
}

function normalizedEvent(event: LegacyProjectionEventBinding): LegacyProjectionEventBinding {
  const paymentId = normalizedUuid(event.paymentId, 'event_payment_id_invalid');
  const eventId = requiredProviderId(event.eventId, EVENT_PATTERN, 'event_id_invalid');
  const settled = event.outcome === 'settled';
  const failed = event.outcome === 'failed';
  if (!settled && !failed) return contract('event_outcome_invalid');

  const settledEvent = event.eventType === 'checkout.session.completed'
    || event.eventType === 'checkout.session.async_payment_succeeded'
    || event.eventType === 'payment_intent.succeeded';
  const failedEvent = event.eventType === 'checkout.session.async_payment_failed'
    || event.eventType === 'checkout.session.expired'
    || event.eventType === 'charge.failed';
  if ((!settledEvent && !failedEvent) || (settled !== settledEvent)) {
    return contract('event_outcome_mismatch');
  }

  if (event.eventType.startsWith('checkout.session.')) {
    return Object.freeze({
      eventId,
      eventType: event.eventType,
      eventObjectId: requiredProviderId(
        event.eventObjectId,
        CHECKOUT_SESSION_PATTERN,
        'event_checkout_session_invalid',
      ),
      paymentIntentId: event.eventType === 'checkout.session.expired'
        ? nullableProviderId(
            event.paymentIntentId,
            PAYMENT_INTENT_PATTERN,
            'event_payment_intent_invalid',
          )
        : requiredProviderId(
            event.paymentIntentId,
            PAYMENT_INTENT_PATTERN,
            'event_payment_intent_invalid',
          ),
      paymentId,
      outcome: event.outcome,
    });
  }

  if (event.eventType === 'payment_intent.succeeded') {
    const eventObjectId = requiredProviderId(
      event.eventObjectId,
      PAYMENT_INTENT_PATTERN,
      'event_payment_intent_invalid',
    );
    const paymentIntentId = requiredProviderId(
      event.paymentIntentId,
      PAYMENT_INTENT_PATTERN,
      'event_payment_intent_invalid',
    );
    if (eventObjectId !== paymentIntentId) return contract('event_payment_intent_mismatch');
    return Object.freeze({ ...event, eventId, eventObjectId, paymentIntentId, paymentId });
  }

  if (event.eventType === 'charge.failed') {
    return Object.freeze({
      ...event,
      eventId,
      eventObjectId: requiredProviderId(event.eventObjectId, CHARGE_PATTERN, 'event_charge_invalid'),
      paymentIntentId: requiredProviderId(
        event.paymentIntentId,
        PAYMENT_INTENT_PATTERN,
        'event_payment_intent_invalid',
      ),
      paymentId,
    });
  }

  return contract('event_type_invalid');
}

function assertExactBinding(
  event: LegacyProjectionEventBinding,
  payment: LegacyDestinationPaymentBinding,
): void {
  if (payment.paymentId !== event.paymentId) return contract('payment_binding_id_mismatch');
  if (payment.chargeModel !== 'destination' || payment.imported) {
    return contract('payment_rail_invalid');
  }
  if (event.outcome === 'settled' && payment.status !== 'paid') {
    return contract('payment_settlement_truth_invalid');
  }
  if (event.outcome === 'failed' && payment.status !== 'failed' && payment.status !== 'canceled') {
    return contract('payment_failure_truth_invalid');
  }

  if (event.eventType.startsWith('checkout.session.')) {
    if (payment.stripeCheckoutSession !== event.eventObjectId) {
      return contract('payment_checkout_binding_mismatch');
    }
    if (payment.stripePaymentIntent !== event.paymentIntentId) {
      return contract('payment_intent_binding_mismatch');
    }
    return;
  }

  if (payment.stripePaymentIntent !== event.paymentIntentId) {
    return contract('payment_intent_binding_mismatch');
  }
}

function defaultServices(): LegacyProjectionCoordinatorServices {
  const admin = createAdminClient();
  const bindingStore = new SupabaseLegacyProjectionBindingStore(admin);
  const planStore = new SupabaseLegacyPaymentPlanProjectionStore(admin);
  const quickStopStore = new SupabaseLegacyQuickStopPaymentStore(admin);
  return Object.freeze({
    loadBinding: (paymentId) => bindingStore.load(paymentId),
    projectPlan: (input) => projectLegacyPaymentPlanPayment(input, planStore),
    reconcileQuickStop: (paymentId) => reconcileLegacyQuickStopPayment(paymentId, quickStopStore),
  });
}

async function runLegacyCallbacks(
  callbacks: LegacyProjectionCallbacks,
): Promise<LegacyProjectionCoordinatorResult> {
  if (callbacks.plan) await callbacks.plan();
  if (callbacks.quickStop) await callbacks.quickStop();
  return Object.freeze({
    bindingChecked: false,
    plan: callbacks.plan ? 'legacy' : 'not_applicable',
    quickStop: callbacks.quickStop ? 'legacy' : 'not_requested',
    planProjection: null,
    quickStopReconciliation: null,
  });
}

export async function coordinateLegacyDestinationPaymentProjection(
  input: LegacyProjectionCoordinatorInput,
  options: LegacyProjectionCoordinatorOptions = {},
): Promise<LegacyProjectionCoordinatorResult> {
  const env = options.env ?? process.env;
  const planProjectionEnabled = legacyPaymentPlanProjectionEnabled(env);
  const quickStopReconciliationEnabled = legacyQuickStopReconciliationEnabled(env);

  // This must remain the first effectful branch. In particular, do not validate
  // new event fields or construct the service-role client while both gates are
  // off; the old webhook callbacks retain their exact pre-cutover behavior.
  if (!planProjectionEnabled && !quickStopReconciliationEnabled) {
    return runLegacyCallbacks(input.legacy);
  }

  const event = normalizedEvent(input.event);
  const services = options.services ?? defaultServices();
  const payment = await services.loadBinding(event.paymentId);
  assertExactBinding(event, payment);

  let plan: LegacyProjectionCoordinatorResult['plan'] = 'not_applicable';
  let quickStop: LegacyProjectionCoordinatorResult['quickStop'] = 'not_requested';
  let planProjection: LegacyPaymentPlanProjectionResult | null = null;
  let quickStopReconciliation: LegacyQuickStopReconcileResult | null = null;

  if (!planProjectionEnabled) {
    if (input.legacy.plan) {
      await input.legacy.plan();
      plan = 'legacy';
    }
  } else if (
    payment.paymentPlanId !== null
    && (
      (event.outcome === 'settled' && (payment.kind === 'deposit' || payment.kind === 'final'))
      || (event.outcome === 'failed' && payment.kind === 'final')
    )
  ) {
    planProjection = await services.projectPlan({
      ...input.savedCard,
      // Keep the database-verified identity authoritative even if an untyped
      // caller passes an unexpected paymentId property in the evidence object.
      paymentId: payment.paymentId,
    });
    plan = 'projected';
  } else if (payment.paymentPlanId !== null && payment.kind === 'plan_installment') {
    // The dark projector deliberately does not own ordinary installment
    // completion. Preserve that existing reconciliation until a transactional
    // installment projector exists.
    if (input.legacy.plan) {
      await input.legacy.plan();
      plan = 'legacy';
    }
  } else if (payment.paymentPlanId !== null && payment.kind === 'other') {
    return contract('payment_plan_kind_invalid');
  }

  if (event.outcome === 'settled' && input.legacy.quickStop) {
    if (quickStopReconciliationEnabled) {
      quickStopReconciliation = await services.reconcileQuickStop(payment.paymentId);
      quickStop = 'reconciled';
    } else {
      await input.legacy.quickStop();
      quickStop = 'legacy';
    }
  }

  return Object.freeze({
    bindingChecked: true,
    plan,
    quickStop,
    planProjection,
    quickStopReconciliation,
  });
}
