import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  OVERAGE_AUTHORIZATION_TEXT_SHA256,
  OVERAGE_AUTHORIZATION_VERSION,
  OVERAGE_CAP_MAX_CENTS,
  OVERAGE_CAP_MIN_CENTS,
} from '@/lib/billing/overage-consent';

/**
 * The one way the product writes a workspace's overage switch.
 *
 * Everything here goes through `set_workspace_overage_authorization`, which is
 * `security definer` and the only writable door into tables that are otherwise
 * owner-read/service-role-write. That is deliberate: an owner who could write
 * their own settings row could raise their own cap without leaving evidence.
 *
 * CALLED WITH THE SESSION CLIENT, NEVER THE ADMIN ONE. The function establishes
 * who is asking from `auth.uid()`, so handing it a service-role client would
 * make the owner check pass for nobody -- it would raise `overage_forbidden`
 * with a null actor. The same mistake in the other direction, a function that
 * trusted an accountId passed by an admin client, is how a workspace ends up
 * able to edit another's billing.
 */

export const OVERAGE_SELF_SERVE_FLAG = 'LGQ_OVERAGE_SELF_SERVE_ENABLED' as const;

type ServerEnvironment = Record<string, string | undefined>;

export function overageSelfServeEnabled(env: ServerEnvironment = process.env): boolean {
  return env[OVERAGE_SELF_SERVE_FLAG] === '1';
}

export type OverageAuthorizationResult =
  | { ok: true; enabled: boolean; capCents: number | null; changed: boolean }
  | { ok: false; error: string };

/**
 * Postgres speaks in codes so that copy can change without breaking a contract.
 * Anything unrecognised is reported as ours rather than echoed: a raw
 * `P0001 overage_forbidden` in front of a contractor is a leak and a puzzle.
 */
export function readableOverageError(raw: string): string {
  if (raw.includes('overage_forbidden')) {
    return 'Only the owner of this business can change extra usage.';
  }
  if (raw.includes('overage_cap_required')) {
    return 'Set a spending limit before switching extra usage on.';
  }
  if (raw.includes('overage_cap_too_large')) {
    return `That limit is higher than we can accept. Enter an amount up to ${
      (OVERAGE_CAP_MAX_CENTS / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    }.`;
  }
  // Neither is reachable from the action -- it supplies both values itself --
  // so if one surfaces, the bug is ours and saying "try again" would be a lie.
  if (raw.includes('overage_terms_missing')
    || raw.includes('overage_terms_digest_invalid')
    || raw.includes('overage_intent_required')) {
    return 'Extra usage could not be saved. This is a problem on our side.';
  }
  return 'Extra usage could not be saved. Try again in a moment.';
}

/** Whole cents, inside the range the database will accept. */
export function validateCapCents(capCents: unknown): number | null {
  if (typeof capCents !== 'number' || !Number.isFinite(capCents)) return null;
  if (!Number.isInteger(capCents)) return null;
  if (capCents < OVERAGE_CAP_MIN_CENTS || capCents > OVERAGE_CAP_MAX_CENTS) return null;
  return capCents;
}

export async function setWorkspaceOverageAuthorization(input: {
  supabase: SupabaseClient;
  accountId: string;
  enabled: boolean;
  /** Ignored when switching off; the function nulls it either way. */
  capCents: number | null;
}): Promise<OverageAuthorizationResult> {
  if (!overageSelfServeEnabled()) {
    return { ok: false, error: 'Changing extra usage from here is not switched on yet.' };
  }

  if (input.enabled) {
    const cap = validateCapCents(input.capCents);
    if (cap === null) {
      return { ok: false, error: 'Enter a spending limit as a whole dollar amount.' };
    }
  }

  const { data, error } = await input.supabase.rpc('set_workspace_overage_authorization', {
    p_account_id: input.accountId,
    p_enabled: input.enabled,
    // Sent as null when switching off, so a stale number in a form cannot end
    // up in the evidence row as a cap somebody never chose.
    p_cap_cents: input.enabled ? input.capCents : null,
    p_terms_version: OVERAGE_AUTHORIZATION_VERSION,
    p_terms_sha256: OVERAGE_AUTHORIZATION_TEXT_SHA256,
  });

  if (error) return { ok: false, error: readableOverageError(error.message ?? '') };

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    enabled: row.enabled === true,
    capCents: row.cap_cents === null || row.cap_cents === undefined ? null : Number(row.cap_cents),
    changed: row.changed === true,
  };
}
