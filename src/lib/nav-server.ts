import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthoritativeTrade } from './workspace-trade';
import {
  resolveVisibleNav,
  NAV_RAIL_ORDER,
  isNavPersonaEnabled,
  type NavSignals,
} from './nav-visibility';
import type { NavVisibilityDecision } from './nav-visibility-client';

/**
 * Resolves empty sections with cheap head: true counts for crew, inventory, and recurring.
 *
 * Rules from §5 of docs/nav-phase-2-3-implementation-plan.md:
 * - Never-had-a-row, not currently-zero.
 * - A failed count is not zero (emptySections holds only what was proven empty).
 */
export async function resolveEmptySections(
  admin: SupabaseClient,
  accountId: string,
): Promise<ReadonlySet<string>> {
  const empty = new Set<string>();

  try {
    const [crewRes, inventoryRes, recurringRes] = await Promise.allSettled([
      admin.from('crew').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
      admin.from('inventory_tools').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
      admin.from('recurring_plans').select('id', { count: 'exact', head: true }).eq('account_id', accountId),
    ]);

    if (crewRes.status === 'fulfilled' && !crewRes.value.error && crewRes.value.count === 0) {
      empty.add('/dashboard/crew');
    }

    if (inventoryRes.status === 'fulfilled' && !inventoryRes.value.error && inventoryRes.value.count === 0) {
      empty.add('/dashboard/inventory');
    }

    if (recurringRes.status === 'fulfilled' && !recurringRes.value.error && recurringRes.value.count === 0) {
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
