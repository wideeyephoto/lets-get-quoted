import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createCrewMember,
  crewMemberCreateColumns,
  setCrewActive,
  type CrewInput,
  type CrewMember,
} from '@/lib/crew';

export const CREW_SEAT_ENTITLEMENT_FLAG = 'LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED' as const;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

/** Missing, blank, `true`, and every value except the exact string `1` are off. */
export function crewSeatEntitlementGateEnabled(env: ServerEnvironment = process.env): boolean {
  return env[CREW_SEAT_ENTITLEMENT_FLAG] === '1';
}

type RpcError = Readonly<{
  code?: string;
  message?: string;
  details?: unknown;
}>;

type ErrorDetail = Readonly<{
  code?: unknown;
  active_count?: unknown;
  crew_limit?: unknown;
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
  return `${limit.toLocaleString('en-US')} active crew ${limit === 1 ? 'seat' : 'seats'}`;
}

/** Convert stable database codes into sentences the owner can act on. */
export function crewSeatEntitlementError(error: RpcError): Error {
  const detail = detailRecord(error.details);
  const code = typeof detail?.code === 'string' ? detail.code : error.message;
  const activeCount = nonNegativeSafeInteger(detail?.active_count);
  const crewLimit = nonNegativeSafeInteger(detail?.crew_limit);

  if (code === 'crew_seat_remediation_required') {
    if (activeCount !== null && crewLimit !== null && activeCount > crewLimit) {
      const over = activeCount - crewLimit;
      return new Error(
        `This workspace has ${activeCount.toLocaleString('en-US')} active employees, but its entitlement includes ${seatLabel(crewLimit)}. Archive at least ${over.toLocaleString('en-US')} ${over === 1 ? 'employee' : 'employees'} to bring the roster within its entitlement. Adding or reactivating another also requires one open seat.`,
      );
    }
    return new Error(
      'This workspace is already above its active crew limit. Archive active employees until it is within the entitlement before adding or reactivating another.',
    );
  }

  if (code === 'crew_seat_limit_reached') {
    if (crewLimit !== null) {
      if (crewLimit === 0) {
        return new Error(
          'This workspace entitlement includes no active crew seats, so an employee cannot be added or reactivated. No roster changes were made.',
        );
      }
      return new Error(
        `This workspace entitlement includes ${seatLabel(crewLimit)}, and all are in use. Archive an active employee before adding or reactivating another.`,
      );
    }
    return new Error(
      'No active crew seat is available for this workspace. Archive an active employee before adding or reactivating another.',
    );
  }

  if (code === 'crew_seat_entitlement_unavailable') {
    return new Error(
      'Crew limits could not be verified, so no employee was added or reactivated. Try again, or contact support if this continues.',
    );
  }

  if (code === 'crew_seat_forbidden') {
    return new Error('You do not have permission to change this crew roster.');
  }

  if (code === 'crew_member_not_found') {
    return new Error('That crew member could not be found.');
  }

  return new Error(error.message?.trim() || 'That crew member could not be saved. Try again.');
}

function isCrewMember(value: unknown): value is CrewMember {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<CrewMember>;
  return typeof row.id === 'string'
    && typeof row.account_id === 'string'
    && typeof row.name === 'string'
    && typeof row.phone === 'string'
    && row.active === true;
}

async function createEntitledCrewMember(
  sessionClient: SupabaseClient,
  accountId: string,
  input: CrewInput,
): Promise<CrewMember> {
  const values = crewMemberCreateColumns(accountId, input);
  const { data, error } = await sessionClient.rpc('create_crew_member_with_seat_entitlement', {
    p_account_id: values.account_id,
    p_name: values.name,
    p_phone: values.phone,
    p_email: values.email,
    p_role_label: values.role_label,
    p_photo_path: values.photo_path,
    p_hourly_rate: values.hourly_rate,
    p_pay_type: values.pay_type,
    p_annual_salary: values.annual_salary,
    p_day_rate: values.day_rate,
    p_payroll_id: values.payroll_id,
  });

  if (error) throw crewSeatEntitlementError(error);
  if (!isCrewMember(data) || data.account_id !== accountId) {
    throw crewSeatEntitlementError({ message: 'crew_seat_entitlement_unavailable' });
  }
  return data;
}

/**
 * Action write selector.
 *
 * Off is intentionally first and has no RPC, entitlement read, or flag-adjacent
 * database work. The trusted legacy client preserves the pre-rollout insert
 * after the migration narrows direct authenticated employee inserts. On uses
 * only the session-authenticated atomic RPC.
 */
export async function createCrewMemberForSeatGate(
  sessionClient: SupabaseClient,
  legacyClient: () => SupabaseClient,
  accountId: string,
  input: CrewInput,
  enabled = crewSeatEntitlementGateEnabled(),
): Promise<CrewMember> {
  if (!enabled) return createCrewMember(legacyClient(), accountId, input);
  return createEntitledCrewMember(sessionClient, accountId, input);
}

async function reactivateEntitledCrewMember(
  sessionClient: SupabaseClient,
  accountId: string,
  crewId: string,
): Promise<void> {
  const { data, error } = await sessionClient.rpc('reactivate_crew_member_with_seat_entitlement', {
    p_account_id: accountId,
    p_crew_id: crewId,
  });
  if (error) throw crewSeatEntitlementError(error);
  if (data !== true) throw crewSeatEntitlementError({ message: 'crew_seat_entitlement_unavailable' });
}

/** Deactivation and ordinary edits never consume a seat and remain direct. */
export async function setCrewActiveForSeatGate(
  sessionClient: SupabaseClient,
  legacyClient: () => SupabaseClient,
  accountId: string,
  crewId: string,
  active: boolean,
  enabled = crewSeatEntitlementGateEnabled(),
): Promise<void> {
  if (!active) return setCrewActive(sessionClient, accountId, crewId, false);
  if (!enabled) return setCrewActive(legacyClient(), accountId, crewId, true);
  return reactivateEntitledCrewMember(sessionClient, accountId, crewId);
}
