import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createOfficeMembershipForSeatGate,
  officeSeatEntitlementError,
  officeSeatEntitlementGateEnabled,
  type OfficeMembership,
} from '@/lib/billing/office-seat-entitlement';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';

const membership: OfficeMembership = {
  id: '30000000-0000-4000-8000-000000000003',
  account_id: ACCOUNT_ID,
  user_id: USER_ID,
  role: 'owner',
  created_at: '2026-08-16T00:00:00.000Z',
};

describe('dark office-seat action adapter', () => {
  it('is exact-string opt-in', () => {
    expect(officeSeatEntitlementGateEnabled({ LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED: '1' })).toBe(true);
    expect(officeSeatEntitlementGateEnabled({ LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED: 'true' })).toBe(false);
    expect(officeSeatEntitlementGateEnabled({ LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED: ' 1 ' })).toBe(false);
    expect(officeSeatEntitlementGateEnabled({})).toBe(false);
  });

  it('uses only the supplied legacy write while off and performs zero RPCs', async () => {
    const rpc = vi.fn();
    const legacyCreate = vi.fn(async () => membership);

    await expect(createOfficeMembershipForSeatGate(
      { rpc } as unknown as SupabaseClient,
      legacyCreate,
      ACCOUNT_ID,
      USER_ID,
      false,
    )).resolves.toEqual(membership);

    expect(legacyCreate).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses one atomic RPC while on and never calls the legacy writer', async () => {
    const rpc = vi.fn(async () => ({ data: membership, error: null }));
    const legacyCreate = vi.fn(async () => membership);

    await expect(createOfficeMembershipForSeatGate(
      { rpc } as unknown as SupabaseClient,
      legacyCreate,
      ACCOUNT_ID,
      USER_ID,
      true,
    )).resolves.toEqual(membership);

    expect(legacyCreate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_office_user_membership_with_seat_entitlement', {
      p_account_id: ACCOUNT_ID,
      p_user_id: USER_ID,
    });
  });

  it('renders truthful at-cap and already-over-cap errors', () => {
    expect(officeSeatEntitlementError({
      message: 'office_seat_limit_reached',
      details: JSON.stringify({ code: 'office_seat_limit_reached', active_count: 1, office_limit: 1 }),
    }).message).toBe(
      'This workspace entitlement includes 1 office-user seat, and all are in use. Remove office access or add an office seat before inviting another person.',
    );

    expect(officeSeatEntitlementError({
      message: 'office_seat_remediation_required',
      details: { code: 'office_seat_remediation_required', active_count: 7, office_limit: 5 },
    }).message).toBe(
      'This workspace has 7 office users, but its entitlement includes 5 office-user seats. Remove office access from at least 2 people, or add office seats, before inviting another.',
    );

    expect(officeSeatEntitlementError({
      message: 'office_seat_limit_reached',
      details: JSON.stringify({ code: 'office_seat_limit_reached', active_count: 0, office_limit: 0 }),
    }).message).toBe(
      'This workspace entitlement includes no office-user seats. Add an office seat before inviting another person.',
    );
  });

  it('maps unresolved office identity semantics without leaking cross-tenant details', () => {
    expect(officeSeatEntitlementError({ message: 'office_membership_role_conflict' }).message).toBe(
      'That person already belongs to this workspace in another role. Office-user promotion rules are not available yet.',
    );
    expect(officeSeatEntitlementError({ message: 'office_user_target_unavailable' }).message).toBe(
      'Office access could not be added for that person. Verify the invitation and try again.',
    );
  });

  it('fails closed on provider errors and malformed or cross-tenant RPC results', async () => {
    const unavailable = vi.fn(async () => ({
      data: null,
      error: { message: 'office_seat_entitlement_unavailable' },
    }));
    await expect(createOfficeMembershipForSeatGate(
      { rpc: unavailable } as unknown as SupabaseClient,
      vi.fn(async () => membership),
      ACCOUNT_ID,
      USER_ID,
      true,
    )).rejects.toThrow(
      'Office-user limits could not be verified, so no access was added. Try again, or contact support if this continues.',
    );

    const wrongTenant = vi.fn(async () => ({
      data: { ...membership, account_id: '40000000-0000-4000-8000-000000000004' },
      error: null,
    }));
    await expect(createOfficeMembershipForSeatGate(
      { rpc: wrongTenant } as unknown as SupabaseClient,
      vi.fn(async () => membership),
      ACCOUNT_ID,
      USER_ID,
      true,
    )).rejects.toThrow('Office-user limits could not be verified');
  });
});
