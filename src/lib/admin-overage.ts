import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadOverageSummary,
  describeOverageResource,
  formatOverageTotal,
  formatOverageRate,
  remainingCapMillicents,
  type OverageSummary,
} from '@/lib/billing/overage-summary';
import { loadWorkspaceCreditLots, type WorkspaceCreditLots } from '@/lib/billing/credit-lots';
import { loadWorkspaceStorageState, formatStorageBytes, type WorkspaceStorageState } from '@/lib/billing/storage-usage';
import {
  loadActivePurchasedCapacitySubscriptions,
  loadPurchasedSeats,
  type ActivePurchasedCapacitySubscription,
  type PurchasedSeats,
} from '@/lib/billing/purchased-seats';

export {
  describeOverageResource,
  formatOverageTotal,
  formatOverageRate,
  remainingCapMillicents,
  formatStorageBytes,
};

export type AdminOverageSettlementRow = Readonly<{
  id: string;
  periodStart: string;
  periodEnd: string;
  lines: Array<{
    resource_code?: string;
    resourceCode?: string;
    units?: number;
    millicents?: number;
  }>;
  totalMillicents: number;
  chargeableCents: number;
  residualMillicents: number;
  capCentsAtClose: number | null;
  state: string;
  stripeCustomerId: string | null;
  stripeInvoiceItemId: string | null;
  lastError: string | null;
  closedAt: string;
  resolvedAt: string | null;
}>;

export type AdminOverageAccrualRow = Readonly<{
  periodStart: string;
  periodEnd: string;
  resourceCode: string;
  units: number;
  millicents: number;
  firstAccruedAt: string;
  updatedAt: string;
}>;

export type AdminOverageAuthorizationRow = Readonly<{
  id: string;
  action: 'enabled' | 'cap_changed' | 'disabled';
  capCents: number | null;
  termsVersion: string;
  termsSha256: string;
  authorizedBy: string;
  authorizedAt: string;
}>;

export type AdminAccountUsageAndOverage = Readonly<{
  summary: OverageSummary;
  creditLots: WorkspaceCreditLots;
  storageState: WorkspaceStorageState;
  purchasedSeats: PurchasedSeats;
  purchasedCapacity: readonly ActivePurchasedCapacitySubscription[];
  settlements: readonly AdminOverageSettlementRow[];
  pendingAccruals: readonly AdminOverageAccrualRow[];
  authorizations: readonly AdminOverageAuthorizationRow[];
}>;

/**
 * Loads complete usage, storage, credit lots, purchased capacity, and overage billing data
 * for staff review on the account detail page.
 */
