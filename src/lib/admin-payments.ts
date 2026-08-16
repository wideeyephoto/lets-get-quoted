import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isLegacyDestinationPayment,
  isMissingPaymentChargeModelColumnError,
} from '@/lib/payments';

// This ledger is scoped to rows with paid_at: the records behind the Command
// Center's "payments processed" number. Uncollected attempts have no processed
// date and therefore do not belong in this period selector.
export const PAYMENT_LEDGER_STATUSES = ['paid', 'refunded', 'disputed'] as const;
export type PaymentLedgerStatus = (typeof PAYMENT_LEDGER_STATUSES)[number];

export type PaymentLedgerRow = {
  id: string;
  account_id: string;
  label: string | null;
  amount: number | null;
  status: string;
  paid_at: string | null;
  refunded_at: string | null;
  refunded_amount: number | null;
  platform_fee: number | null;
  platform_fee_refunded: number | null;
  stripe_payment_intent: string | null;
  stripe_checkout_session?: string | null;
  stripe_dispute_id: string | null;
  charge_model?: string | null;
  stripe_account_id?: string | null;
  stripe_livemode?: boolean | null;
  stripe_charge_id?: string | null;
  stripe_application_fee_id?: string | null;
  stripe_balance_transaction_id?: string | null;
  reconciliation_status?: string | null;
  reconciled_at?: string | null;
};

const LEGACY_LIST_COLUMNS = 'id, account_id, label, amount, status, paid_at, refunded_at, refunded_amount, platform_fee, platform_fee_refunded, stripe_payment_intent, stripe_dispute_id';
const CHARGE_MODEL_LIST_COLUMNS = `${LEGACY_LIST_COLUMNS}, charge_model`;
const LIST_COLUMNS = `${LEGACY_LIST_COLUMNS}, stripe_checkout_session, charge_model, stripe_account_id, stripe_livemode, stripe_charge_id, stripe_application_fee_id, stripe_balance_transaction_id, reconciliation_status, reconciled_at`;

export function isPaymentLedgerStatus(value: unknown): value is PaymentLedgerStatus {
  return typeof value === 'string' && (PAYMENT_LEDGER_STATUSES as readonly string[]).includes(value);
}

