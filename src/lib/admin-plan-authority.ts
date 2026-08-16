/**
 * Read models for the admin console's billing authority.
 *
 * `accounts.plan` and `accounts.subscription_status` are legacy migration
 * fields. They are intentionally absent here: an admin surface must never turn
 * either one into an effective plan or fee. These normalizers accept only the
 * immutable values stored by the entitlement/subscription snapshots and fail
 * closed when a row is missing or malformed.
 */

export const ADMIN_PLAN_CODES = ['flex', 'solo', 'growth', 'scale', 'enterprise'] as const;
export type AdminPlanCode = (typeof ADMIN_PLAN_CODES)[number];

export const ADMIN_BILLING_INTERVALS = ['none', 'monthly', 'annual'] as const;
export type AdminBillingInterval = (typeof ADMIN_BILLING_INTERVALS)[number];

export const ADMIN_BILLING_STATUSES = ['free', 'trialing', 'active', 'past_due', 'paused', 'canceled'] as const;
export type AdminBillingStatus = (typeof ADMIN_BILLING_STATUSES)[number];

export const ADMIN_ENTITLEMENT_STATES = ['active', 'grace', 'restricted', 'archived'] as const;
export type AdminEntitlementState = (typeof ADMIN_ENTITLEMENT_STATES)[number];

export const ADMIN_SUBSCRIPTION_STATUSES = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;
export type AdminSubscriptionStatus = (typeof ADMIN_SUBSCRIPTION_STATUSES)[number];

const PLAN_NAMES: Readonly<Record<AdminPlanCode, string>> = {
  flex: 'Flex',
  solo: 'Solo',
  growth: 'Growth',
  scale: 'Scale',
  enterprise: 'Enterprise',
};

export type AdminEntitlementSnapshot = Readonly<{
  planCode: AdminPlanCode;
  planName: string;
  billingInterval: AdminBillingInterval;
  billingStatus: AdminBillingStatus;
  entitlementState: AdminEntitlementState;
  catalogVersion: string;
  platformFeeBps: number;
  periodStart: string | null;
  periodEnd: string | null;
  version: number;
  effectiveAt: string;
  updatedAt: string;
}>;

export type AdminSubscriptionSnapshot = Readonly<{
  planCode: Exclude<AdminPlanCode, 'flex'>;
  planName: string;
  billingInterval: Exclude<AdminBillingInterval, 'none'>;
  status: AdminSubscriptionStatus;
  catalogVersion: string;
  platformFeeBps: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  updatedAt: string;
}>;

export type AdminSnapshotRead<T> =
  | Readonly<{ kind: 'ready'; snapshot: T }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'unavailable' }>;

type EntitlementRow = {
  account_id: unknown;
  plan_code: unknown;
  billing_interval: unknown;
  billing_status: unknown;
  entitlement_state: unknown;
  catalog_version: unknown;
  platform_fee_bps: unknown;
  period_start: unknown;
  period_end: unknown;
  version: unknown;
  effective_at: unknown;
  updated_at: unknown;
};

type SubscriptionRow = {
  account_id: unknown;
  plan_code: unknown;
  billing_interval: unknown;
  status: unknown;
  catalog_version: unknown;
  platform_fee_bps: unknown;
  current_period_start: unknown;
  current_period_end: unknown;
  cancel_at_period_end: unknown;
  cancel_at: unknown;
  canceled_at: unknown;
  ended_at: unknown;
  updated_at: unknown;
};

function memberOf<const T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeInteger(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number'
    && Number.isSafeInteger(parsed)
    && parsed >= minimum
    && parsed <= maximum
    ? parsed
    : null;
}

function requiredIso(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? value : null;
}

function optionalIso(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return requiredIso(value) ?? undefined;
}