export async function loadAdminAccountUsageAndOverage(
  admin: SupabaseClient,
  accountId: string,
): Promise<AdminAccountUsageAndOverage> {
  const [
    summary,
    creditLots,
    storageState,
    purchasedSeats,
    purchasedCapacity,
    settlementsResult,
    accrualsResult,
    authResult,
  ] = await Promise.all([
    loadOverageSummary(admin, accountId).catch(() => ({
      enabled: false,
      capCents: null,
      periodStart: null,
      periodEnd: null,
      lines: [],
      totalMillicents: 0,
      atCap: false,
      readable: false,
    })),
    loadWorkspaceCreditLots(admin, accountId).catch(() => ({ kind: 'unavailable' as const })),
    loadWorkspaceStorageState(admin, accountId).catch(() => ({
      bytesUsed: null,
      objectCount: null,
      measuredAt: null,
      limitBytes: null,
    })),
    loadPurchasedSeats(admin, accountId).catch(() => ({ crewUsers: 0, officeUsers: 0 })),
    loadActivePurchasedCapacitySubscriptions(admin, accountId).catch(() => []),
    admin
      .from('workspace_overage_settlements')
      .select('id, period_start, period_end, lines, total_millicents, chargeable_cents, residual_millicents, cap_cents_at_close, state, stripe_customer_id, stripe_invoice_item_id, last_error, closed_at, resolved_at')
      .eq('account_id', accountId)
      .order('period_start', { ascending: false })
      .limit(24),
    admin
      .from('workspace_overage_accruals')
      .select('period_start, period_end, resource_code, units, millicents, first_accrued_at, updated_at')
      .eq('account_id', accountId)
      .order('millicents', { ascending: false })
      .limit(50),
    admin
      .from('workspace_overage_authorizations')
      .select('id, action, cap_cents, terms_version, terms_sha256, authorized_by, authorized_at')
      .eq('account_id', accountId)
      .order('authorized_at', { ascending: false })
      .limit(20),
  ]);

  const settlements: AdminOverageSettlementRow[] = (settlementsResult.data ?? []).map((row) => ({
    id: String(row.id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    lines: Array.isArray(row.lines) ? (row.lines as AdminOverageSettlementRow['lines']) : [],
    totalMillicents: Number(row.total_millicents ?? 0),
    chargeableCents: Number(row.chargeable_cents ?? 0),
    residualMillicents: Number(row.residual_millicents ?? 0),
    capCentsAtClose: row.cap_cents_at_close !== null ? Number(row.cap_cents_at_close) : null,
    state: String(row.state),
    stripeCustomerId: row.stripe_customer_id ? String(row.stripe_customer_id) : null,
    stripeInvoiceItemId: row.stripe_invoice_item_id ? String(row.stripe_invoice_item_id) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    closedAt: String(row.closed_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  }));

  const pendingAccruals: AdminOverageAccrualRow[] = (accrualsResult.data ?? []).map((row) => ({
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    resourceCode: String(row.resource_code),
    units: Number(row.units ?? 0),
    millicents: Number(row.millicents ?? 0),
    firstAccruedAt: String(row.first_accrued_at),
    updatedAt: String(row.updated_at),
  }));

  const authorizations: AdminOverageAuthorizationRow[] = (authResult.data ?? []).map((row) => ({
    id: String(row.id),
    action: row.action as AdminOverageAuthorizationRow['action'],
    capCents: row.cap_cents !== null ? Number(row.cap_cents) : null,
    termsVersion: String(row.terms_version),
    termsSha256: String(row.terms_sha256),
    authorizedBy: String(row.authorized_by),
    authorizedAt: String(row.authorized_at),
  }));

  return {
    summary,
    creditLots,
    storageState,
    purchasedSeats,
    purchasedCapacity,
    settlements,
    pendingAccruals,
    authorizations,
  };
}

export type PlatformOverageOverview = Readonly<{
  totalPendingAccrualMillicents: number;
  totalPendingAccrualDollars: number;
  pendingAccrualAccountsCount: number;
  exhaustedCapsCount: number;
  exhaustedAccountIds: string[];
  failedSettlementsCount: number;
  recentSettlements: readonly {
    id: string;
    accountId: string;
    chargeableCents: number;
    state: string;
    periodEnd: string;
    closedAt: string;
  }[];
}>;

/**
 * Aggregates platform-wide overage exposure: pending un-invoiced accruals,
 * accounts hitting their overage cap, and unsettled or failed invoice items.
 */
export async function loadPlatformOverageOverview(
  admin: SupabaseClient,
): Promise<PlatformOverageOverview> {
  const [accrualsResult, settingsResult, settlementsResult] = await Promise.all([
    admin
      .from('workspace_overage_accruals')
      .select('account_id, millicents'),
    admin
      .from('workspace_overage_settings')
      .select('account_id, enabled, cap_cents')
      .eq('enabled', true),
    admin
      .from('workspace_overage_settlements')
      .select('id, account_id, chargeable_cents, state, period_end, closed_at')
      .order('closed_at', { ascending: false })
      .limit(30),
  ]);

  let totalPendingAccrualMillicents = 0;
  const accountsWithAccruals = new Set<string>();
  const accrualByAccount = new Map<string, number>();

  for (const row of accrualsResult.data ?? []) {
    const r = row as { account_id?: unknown; millicents?: unknown };
    const accId = String(r.account_id ?? '');
    const millicents = Number(r.millicents ?? 0);
    totalPendingAccrualMillicents += millicents;
    if (accId) {
      accountsWithAccruals.add(accId);
      accrualByAccount.set(accId, (accrualByAccount.get(accId) ?? 0) + millicents);
    }
  }

  const exhaustedAccountIds: string[] = [];
  for (const row of settingsResult.data ?? []) {
    const s = row as { account_id?: unknown; enabled?: unknown; cap_cents?: unknown };
    const accId = String(s.account_id ?? '');
    const capCents = Number(s.cap_cents ?? 0);
    const accruedMillicents = accrualByAccount.get(accId) ?? 0;
    if (capCents > 0 && accruedMillicents >= capCents * 1000) {
      exhaustedAccountIds.push(accId);
    }
  }

  const settlements = (settlementsResult.data ?? []).map((row) => ({
    id: String(row.id),
    accountId: String(row.account_id),
    chargeableCents: Number(row.chargeable_cents ?? 0),
    state: String(row.state),
    periodEnd: String(row.period_end),
    closedAt: String(row.closed_at),
  }));

  const failedSettlementsCount = settlements.filter((s) => s.state === 'failed' || s.state === 'indeterminate').length;

  return {
    totalPendingAccrualMillicents,
    totalPendingAccrualDollars: totalPendingAccrualMillicents / 100_000,
    pendingAccrualAccountsCount: accountsWithAccruals.size,
    exhaustedCapsCount: exhaustedAccountIds.length,
    exhaustedAccountIds,
    failedSettlementsCount,
    recentSettlements: settlements,
  };
}
