'use server';

import { revalidatePath } from 'next/cache';
import { requireMfaPermission } from '@/lib/auth';
import {
  tripCircuitBreaker,
  clearCircuitBreaker,
  type CircuitBreakerService,
  type CircuitBreakerScope,
} from '@/lib/circuit-breaker';

export type CircuitBreakerActionResult = {
  success: boolean;
  message: string;
};

export async function tripCircuitBreakerAction(
  service: CircuitBreakerService,
  scope: CircuitBreakerScope,
  accountId: string | null,
  reason: string,
): Promise<CircuitBreakerActionResult> {
  // Permission gate based on scope
  const requiredPermission = scope === 'global' ? 'ops.manage' : 'account.enforce';
  const ctx = await requireMfaPermission(requiredPermission);

  const result = await tripCircuitBreaker(ctx.admin, ctx, {
    service,
    scope,
    accountId,
    reason,
  });

  if (!result.success) {
    return { success: false, message: result.error || 'Failed to trip circuit breaker.' };
  }

  revalidatePath('/admin/health');
  revalidatePath('/admin');
  if (accountId) {
    revalidatePath(`/admin/accounts/${accountId}`);
  }

  return {
    success: true,
    message: `${scope === 'global' ? 'Global' : 'Account'} circuit breaker for ${service} is now active.`,
  };
}

export async function clearCircuitBreakerAction(
  breakerId: string,
  reason: string,
): Promise<CircuitBreakerActionResult> {
  const ctx = await requireMfaPermission('ops.manage');

  const result = await clearCircuitBreaker(ctx.admin, ctx, {
    breakerId,
    reason,
  });

  if (!result.success) {
    return { success: false, message: result.error || 'Failed to clear circuit breaker.' };
  }

  revalidatePath('/admin/health');
  revalidatePath('/admin');

  return {
    success: true,
    message: 'Circuit breaker cleared. Normal service operation restored.',
  };
}