export function normalizeAdminEntitlementSnapshot(
  input: unknown,
  accountId: string,
): AdminSnapshotRead<AdminEntitlementSnapshot> {
  if (input === null || input === undefined) return { kind: 'missing' };
  if (typeof input !== 'object' || Array.isArray(input)) return { kind: 'unavailable' };
  const row = input as EntitlementRow;
  if (row.account_id !== accountId) return { kind: 'unavailable' };
  if (!memberOf(ADMIN_PLAN_CODES, row.plan_code)) return { kind: 'unavailable' };
  if (!memberOf(ADMIN_BILLING_INTERVALS, row.billing_interval)) return { kind: 'unavailable' };
  if (!memberOf(ADMIN_BILLING_STATUSES, row.billing_status)) return { kind: 'unavailable' };
  if (!memberOf(ADMIN_ENTITLEMENT_STATES, row.entitlement_state)) return { kind: 'unavailable' };

  // These cross-field invariants keep a corrupt snapshot from being presented
  // as a real paid grant. A canceled paid entitlement may retain its historical
  // monthly/annual interval, but Flex is always the non-subscription plan.
  if (row.plan_code === 'flex' && (row.billing_interval !== 'none' || row.billing_status !== 'free')) {
    return { kind: 'unavailable' };
  }
  if (row.plan_code !== 'flex' && row.billing_interval === 'none') return { kind: 'unavailable' };

  const catalogVersion = nonEmptyString(row.catalog_version);
  const platformFeeBps = safeInteger(row.platform_fee_bps, 0, 10_000);
  const periodStart = optionalIso(row.period_start);
  const periodEnd = optionalIso(row.period_end);
  const version = safeInteger(row.version, 1, Number.MAX_SAFE_INTEGER);
  const effectiveAt = requiredIso(row.effective_at);
  const updatedAt = requiredIso(row.updated_at);
  if (
    !catalogVersion
    || platformFeeBps === null
    || periodStart === undefined
    || periodEnd === undefined
    || version === null
    || !effectiveAt
    || !updatedAt
    || (periodStart !== null && periodEnd !== null && Date.parse(periodEnd) <= Date.parse(periodStart))
  ) {
    return { kind: 'unavailable' };
  }

  return {
    kind: 'ready',
    snapshot: Object.freeze({
      planCode: row.plan_code,
      planName: PLAN_NAMES[row.plan_code],
      billingInterval: row.billing_interval,
      billingStatus: row.billing_status,
      entitlementState: row.entitlement_state,
      catalogVersion,
      platformFeeBps,
      periodStart,
      periodEnd,
      version,
      effectiveAt,
      updatedAt,
    }),
  };
}

export function normalizeAdminSubscriptionSnapshot(
  input: unknown,
  accountId: string,
): AdminSnapshotRead<AdminSubscriptionSnapshot> {
  if (input === null || input === undefined) return { kind: 'missing' };
  if (typeof input !== 'object' || Array.isArray(input)) return { kind: 'unavailable' };
  const row = input as SubscriptionRow;
  if (row.account_id !== accountId) return { kind: 'unavailable' };
  if (!memberOf(ADMIN_PLAN_CODES, row.plan_code) || row.plan_code === 'flex') return { kind: 'unavailable' };
  if (!memberOf(ADMIN_BILLING_INTERVALS, row.billing_interval) || row.billing_interval === 'none') {
    return { kind: 'unavailable' };
  }
  if (!memberOf(ADMIN_SUBSCRIPTION_STATUSES, row.status)) return { kind: 'unavailable' };

  const catalogVersion = nonEmptyString(row.catalog_version);
  const platformFeeBps = safeInteger(row.platform_fee_bps, 0, 10_000);
  const currentPeriodStart = optionalIso(row.current_period_start);
  const currentPeriodEnd = optionalIso(row.current_period_end);
  const cancelAt = optionalIso(row.cancel_at);
  const canceledAt = optionalIso(row.canceled_at);
  const endedAt = optionalIso(row.ended_at);
  const updatedAt = requiredIso(row.updated_at);
  if (
    !catalogVersion
    || platformFeeBps === null
    || currentPeriodStart === undefined
    || currentPeriodEnd === undefined
    || typeof row.cancel_at_period_end !== 'boolean'
    || cancelAt === undefined
    || canceledAt === undefined
    || endedAt === undefined
    || !updatedAt
    || (
      currentPeriodStart !== null
      && currentPeriodEnd !== null
      && Date.parse(currentPeriodEnd) <= Date.parse(currentPeriodStart)
    )
  ) {
    return { kind: 'unavailable' };
  }

  return {
    kind: 'ready',
    snapshot: Object.freeze({
      planCode: row.plan_code,
      planName: PLAN_NAMES[row.plan_code],
      billingInterval: row.billing_interval,
      status: row.status,
      catalogVersion,
      platformFeeBps,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      cancelAt,
      canceledAt,
      endedAt,
      updatedAt,
    }),
  };
}

export function formatPlatformFeeBps(bps: number): string {
  return `${bps.toLocaleString('en-US')} bps (${(bps / 100).toFixed(2)}%)`;
}
