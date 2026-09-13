import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase-admin';
import { logAdminAction, type AuditActor } from '@/lib/admin';

import {
  type CircuitBreakerService,
  type CircuitBreakerScope,
  type CircuitBreakerRow,
  CIRCUIT_BREAKER_SERVICES,
} from './circuit-breaker-types';
export * from './circuit-breaker-types';

export type CircuitBreakerCheckResult = {
  blocked: boolean;
  reason?: string;
  scope?: CircuitBreakerScope;
  trippedAt?: string;
  trippedBy?: string;
};

// In-memory micro-cache (15-second TTL) to protect high-frequency ingress paths
// (incoming SMS, voice calls, checkout creation) from redundant Postgres queries.
const CACHE_TTL_MS = 15_000;
let cachedBreakers: CircuitBreakerRow[] | null = null;
let lastCacheFetchTime = 0;

export function invalidateCircuitBreakerCache(): void {
  cachedBreakers = null;
  lastCacheFetchTime = 0;
}

async function loadActiveBreakers(client?: SupabaseClient): Promise<CircuitBreakerRow[]> {
  const now = Date.now();
  if (cachedBreakers && now - lastCacheFetchTime < CACHE_TTL_MS) {
    return cachedBreakers;
  }

  if (!client && (
    process.env.NODE_ENV === 'test' ||
    Boolean(process.env.VITEST) ||
    typeof (globalThis as Record<string, unknown>).__vitest_worker__ !== 'undefined' ||
    typeof (globalThis as Record<string, unknown>).__vitest_environment__ !== 'undefined'
  )) {
    return cachedBreakers ?? [];
  }

  const supabase = client ?? createAdminClient();
  try {
    const { data, error } = await supabase
      .from('platform_circuit_breakers')
      .select('id, service, scope, account_id, is_tripped, reason, tripped_by, tripped_at, cleared_by, cleared_at, created_at, updated_at')
      .eq('is_tripped', true);

    if (error) {
      // Degrade gracefully: do not take down ingress if the table is temporarily unreadable
      console.error('loadActiveBreakers query failed:', error.message);
      return cachedBreakers ?? [];
    }

    cachedBreakers = (data ?? []) as CircuitBreakerRow[];
    lastCacheFetchTime = now;
    return cachedBreakers;
  } catch (err) {
    console.error('loadActiveBreakers unexpected error:', err);
    return cachedBreakers ?? [];
  }
}

/**
 * Checks if a specific subsystem is blocked by an active circuit breaker.
 * Checks global scope first, then account scope if an accountId is provided.
 */
export async function checkCircuitBreaker(
  service: CircuitBreakerService,
  accountId?: string | null,
  client?: SupabaseClient,
): Promise<CircuitBreakerCheckResult> {
  const active = await loadActiveBreakers(client);

  // 1. Global kill switch wins unconditionally
  const globalBreaker = active.find((b) => b.service === service && b.scope === 'global');
  if (globalBreaker) {
    return {
      blocked: true,
      reason: globalBreaker.reason,
      scope: 'global',
      trippedAt: globalBreaker.tripped_at,
      trippedBy: globalBreaker.tripped_by,
    };
  }

  // 2. Account-specific kill switch
  if (accountId) {
    const accountBreaker = active.find(
      (b) => b.service === service && b.scope === 'account' && b.account_id === accountId,
    );
    if (accountBreaker) {
      return {
        blocked: true,
        reason: accountBreaker.reason,
        scope: 'account',
        trippedAt: accountBreaker.tripped_at,
        trippedBy: accountBreaker.tripped_by,
      };
    }
  }

  return { blocked: false };
}

/**
 * Trips a circuit breaker immediately and records an audit log row.
 */
