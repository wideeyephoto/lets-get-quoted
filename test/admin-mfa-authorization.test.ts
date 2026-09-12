import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffRole } from '@/lib/staff';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  assurance: vi.fn(),
  passkeyGrant: vi.fn(),
  staffLookup: vi.fn(),
  staffInsert: vi.fn(),
  mutation: vi.fn(),
}));

let staffRow: {
  id: string;
  email: string;
  role: StaffRole;
  active: boolean;
  display_name: string | null;
} | null;

// Provider, grant-verification, and framework boundaries are mocked. Every
// test exercises the real staff lookup, role matrix, permissions, and MFA guard.
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser, mfa: { getAuthenticatorAssuranceLevel: mocks.assurance } },
  }),
}));
vi.mock('@/lib/admin-passkeys', () => ({ hasAdminPasskeyGrant: mocks.passkeyGrant }));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({
    from(name: string) {
      if (name !== 'staff') throw new Error(`Unexpected table: ${name}`);
      return {
        select: () => ({
          ilike(column: string, email: string) {
            mocks.staffLookup(column, email);
            return { maybeSingle: async () => ({ data: staffRow, error: null }) };
          },
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        insert: mocks.staffInsert,
      };
    },
  }),
  noStoreFetch: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({
  // Matches the real export: Next's own control-flow errors go back up, and
  // anything else is left for the caller's catch to handle.
  unstable_rethrow: (thrown: unknown) => {
    const digest = (thrown as { digest?: unknown })?.digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw thrown;
  },
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));

import { requireAdmin, requireMfaPermission, requireMfaPermissions, requirePermissions } from '@/lib/auth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ADMIN_EMAILS', '');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  staffRow = {
    id: 'staff-finance', email: 'finance@example.com', role: 'finance',
    active: true, display_name: 'Finance Staff',
  };
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-finance', email: 'finance@example.com' } }, error: null });
  mocks.assurance.mockResolvedValue({
    data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
    error: null,
  });
  mocks.passkeyGrant.mockResolvedValue(false);
  mocks.staffInsert.mockImplementation(() => { throw new Error('Unexpected staff provisioning'); });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function protectedRefund() {
  const context = await requireMfaPermission('money.refund');
  mocks.mutation(context.userId);
  return context;
}

describe('Admin MFA authorization', () => {
  it('loads the authenticated staff identity without requiring MFA to reach enrollment', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });

    const context = await requireAdmin();

    expect(context).toMatchObject({ userId: 'user-finance', adminEmail: 'finance@example.com', role: 'finance' });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.staffLookup).toHaveBeenCalledWith('email', 'finance@example.com');
    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(mocks.passkeyGrant).not.toHaveBeenCalled();
  });

  it.each(['aal1', null, undefined])('blocks the mutation when current assurance is %s even if MFA is enrolled', async (currentLevel) => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel, nextLevel: 'aal2' }, error: null });

    await expect(protectedRefund()).rejects.toThrow('REDIRECT:/admin/security?step_up=1&permission=money.refund');

    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it('fails closed when the provider cannot determine assurance', async () => {
    mocks.assurance.mockResolvedValue({ data: null, error: new Error('Provider unavailable') });

    await expect(protectedRefund()).rejects.toThrow('REDIRECT:/admin/security?step_up=1&permission=money.refund');

    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it('accepts a grant independently verified against the current live session when provider assurance is unavailable', async () => {
    mocks.assurance.mockResolvedValue({ data: null, error: new Error('Assurance unavailable') });
    mocks.passkeyGrant.mockResolvedValue(true);

    await protectedRefund();

    expect(mocks.passkeyGrant).toHaveBeenCalledOnce();
    expect(mocks.mutation).toHaveBeenCalledWith('user-finance');
  });

  it('fails closed when the provider returns no assurance data and there is no application grant', async () => {
    mocks.assurance.mockResolvedValue({ data: null, error: null });

    await expect(protectedRefund()).rejects.toThrow('REDIRECT:/admin/security?step_up=1&permission=money.refund');

    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it('does not execute the mutation when the provider throws', async () => {
    mocks.assurance.mockRejectedValueOnce(new Error('Connection interrupted'));

    await expect(protectedRefund()).rejects.toThrow('Connection interrupted');

    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it.each(['totp', 'webauthn'])('accepts provider AAL2 from %s while preserving the authorized account and permission', async (method) => {
    mocks.assurance.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [{ method, timestamp: 1 }] },
      error: null,
    });

    const context = await protectedRefund();

    expect(context).toMatchObject({ userId: 'user-finance', role: 'finance', permission: 'money.refund' });
    expect(mocks.mutation).toHaveBeenCalledOnce();
    expect(mocks.mutation).toHaveBeenCalledWith('user-finance');
    expect(mocks.passkeyGrant).not.toHaveBeenCalled();
  });

  it('accepts an independently verified application passkey grant for the resolved staff account at provider AAL1', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    mocks.passkeyGrant.mockResolvedValue(true);

    const context = await protectedRefund();

    expect(mocks.passkeyGrant).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-finance', adminEmail: 'finance@example.com', permission: 'money.refund' }),
      expect.objectContaining({ auth: expect.objectContaining({ getUser: mocks.getUser }) }),
    );
    expect(context.permission).toBe('money.refund');
    expect(mocks.mutation).toHaveBeenCalledOnce();
    expect(mocks.mutation).toHaveBeenCalledWith('user-finance');
  });

  it('blocks AAL1 if application passkey assurance cannot be verified', async () => {
    mocks.assurance.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });
    mocks.passkeyGrant.mockRejectedValueOnce(new Error('Grant lookup unavailable'));

    await expect(protectedRefund()).rejects.toThrow();

    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it('does not substitute a WebAuthn authentication-method label for provider AAL2', async () => {
    mocks.assurance.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [{ method: 'webauthn', timestamp: 1 }] },
      error: null,
    });

    await expect(protectedRefund()).rejects.toThrow('REDIRECT:/admin/security');

    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it.each([null, { id: 'user-without-email' }])('denies an absent authenticated staff identity (%j)', async (user) => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(protectedRefund()).rejects.toThrow('NOT_FOUND');

    expect(mocks.staffLookup).not.toHaveBeenCalled();
    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(mocks.passkeyGrant).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it('denies a signed-in nonstaff account and does not provision it', async () => {
    staffRow = null;

    await expect(protectedRefund()).rejects.toThrow('NOT_FOUND');

    expect(mocks.staffInsert).not.toHaveBeenCalled();
    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(mocks.passkeyGrant).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it('denies inactive staff even when the bootstrap allowlist grants super_admin', async () => {
    staffRow!.active = false;
    vi.stubEnv('ADMIN_EMAILS', 'finance@example.com:super_admin');

    await expect(protectedRefund()).rejects.toThrow('NOT_FOUND');

    expect(mocks.staffInsert).not.toHaveBeenCalled();
    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(mocks.passkeyGrant).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it('denies insufficient permissions before checking an otherwise verified MFA session', async () => {
    staffRow!.role = 'ops';
    mocks.passkeyGrant.mockResolvedValue(true);

    await expect(protectedRefund()).rejects.toThrow('does not include "money.refund"');

    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(mocks.passkeyGrant).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });

  it.each(['finance', 'risk'] as const)('requires every permission for a cross-boundary action, including at AAL2 (%s)', async (role) => {
    staffRow!.role = role;

    await expect(requirePermissions('money.refund', 'account.enforce')).rejects.toThrow('does not include');
    await expect(requireMfaPermissions('money.refund', 'account.enforce')).rejects.toThrow('does not include');

    expect(mocks.assurance).not.toHaveBeenCalled();
    expect(mocks.passkeyGrant).not.toHaveBeenCalled();
  });

  it('requires step-up after all permissions pass and records both permissions on success', async () => {
    staffRow!.role = 'super_admin';
    mocks.assurance.mockResolvedValueOnce({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });

    await expect(requireMfaPermissions('money.refund', 'account.enforce')).rejects.toThrow(
      'REDIRECT:/admin/security?step_up=1&permission=money.refund%20%2B%20account.enforce',
    );
    await expect(requireMfaPermissions('money.refund', 'account.enforce')).resolves.toMatchObject({
      userId: 'user-finance', permission: 'money.refund + account.enforce', role: 'super_admin',
    });
  });
});
