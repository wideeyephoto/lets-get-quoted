import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export const OFFICE_SEAT_ENTITLEMENT_FLAG = 'LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED' as const;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

/** Missing, blank, `true`, and every value except the exact string `1` are off. */
export function officeSeatEntitlementGateEnabled(env: ServerEnvironment = process.env): boolean {
  return env[OFFICE_SEAT_ENTITLEMENT_FLAG] === '1';
}

export type OfficeMembership = Readonly<{
  id: string;
  account_id: string;
  user_id: string;
  /**
   * `office`, not `owner`, since 20260819090100. The original foundation made an
   * office user a second `owner` row, which collided with the partial unique
   * index `memberships_one_owner_per_user_idx`: an invitee who owned any
   * workspace could never be added, and one who owned none was handed their
   * employer's workspace as their own. `scripts/verify-office-seat-collision.mjs`
   * demonstrates both against a real PostgreSQL 17.
   *
   * `owner` is still in the union because the RPC is idempotent: handed someone
   * who already owns this workspace, it returns that existing row rather than
   * failing, since an owner already has office access. So a caller can receive
   * an owner row here, and narrowing this to `office` alone would be a lie the
   * runtime guard below would then have to enforce by rejecting a valid answer.
   */
  role: 'office' | 'owner';
  created_at: string;
}>;

type RpcError = Readonly<{
  code?: string;
  message?: string;
  details?: unknown;
}>;

type ErrorDetail = Readonly<{
  code?: unknown;
  active_count?: unknown;
  office_limit?: unknown;
}>;

function detailRecord(value: unknown): ErrorDetail | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as ErrorDetail;
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ErrorDetail : null;
  } catch {
    return null;
  }
}

function nonNegativeSafeInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function seatLabel(limit: number): string {
  return `${limit.toLocaleString('en-US')} office-user ${limit === 1 ? 'seat' : 'seats'}`;
}

/** Map stable database codes for the future team-management action surface. */
export function officeSeatEntitlementError(error: RpcError): Error {
  const detail = detailRecord(error.details);
  const code = typeof detail?.code === 'string' ? detail.code : error.message;
  const activeCount = nonNegativeSafeInteger(detail?.active_count);
  const officeLimit = nonNegativeSafeInteger(detail?.office_limit);

  if (code === 'office_seat_remediation_required') {
    if (activeCount !== null && officeLimit !== null && activeCount > officeLimit) {
      const over = activeCount - officeLimit;
      return new Error(
        `This workspace has ${activeCount.toLocaleString('en-US')} office users, but its entitlement includes ${seatLabel(officeLimit)}. Remove office access from at least ${over.toLocaleString('en-US')} ${over === 1 ? 'person' : 'people'}, or add office seats, before inviting another.`,
      );
    }
    return new Error(
      'This workspace is already above its office-user limit. Remove office access or add office seats before inviting another person.',
    );
  }

  if (code === 'office_seat_limit_reached') {
    if (officeLimit !== null) {
      if (officeLimit === 0) {
        return new Error(
          'This workspace entitlement includes no office-user seats. Add an office seat before inviting another person.',
        );
      }
      return new Error(
        `This workspace entitlement includes ${seatLabel(officeLimit)}, and all are in use. Remove office access or add an office seat before inviting another person.`,
      );
    }
    return new Error(
      'No office-user seat is available for this workspace. Remove office access or add an office seat before inviting another person.',
    );
  }

  if (code === 'office_seat_entitlement_unavailable') {
    return new Error(
      'Office-user limits could not be verified, so no access was added. Try again, or contact support if this continues.',
    );
  }

  if (code === 'office_seat_forbidden') {
    return new Error('You do not have permission to add office access to this workspace.');
  }

  if (code === 'office_membership_role_conflict') {
    return new Error(
      'That person already belongs to this workspace in another role. Office-user promotion rules are not available yet.',
    );
  }

  if (code === 'office_user_target_unavailable') {
    return new Error(
      'Office access could not be added for that person. Verify the invitation and try again.',
    );
  }

  return new Error(error.message?.trim() || 'Office access could not be added. Try again.');
}

function isOfficeMembership(value: unknown): value is OfficeMembership {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<OfficeMembership>;
  return typeof row.id === 'string'
    && typeof row.account_id === 'string'
    && typeof row.user_id === 'string'
    && (row.role === 'office' || row.role === 'owner')
    && typeof row.created_at === 'string';
}

async function createEntitledOfficeMembership(
  sessionClient: SupabaseClient,
  accountId: string,
  userId: string,
): Promise<OfficeMembership> {
  const { data, error } = await sessionClient.rpc('create_office_user_membership_with_seat_entitlement', {
    p_account_id: accountId,
    p_user_id: userId,
  });

  if (error) throw officeSeatEntitlementError(error);
  if (!isOfficeMembership(data) || data.account_id !== accountId || data.user_id !== userId) {
    throw officeSeatEntitlementError({ message: 'office_seat_entitlement_unavailable' });
  }
  return data;
}

/**
 * Future action write selector.
 *
 * Nothing calls this yet. Off is intentionally first and performs no RPC or
 * entitlement read; a future caller can preserve its then-current legacy write
 * by supplying it as `legacyCreate`. The foundation migration grants the RPC to
 * no API role, so even `enabled = true` fails closed until a separate activation
 * migration adds invitation authorization and deliberately exposes the RPC.
 */
export async function createOfficeMembershipForSeatGate(
  sessionClient: SupabaseClient,
  legacyCreate: () => Promise<OfficeMembership>,
  accountId: string,
  userId: string,
  enabled = officeSeatEntitlementGateEnabled(),
): Promise<OfficeMembership> {
  if (!enabled) return legacyCreate();
  return createEntitledOfficeMembership(sessionClient, accountId, userId);
}