export async function listAdminPayments(
  admin: SupabaseClient,
  opts: { startIso: string; endIso: string; status?: PaymentLedgerStatus; accountId?: string; query?: string; page?: number; pageSize?: number },
): Promise<{ rows: PaymentLedgerRow[]; total: number; available: boolean }> {
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
  const page = Math.max(1, opts.page ?? 1);
  const term = opts.query?.trim();
  const from = (page - 1) * pageSize;

  const run = async (columns: string, directColumnsAvailable: boolean) => {
    let query = admin
      .from('payments')
      .select(columns, { count: 'exact' })
      .is('test_marker', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', opts.startIso)
      .lt('paid_at', opts.endIso);

    if (opts.status) query = query.eq('status', opts.status);
    if (opts.accountId) query = query.eq('account_id', opts.accountId);
    if (term) {
      // Provider identifiers and UUIDs have a deliberately narrow alphabet, so
      // they can safely enter PostgREST's OR expression. Human text stays in a
      // single parameterized ILIKE filter.
      if (/^[a-zA-Z0-9_-]{6,160}$/.test(term)) {
        const providerColumns = directColumnsAvailable
          ? 'stripe_payment_intent,stripe_checkout_session,stripe_charge_id,stripe_application_fee_id,stripe_balance_transaction_id,stripe_dispute_id,stripe_account_id'
          : 'stripe_payment_intent,stripe_dispute_id';
        query = query.or(`id.eq.${term},${providerColumns.split(',').map((column) => `${column}.eq.${term}`).join(',')}`);
      } else {
        query = query.ilike('label', `%${term.replace(/[%_]/g, '')}%`);
      }
    }

    return query.order('paid_at', { ascending: false }).range(from, from + pageSize - 1);
  };

  let result = await run(LIST_COLUMNS, true);
  if (isMissingPaymentChargeModelColumnError(result.error)) {
    // Always probe charge_model itself, even when PostgREST returns only an
    // error code. A code-only missing-column response cannot prove this is the
    // all-legacy schema rather than a partially migrated direct schema.
    result = await run(CHARGE_MODEL_LIST_COLUMNS, false);
    if (isMissingPaymentChargeModelColumnError(result.error)) {
      result = await run(LEGACY_LIST_COLUMNS, false);
    }
  }
  const { data, count, error } = result;
  if (error) {
    console.error('listAdminPayments failed:', error);
    return { rows: [], total: 0, available: false };
  }
  return { rows: (data ?? []) as unknown as PaymentLedgerRow[], total: count ?? 0, available: true };
}

export type AdminPaymentDetail = {
  id: string;
  account_id: string;
  job_id: string | null;
  invoice_id: string | null;
  kind: string | null;
  label: string | null;
  amount: number | null;
  status: string | null;
  platform_fee: number | null;
  fee_rate: number | null;
  refunded_amount: number | null;
  platform_fee_refunded: number | null;
  refunded_at: string | null;
  stripe_payment_intent: string | null;
  stripe_checkout_session: string | null;
  stripe_dispute_id: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_status: string | null;
  dispute_due_by: string | null;
  dunning_state: string | null;
  failure_message: string | null;
  failed_at: string | null;
  requested_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  // Absent on a database that predates charge-model migrations. Presence with
  // any value other than `destination` must disable the legacy refund surface.
  charge_model?: string | null;
  stripe_account_id?: string | null;
  stripe_livemode?: boolean | null;
  stripe_charge_id?: string | null;
  stripe_application_fee_id?: string | null;
  stripe_balance_transaction_id?: string | null;
  reconciliation_status?: string | null;
  reconciled_at?: string | null;
};

const LEGACY_DETAIL_COLUMNS = `
  id, account_id, job_id, invoice_id, kind, label, amount, status,
  platform_fee, fee_rate, refunded_amount, platform_fee_refunded, refunded_at,
  stripe_payment_intent, stripe_checkout_session, stripe_dispute_id,
  disputed_at, dispute_reason, dispute_status, dispute_due_by,
  dunning_state, failure_message, failed_at,
  requested_at, paid_at, created_at
`.replace(/\s+/g, ' ').trim();
const DETAIL_COLUMNS = `${LEGACY_DETAIL_COLUMNS}, charge_model, stripe_account_id, stripe_livemode, stripe_charge_id, stripe_application_fee_id, stripe_balance_transaction_id, reconciliation_status, reconciled_at`;
const CHARGE_MODEL_DETAIL_COLUMNS = `${LEGACY_DETAIL_COLUMNS}, charge_model`;

export async function getPaymentForAdmin(admin: SupabaseClient, paymentId: string): Promise<AdminPaymentDetail | null> {
  const run = (columns: string) => admin.from('payments').select(columns).eq('id', paymentId).maybeSingle();
  let result = await run(DETAIL_COLUMNS);
  if (isMissingPaymentChargeModelColumnError(result.error)) {
    result = await run(CHARGE_MODEL_DETAIL_COLUMNS);
    if (isMissingPaymentChargeModelColumnError(result.error)) {
      result = await run(LEGACY_DETAIL_COLUMNS);
    }
  }
  const { data, error } = result;
  if (error) {
    console.error('getPaymentForAdmin failed:', error);
    return null;
  }
  return (data as AdminPaymentDetail | null) ?? null;
}

const money = (value: number | null | undefined): number => Number(value) || 0;

export function refundableCents(payment: Pick<AdminPaymentDetail, 'amount' | 'refunded_amount' | 'status'>): number {
  if (payment.status !== 'paid') return 0;
  const total = Math.round(money(payment.amount) * 100);
  const already = Math.round(money(payment.refunded_amount) * 100);
  return Math.max(0, total - already);
}

export function refundBlockedReason(payment: AdminPaymentDetail): string | null {
  if (!isLegacyDestinationPayment(payment)) {
    return payment.charge_model === 'direct'
      ? 'This payment uses the direct-charge rail. Its dedicated refund workflow is not active here yet.'
      : 'This payment has an unrecognized charge model. The legacy refund path is blocked until it is reconciled.';
  }
  if (payment.status === 'refunded') return 'This payment has already been fully refunded.';
  if (payment.status === 'disputed') return 'This payment is disputed. Resolve it on Stripe — refunding here as well would pay the customer twice.';
  if (payment.status !== 'paid') return 'Only a payment that has actually been collected can be refunded.';
  if (!payment.stripe_payment_intent) return 'No Stripe payment intent on this row, so there is nothing to refund against. It was probably recorded by hand or imported.';
  if (refundableCents(payment) <= 0) return 'Nothing left to refund on this payment.';
  return null;
}

export type AdminPaymentFeeState = {
  code:
    | 'legacy_recognized'
    | 'legacy_expected'
    | 'direct_reconciled'
    | 'direct_pending'
    | 'direct_mismatch'
    | 'direct_waived'
    | 'unrecognized';
  label: string;
  recognizedFee: number | null;
  expectedFee: number | null;
  recognizedAt: string | null;
};

/**
 * The row's fee is not revenue merely because `platform_fee` has a value.
 * Direct rows carry that value from preparation as an expectation; only exact
 * reconciliation makes it recognized. Unknown explicit models fail closed.
 */
export function adminPaymentFeeState(payment: Pick<
  AdminPaymentDetail,
  'charge_model' | 'paid_at' | 'platform_fee' | 'platform_fee_refunded' | 'reconciliation_status' | 'reconciled_at'
>): AdminPaymentFeeState {
  const netFee = money(payment.platform_fee) - money(payment.platform_fee_refunded);
  if (isLegacyDestinationPayment(payment)) {
    return payment.paid_at
      ? {
          code: 'legacy_recognized',
          label: 'Legacy · recognized',
          recognizedFee: netFee,
          expectedFee: null,
          recognizedAt: payment.paid_at,
        }
      : {
          code: 'legacy_expected',
          label: 'Expected · not collected',
          recognizedFee: null,
          expectedFee: netFee,
          recognizedAt: null,
        };
  }

  if (payment.charge_model !== 'direct') {
    return {
      code: 'unrecognized',
      label: 'Unrecognized fee model',
      recognizedFee: null,
      expectedFee: null,
      recognizedAt: null,
    };
  }

  if (payment.reconciliation_status === 'reconciled' && payment.reconciled_at) {
    return {
      code: 'direct_reconciled',
      label: 'Reconciled',
      recognizedFee: netFee,
      expectedFee: null,
      recognizedAt: payment.reconciled_at,
    };
  }

  const expectedStates = {
    pending: ['direct_pending', 'Expected only · pending'],
    mismatch: ['direct_mismatch', 'Expected only · mismatch'],
    waived: ['direct_waived', 'Expected only · waived'],
  } as const;
  const expected = expectedStates[payment.reconciliation_status as keyof typeof expectedStates];
  if (expected) {
    return {
      code: expected[0],
      label: expected[1],
      recognizedFee: null,
      expectedFee: netFee,
      recognizedAt: null,
    };
  }

  return {
    code: 'unrecognized',
    label: 'Reconciliation unavailable',
    recognizedFee: null,
    expectedFee: null,
    recognizedAt: null,
  };
}

export type StripeAdminLinkKind = 'payment_intent' | 'checkout_session' | 'charge' | 'dispute' | 'application_fee';
export type StripeAdminLink = {
  kind: StripeAdminLinkKind;
  label: string;
  url: string;
  scope: 'platform' | 'connected';
};

export type StripeAdminReference = {
  charge_model?: unknown;
  stripe_account_id?: unknown;
  stripe_livemode?: unknown;
  stripe_payment_intent?: unknown;
  stripe_checkout_session?: unknown;
  stripe_charge_id?: unknown;
  stripe_dispute_id?: unknown;
  stripe_application_fee_id?: unknown;
};

const STRIPE_ACCOUNT_ID = /^acct_[A-Za-z0-9]{8,}$/;
const STRIPE_OBJECT_IDS: Record<StripeAdminLinkKind, RegExp> = {
  payment_intent: /^pi_[A-Za-z0-9_]{6,}$/,
  checkout_session: /^cs_[A-Za-z0-9_]{6,}$/,
  charge: /^ch_[A-Za-z0-9_]{6,}$/,
  dispute: /^dp_[A-Za-z0-9_]{6,}$/,
  application_fee: /^fee_[A-Za-z0-9_]{6,}$/,
};

function validStripeId(kind: StripeAdminLinkKind, value: unknown): value is string {
  return typeof value === 'string' && STRIPE_OBJECT_IDS[kind].test(value);
}

/**
 * Stripe Dashboard object links with an explicit account boundary.
 *
 * Legacy destination objects continue to use the platform URLs the admin
 * console has always emitted. Direct Checkout, PaymentIntent, Charge, and
 * dispute objects live on the connected Merchant account and are never linked
 * without both a valid account ID and an explicit mode. Application Fees are
 * platform objects even when their source Charge is direct.
 */
export function stripeAdminLinks(payment: StripeAdminReference): StripeAdminLink[] {
  if (isLegacyDestinationPayment(payment)) {
    const links: StripeAdminLink[] = [];
    if (validStripeId('payment_intent', payment.stripe_payment_intent)) {
      links.push({
        kind: 'payment_intent',
        label: 'PaymentIntent',
        url: `https://dashboard.stripe.com/payments/${payment.stripe_payment_intent}`,
        scope: 'platform',
      });
    }
    if (validStripeId('checkout_session', payment.stripe_checkout_session)) {
      links.push({
        kind: 'checkout_session',
        label: 'Checkout Session',
        url: `https://dashboard.stripe.com/checkout/sessions/${payment.stripe_checkout_session}`,
        scope: 'platform',
      });
    }
    if (validStripeId('dispute', payment.stripe_dispute_id)) {
      links.push({
        kind: 'dispute',
        label: 'Dispute',
        url: `https://dashboard.stripe.com/disputes/${payment.stripe_dispute_id}`,
        scope: 'platform',
      });
    }
    return links;
  }

  // An explicit but unknown model is not safe to reinterpret as either rail.
  if (payment.charge_model !== 'direct') return [];

  const links: StripeAdminLink[] = [];
  const livemode = payment.stripe_livemode;
  const modeKnown = typeof livemode === 'boolean';
  const accountId = payment.stripe_account_id;
  const connectedContext = modeKnown && typeof accountId === 'string' && STRIPE_ACCOUNT_ID.test(accountId)
    ? `https://dashboard.stripe.com/${livemode ? '' : 'test/'}${accountId}`
    : null;

  if (connectedContext && validStripeId('payment_intent', payment.stripe_payment_intent)) {
    links.push({
      kind: 'payment_intent',
      label: 'PaymentIntent · Merchant',
      url: `${connectedContext}/payments/${payment.stripe_payment_intent}`,
      scope: 'connected',
    });
  }
  if (connectedContext && validStripeId('checkout_session', payment.stripe_checkout_session)) {
    links.push({
      kind: 'checkout_session',
      label: 'Checkout Session · Merchant',
      url: `${connectedContext}/checkout/sessions/${payment.stripe_checkout_session}`,
      scope: 'connected',
    });
  }
  if (connectedContext && validStripeId('charge', payment.stripe_charge_id)) {
    links.push({
      kind: 'charge',
      label: 'Charge · Merchant',
      url: `${connectedContext}/payments/${payment.stripe_charge_id}`,
      scope: 'connected',
    });
  }
  if (connectedContext && validStripeId('dispute', payment.stripe_dispute_id)) {
    links.push({
      kind: 'dispute',
      label: 'Dispute · Merchant',
      url: `${connectedContext}/disputes/${payment.stripe_dispute_id}`,
      scope: 'connected',
    });
  }

  if (modeKnown && validStripeId('application_fee', payment.stripe_application_fee_id)) {
    const platformContext = `https://dashboard.stripe.com/${livemode ? '' : 'test/'}`;
    links.push({
      kind: 'application_fee',
      label: 'Application Fee · LGQ platform',
      url: `${platformContext}connect/application_fees/${payment.stripe_application_fee_id}`,
      scope: 'platform',
    });
  }
  return links;
}

/** Primary payment object link retained for existing callers. */
export function stripePaymentUrl(payment: AdminPaymentDetail): string | null {
  return stripeAdminLinks(payment).find((link) => (
    link.kind === 'payment_intent' || link.kind === 'checkout_session' || link.kind === 'charge'
  ))?.url ?? null;
}
