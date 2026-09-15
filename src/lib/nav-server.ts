import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthoritativeTrade } from './workspace-trade';
import {
  resolveVisibleNav,
  NAV_RAIL_ORDER,
  isNavPersonaEnabled,
  type NavSignals,
} from './nav-visibility';
import type { NavVisibilityDecision } from './nav-visibility-client';

const ONBOARDING_EVALUATION_WINDOW_DAYS = 30;

/**
 * Resolves empty sections with cheap head: true counts for crew, inventory, and recurring.
 *
 * Rules from §5 of docs/nav-phase-2-3-implementation-plan.md:
 * - Never-had-a-row, not currently-zero.
 * - Brand-new accounts within the 30-day evaluation window are never demoted.
 * - A failed count is not zero (emptySections holds only what was proven empty).
 */
export async function resolveEmptySections(
  admin: SupabaseClient,
  accountId: string,
): Promise<ReadonlySet<string>> {
  const empty = new Set<string>();

  try {
    // 1. Brand-new account evaluation window protection:
    // Accounts created within the last 30 days are exploring product capabilities.
    // Demoting on day one hides core functionality right when they are deciding whether the product does those things.
    const { data: acct } = await admin
      .from('accounts')
      .select('created_at')
      .eq('id', accountId)
      .maybeSingle();

    if (acct?.created_at) {
      const ageDays = (Date.now() - new Date(acct.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < ONBOARDING_EVALUATION_WINDOW_DAYS) {
        return empty; // Never demote for new accounts
      }
    }

    // 2. "Never had a row, not currently zero":
    // Check both live tables AND historical indicators (soft-deleted rows, recoverable deletions, audit ledger, jobs with assigned crew/recurring plans).
    const [
      crewRes,
      crewDeletedRes,
      crewAuditRes,
      inventoryToolsRes,
      inventoryVehiclesRes,
      inventoryStockRes,
      inventoryAuditRes,
      recurringRes,
      recurringJobsRes,
    ] = await Promise.allSettled([
      admin.from('crew').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
      admin.from('recoverable_deletions').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('entity_type', 'crew'),
      admin.from('tenant_audit_events').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('entity_type', 'crew'),
      admin.from('inventory_tools').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
      admin.from('inventory_vehicles').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
      admin.from('inventory_stock_items').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
      admin
        .from('tenant_audit_events')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('entity_type', [
          'inventory_tools',
          'inventory_vehicles',
          'inventory_stock_items',
          'inventory_locations',
          'inventory_tool',
          'inventory_vehicle',
          'inventory_stock_item',
          'inventory_location',
        ]),
      admin.from('recurring_plans').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
      admin.from('jobs').select('id', { count: 'exact', head: true }).eq('account_id', accountId).not('recurring_plan_id', 'is', null),
    ]);

    const hasEverHadCrew =
      (crewRes.status === 'fulfilled' && !crewRes.value.error && (crewRes.value.count ?? 0) > 0) ||
      (crewDeletedRes.status === 'fulfilled' && !crewDeletedRes.value.error && (crewDeletedRes.value.count ?? 0) > 0) ||
      (crewAuditRes.status === 'fulfilled' && !crewAuditRes.value.error && (crewAuditRes.value.count ?? 0) > 0);

    // Only demote if proven that the account has NEVER had a crew member
    if (!hasEverHadCrew && crewRes.status === 'fulfilled' && !crewRes.value.error) {
      empty.add('/dashboard/crew');
    }

    const hasEverHadInventory =
      (inventoryToolsRes.status === 'fulfilled' && !inventoryToolsRes.value.error && (inventoryToolsRes.value.count ?? 0) > 0) ||
      (inventoryVehiclesRes.status === 'fulfilled' && !inventoryVehiclesRes.value.error && (inventoryVehiclesRes.value.count ?? 0) > 0) ||
      (inventoryStockRes.status === 'fulfilled' && !inventoryStockRes.value.error && (inventoryStockRes.value.count ?? 0) > 0) ||
      (inventoryAuditRes.status === 'fulfilled' && !inventoryAuditRes.value.error && (inventoryAuditRes.value.count ?? 0) > 0);

    // Only demote if proven that the account has NEVER had inventory
    if (!hasEverHadInventory && inventoryToolsRes.status === 'fulfilled' && !inventoryToolsRes.value.error) {
      empty.add('/dashboard/inventory');
    }

    const hasEverHadRecurring =
      (recurringRes.status === 'fulfilled' && !recurringRes.value.error && (recurringRes.value.count ?? 0) > 0) ||
      (recurringJobsRes.status === 'fulfilled' && !recurringJobsRes.value.error && (recurringJobsRes.value.count ?? 0) > 0);

    // Only demote if proven that the account has NEVER had recurring plans or jobs
    if (!hasEverHadRecurring && recurringRes.status === 'fulfilled' && !recurringRes.value.error) {
      empty.add('/dashboard/recurring');
    }
  } catch (err) {
    console.error('Failed to resolve empty sections for nav:', err);
    // Failure defaults to empty set (so nothing is mistakenly demoted)
  }

  return empty;
}

/**
 * Resolves the NavSignals needed for the visibility model.
 */
export async function resolveNavSignals(
  admin: SupabaseClient,
  accountId: string,
  role: string | null,
  capabilities: ReadonlySet<string>,
): Promise<NavSignals> {
  const normalizedRole: 'owner' | 'office' = role === 'office' ? 'office' : 'owner';

  const [trade, emptySections] = await Promise.all([
    getAuthoritativeTrade(admin, accountId),
    resolveEmptySections(admin, accountId),
  ]);

  return {
    role: normalizedRole,
    can: (cap: string) => capabilities.has(cap),
    trade,
    emptySections,
  };
}

/**
 * Resolves the server-side NavVisibilityDecision.
 * If LGQ_NAV_PERSONA_ENABLED is off, returns all candidate items as visible with zero demoted/hidden.
 */
export async function resolveServerNavDecision(
  admin: SupabaseClient,
  accountId: string,
  role: string | null,
  capabilities: ReadonlySet<string>,
  candidateHrefs: readonly string[] = NAV_RAIL_ORDER,
): Promise<NavVisibilityDecision> {
  if (!isNavPersonaEnabled()) {
    return {
      visible: [...candidateHrefs],
      demoted: [],
      hiddenCount: 0,
    };
  }

  const signals = await resolveNavSignals(admin, accountId, role, capabilities);
  return resolveVisibleNav(signals, candidateHrefs);
}
