import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createCrewMemberForSeatGate,
  crewSeatEntitlementError,
  crewSeatEntitlementGateEnabled,
  setCrewActiveForSeatGate,
} from '@/lib/billing/crew-seat-entitlement';
import type { CrewMember } from '@/lib/crew';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const CREW_ID = '20000000-0000-4000-8000-000000000002';

const member: CrewMember = {
  id: CREW_ID,
  account_id: ACCOUNT_ID,
  name: 'Alex Rivera',
  phone: '(248) 555-0117',
  email: 'alex@example.com',
  role_label: 'Technician',
  hourly_rate: 30,
  photo_path: null,
  user_id: null,
  active: true,
  deleted_at: null,
  created_at: '2026-08-16T00:00:00.000Z',
};

const input = {
  name: member.name,
  phone: member.phone,
  email: '  ALEX@example.com ',
  roleLabel: member.role_label,
  hourlyRate: 30,
};

function insertClient() {
  const single = vi.fn(async () => ({ data: member, error: null }));
  const query = { select: vi.fn(() => ({ single })) };
  const insert = vi.fn(() => query);
  const from = vi.fn(() => ({ insert }));
  return { client: { from } as unknown as SupabaseClient, from, insert, single };
}

function updateClient() {
  let filters = 0;
  const eq = vi.fn(() => {
    filters += 1;
    return filters === 2 ? Promise.resolve({ error: null }) : chain;
  });
  const chain = { eq };
  const update = vi.fn(() => chain);
  const from = vi.fn(() => ({ update }));
  return { client: { from } as unknown as SupabaseClient, from, update, eq };
}

describe('dark crew-seat action adapter', () => {
  it('is exact-string opt-in', () => {
    expect(crewSeatEntitlementGateEnabled({ LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED: '1' })).toBe(true);
    expect(crewSeatEntitlementGateEnabled({ LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED: 'true' })).toBe(false);
    expect(crewSeatEntitlementGateEnabled({ LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED: ' 1 ' })).toBe(false);
    expect(crewSeatEntitlementGateEnabled({})).toBe(false);
  });

  it('uses only the trusted legacy client for post-migration employee creation while off', async () => {
    const sessionRpc = vi.fn();
    const sessionFrom = vi.fn();
    const legacy = insertClient();
    const legacyFactory = vi.fn(() => legacy.client);

    await expect(createCrewMemberForSeatGate(
      { rpc: sessionRpc, from: sessionFrom } as unknown as SupabaseClient,
      legacyFactory,
      ACCOUNT_ID,
      input,
      false,
    )).resolves.toEqual(member);

    expect(sessionRpc).not.toHaveBeenCalled();
    expect(sessionFrom).not.toHaveBeenCalled();
    expect(legacyFactory).toHaveBeenCalledTimes(1);
    expect(legacy.from).toHaveBeenCalledWith('crew');
    expect(legacy.insert).toHaveBeenCalledWith(expect.objectContaining({
      account_id: ACCOUNT_ID,
      name: member.name,
      email: 'alex@example.com',
      hourly_rate: 30,
      pay_type: 'hourly',
    }));
  });

  it('uses one atomic RPC while on and never constructs the legacy client', async () => {
    const rpc = vi.fn(async () => ({ data: member, error: null }));
    const legacyFactory = vi.fn(() => insertClient().client);

    await expect(createCrewMemberForSeatGate(
      { rpc } as unknown as SupabaseClient,
      legacyFactory,
      ACCOUNT_ID,
      input,
      true,
    )).resolves.toEqual(member);

    expect(legacyFactory).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_crew_member_with_seat_entitlement', expect.objectContaining({
      p_account_id: ACCOUNT_ID,
      p_name: member.name,
      p_email: 'alex@example.com',
      p_hourly_rate: 30,
      p_pay_type: 'hourly',
    }));
  });

  it('renders a truthful at-cap and over-cap action error', () => {
    expect(crewSeatEntitlementError({
      message: 'crew_seat_limit_reached',
      details: JSON.stringify({ code: 'crew_seat_limit_reached', active_count: 2, crew_limit: 2 }),
    }).message).toBe(
      'This workspace entitlement includes 2 active crew seats, and all are in use. Archive an active employee before adding or reactivating another.',
    );

    expect(crewSeatEntitlementError({
      message: 'crew_seat_remediation_required',
      details: { code: 'crew_seat_remediation_required', active_count: 5, crew_limit: 2 },
    }).message).toBe(
      'This workspace has 5 active employees, but its entitlement includes 2 active crew seats. Archive at least 3 employees to bring the roster within its entitlement. Adding or reactivating another also requires one open seat.',
    );

    expect(crewSeatEntitlementError({
      message: 'crew_seat_limit_reached',
      details: JSON.stringify({ code: 'crew_seat_limit_reached', active_count: 0, crew_limit: 0 }),
    }).message).toBe(
      'This workspace entitlement includes no active crew seats, so an employee cannot be added or reactivated. No roster changes were made.',
    );
  });

  it('fails closed with a useful action error when entitlement truth is unavailable', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'crew_seat_entitlement_unavailable' } }));
    await expect(createCrewMemberForSeatGate(
      { rpc } as unknown as SupabaseClient,
      vi.fn(() => insertClient().client),
      ACCOUNT_ID,
      input,
      true,
    )).rejects.toThrow(
      'Crew limits could not be verified, so no employee was added or reactivated. Try again, or contact support if this continues.',
    );
  });

  it('keeps deactivation direct and uses the RPC only for enabled reactivation', async () => {
    const direct = updateClient();
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const legacyFactory = vi.fn(() => updateClient().client);

    await expect(setCrewActiveForSeatGate(
      direct.client,
      legacyFactory,
      ACCOUNT_ID,
      CREW_ID,
      false,
      true,
    )).resolves.toBeUndefined();
    expect(direct.update).toHaveBeenCalledWith({ active: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(legacyFactory).not.toHaveBeenCalled();

    await expect(setCrewActiveForSeatGate(
      { rpc } as unknown as SupabaseClient,
      legacyFactory,
      ACCOUNT_ID,
      CREW_ID,
      true,
      true,
    )).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('reactivate_crew_member_with_seat_entitlement', {
      p_account_id: ACCOUNT_ID,
      p_crew_id: CREW_ID,
    });
    expect(legacyFactory).not.toHaveBeenCalled();
  });

  it('reactivates through the legacy update with zero RPCs while off', async () => {
    const sessionRpc = vi.fn();
    const legacy = updateClient();
    const legacyFactory = vi.fn(() => legacy.client);

    await expect(setCrewActiveForSeatGate(
      { rpc: sessionRpc } as unknown as SupabaseClient,
      legacyFactory,
      ACCOUNT_ID,
      CREW_ID,
      true,
      false,
    )).resolves.toBeUndefined();

    expect(sessionRpc).not.toHaveBeenCalled();
    expect(legacyFactory).toHaveBeenCalledTimes(1);
    expect(legacy.update).toHaveBeenCalledWith({ active: true });
  });
});