export async function tripCircuitBreaker(
  admin: SupabaseClient,
  actor: AuditActor,
  input: {
    service: CircuitBreakerService;
    scope: CircuitBreakerScope;
    accountId?: string | null;
    reason: string;
  },
): Promise<{ success: boolean; breaker?: CircuitBreakerRow; error?: string }> {
  const trimmedReason = input.reason?.trim() || '';
  if (trimmedReason.length < 4) {
    return { success: false, error: 'A specific operational reason of at least 4 characters is required.' };
  }

  if (input.scope === 'account' && !input.accountId) {
    return { success: false, error: 'Account ID is required for an account-scoped circuit breaker.' };
  }

  const nowIso = new Date().toISOString();
  const targetAccountId = input.scope === 'account' ? input.accountId : null;

  try {
    const { data, error } = await admin
      .from('platform_circuit_breakers')
      .insert({
        service: input.service,
        scope: input.scope,
        account_id: targetAccountId,
        is_tripped: true,
        reason: trimmedReason,
        tripped_by: actor.adminEmail,
        tripped_at: nowIso,
      })
      .select()
      .single();

    if (error) {
      console.error('tripCircuitBreaker insert failed:', error.message);
      return { success: false, error: error.message };
    }

    invalidateCircuitBreakerCache();

    await logAdminAction(admin, actor, {
      action: 'circuit_breaker_trip',
      accountId: targetAccountId,
      targetType: 'circuit_breaker',
      targetId: data.id,
      reason: trimmedReason,
      after: {
        service: input.service,
        scope: input.scope,
        is_tripped: true,
      },
      meta: {
        service: input.service,
        scope: input.scope,
        tripped_by: actor.adminEmail,
      },
    });

    return { success: true, breaker: data as CircuitBreakerRow };
  } catch (err) {
    console.error('tripCircuitBreaker error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error tripping breaker' };
  }
}

/**
 * Clears an active circuit breaker, restoring normal subsystem operations.
 */
export async function clearCircuitBreaker(
  admin: SupabaseClient,
  actor: AuditActor,
  input: {
    breakerId: string;
    reason: string;
  },
): Promise<{ success: boolean; error?: string }> {
  const trimmedReason = input.reason?.trim() || '';
  if (trimmedReason.length < 4) {
    return { success: false, error: 'A clearance reason of at least 4 characters is required.' };
  }

  const nowIso = new Date().toISOString();

  try {
    const { data: existing, error: readError } = await admin
      .from('platform_circuit_breakers')
      .select('id, service, scope, account_id, is_tripped')
      .eq('id', input.breakerId)
      .maybeSingle();

    if (readError || !existing) {
      return { success: false, error: 'Circuit breaker record not found.' };
    }

    const { error: updateError } = await admin
      .from('platform_circuit_breakers')
      .update({
        is_tripped: false,
        cleared_by: actor.adminEmail,
        cleared_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', input.breakerId);

    if (updateError) {
      console.error('clearCircuitBreaker update failed:', updateError.message);
      return { success: false, error: updateError.message };
    }

    invalidateCircuitBreakerCache();

    await logAdminAction(admin, actor, {
      action: 'circuit_breaker_clear',
      accountId: existing.account_id,
      targetType: 'circuit_breaker',
      targetId: existing.id,
      reason: trimmedReason,
      before: { is_tripped: true },
      after: { is_tripped: false, cleared_at: nowIso, cleared_by: actor.adminEmail },
      meta: {
        service: existing.service,
        scope: existing.scope,
      },
    });

    return { success: true };
  } catch (err) {
    console.error('clearCircuitBreaker error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error clearing breaker' };
  }
}

/**
 * Lists circuit breakers for administrative inspection.
 */
export async function listCircuitBreakers(
  admin: SupabaseClient,
  opts: { activeOnly?: boolean; accountId?: string; limit?: number } = {},
): Promise<CircuitBreakerRow[]> {
  try {
    let query = admin
      .from('platform_circuit_breakers')
      .select('id, service, scope, account_id, is_tripped, reason, tripped_by, tripped_at, cleared_by, cleared_at, created_at, updated_at')
      .order('tripped_at', { ascending: false })
      .limit(opts.limit ?? 50);

    if (opts.activeOnly) {
      query = query.eq('is_tripped', true);
    }
    if (opts.accountId) {
      query = query.eq('account_id', opts.accountId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('listCircuitBreakers failed:', error.message);
      return [];
    }
    return (data ?? []) as CircuitBreakerRow[];
  } catch (err) {
    console.error('listCircuitBreakers error:', err);
    return [];
  }
}
