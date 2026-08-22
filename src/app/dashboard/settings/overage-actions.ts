'use server';

import { revalidatePath } from 'next/cache';

import { recordAccountEvent } from '@/lib/account-events';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import {
  setWorkspaceOverageAuthorization,
  type OverageAuthorizationResult,
} from '@/lib/billing/overage-authorization';
import { OVERAGE_CAP_MAX_CENTS, OVERAGE_CAP_MIN_CENTS } from '@/lib/billing/overage-consent';
import { checkRateLimitStrict } from '@/lib/rate-limit';

export type OverageActionState = OverageAuthorizationResult | null;

/**
 * A server action is a public endpoint, so the session and the workspace scope
 * are re-established here rather than trusted from the form that rendered.
 *
 * THE ROLLOUT FLAG IS NOT CHECKED HERE, deliberately. It lives inside
 * `setWorkspaceOverageAuthorization`, which is the operation -- the same lesson
 * the cancellation flag taught, where a check on the wrapper turned out to gate
 * one route to an effect rather than the effect. A second check here would be a
 * second thing to keep in step for no extra safety.
 *
 * DOLLARS IN, CENTS OUT, CONVERTED ONCE. The contractor types dollars and the
 * database stores cents, and every place that conversion is repeated is a place
 * it can be forgotten. It happens here and nowhere else -- the client sends what
 * was typed, the RPC receives cents.
 */
export async function setOverageAuthorizationAction(
  enabled: unknown,
  capDollars: unknown,
): Promise<OverageAuthorizationResult> {
  if (typeof enabled !== 'boolean') {
    return { ok: false, error: 'Extra usage could not be saved. This is a problem on our side.' };
  }

  let capCents: number | null = null;
  if (enabled) {
    const dollars = typeof capDollars === 'number' ? capDollars : Number(String(capDollars ?? '').trim());
    if (!Number.isFinite(dollars)) {
      return { ok: false, error: 'Enter a spending limit, like 50.' };
    }
    // Rounded, not truncated: somebody typing 12.005 gets 1201 rather than a
    // silently different number from the one on their screen.
    capCents = Math.round(dollars * 100);
    if (capCents < OVERAGE_CAP_MIN_CENTS) {
      return { ok: false, error: 'Enter a spending limit above zero.' };
    }
    if (capCents > OVERAGE_CAP_MAX_CENTS) {
      return {
        ok: false,
        error: `That limit is higher than we can accept. Enter an amount up to $${
          (OVERAGE_CAP_MAX_CENTS / 100).toLocaleString('en-US')}.`,
      };
    }
  }

  const { supabase, accountId, userId, userEmail } = await requireOwnerContext();
  const admin = createAdminClient();

  // Each save writes an append-only evidence row, so the limit is about somebody
  // hammering the audit trail rather than about cost.
  const allowed = await checkRateLimitStrict(admin, `overage-authorization:${userId}`, 10, 10 * 60);
  if (!allowed) {
    return { ok: false, error: 'Too many changes just now. Wait a few minutes and try again.' };
  }

  // The SESSION client, not `admin`: the function reads auth.uid() to decide
  // whether this person owns the workspace, and a service-role client presents
  // no user at all.
  const result = await setWorkspaceOverageAuthorization({
    supabase, accountId, enabled, capCents,
  });

  // Only a real change is worth a line in the owner's activity feed. The
  // database already declined to write evidence for a no-op; recording one here
  // anyway would put the two records out of step.
  if (result.ok && result.changed) {
    await recordAccountEvent({
      accountId,
      kind: 'overage_authorization_changed',
      summary: result.enabled
        ? `Extra usage switched on with a $${((result.capCents ?? 0) / 100).toLocaleString('en-US')} limit`
        : 'Extra usage switched off',
      actorEmail: userEmail ?? null,
      meta: { enabled: result.enabled, cap_cents: result.capCents },
    });
    revalidatePath('/dashboard/settings');
  }

  return result;
}
