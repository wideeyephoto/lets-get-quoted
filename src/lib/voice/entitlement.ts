import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The one server-side answer to "may this workspace use AI Voice?"
 *
 * `voice_concurrent_calls` is capacity, not entitlement. Every base plan has a
 * value there so the catalog can describe the launch shape; treating it as the
 * purchase gate made every workspace entitled as soon as the global flag was
 * switched on. A workspace is entitled only when its base plan explicitly
 * includes voice or it has active recurring voice capacity.
 */

export type VoiceEntitlement = Readonly<{
  /** False means the billing source could not be read, not "not purchased". */
  available: boolean;
  enabled: boolean;
  source: 'included' | 'add_on' | 'none';
  concurrentCalls: number;
  historyDays: number;
  advancedRouting: boolean;
  planCode?: string;
}>;

const NONE: VoiceEntitlement = Object.freeze({
  available: true,
  enabled: false,
  source: 'none',
  concurrentCalls: 0,
  historyDays: 0,
  advancedRouting: false,
});

const UNKNOWN: VoiceEntitlement = Object.freeze({
  available: false,
  enabled: false,
  source: 'none',
  concurrentCalls: 0,
  historyDays: 0,
  advancedRouting: false,
});

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonNegativeInteger(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0
    ? parsed
    : 0;
}

export async function loadVoiceEntitlement(
  admin: SupabaseClient,
  accountId: string,
): Promise<VoiceEntitlement> {
  try {
    const { data, error } = await admin
      .from('workspace_entitlements')
      .select('plan_code, entitlement_state, feature_limits, feature_flags')
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      console.error('voice entitlement read failed:', error.message ?? error);
      return UNKNOWN;
    }
    if (!data) return NONE;

    const row = data as Record<string, unknown>;
    // Restricted and archived workspaces are not allowed to start a new
    // variable-cost provider session. Grace remains usable, matching the rest
    // of the subscription entitlement rail.
    if (row.entitlement_state !== 'active' && row.entitlement_state !== 'grace') return NONE;

    const limits = object(row.feature_limits);
    const flags = object(row.feature_flags);
    const included = flags.voice_included === true
      && nonNegativeInteger(limits.voice_included_minutes) > 0;

    let purchased = 0;
    const { data: purchasedData, error: purchasedError } = await admin.rpc(
      'workspace_purchased_capacity_units',
      { p_account_id: accountId, p_resource_code: 'voice_minutes' },
    );
    if (purchasedError) {
      // Included voice remains usable if the add-on read is temporarily
      // unavailable. A non-included workspace fails closed.
      console.error('purchased voice entitlement read failed:', purchasedError.message ?? purchasedError);
      if (!included) return UNKNOWN;
    } else {
      purchased = nonNegativeInteger(purchasedData);
    }

    const enabled = included || purchased > 0;
    if (!enabled) return NONE;

    const planCode = typeof row.plan_code === 'string' ? row.plan_code.toLowerCase().trim() : '';

    return Object.freeze({
      available: true,
      enabled: true,
      source: included ? 'included' as const : 'add_on' as const,
      concurrentCalls: nonNegativeInteger(limits.voice_concurrent_calls),
      historyDays: nonNegativeInteger(limits.voice_history_days),
      // Do not expose a catalog promise as a working product feature. This is
      // true only for an entitled workspace and is consumed when advanced
      // routing itself exists.
      advancedRouting: flags.voice_advanced_routing === true,
      planCode: planCode || undefined,
    });
  } catch (error) {
    console.error('voice entitlement read threw:', error);
    return UNKNOWN;
  }
}
