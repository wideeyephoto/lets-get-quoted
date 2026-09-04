import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireOfficeContext: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  createAdminClient: mocks.createAdminClient,
}));

import { updateMissedCallNumbersAction } from '@/app/dashboard/settings/actions';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const DEDICATED_LINE = '+18103202687';

describe('updateMissedCallNumbersAction', () => {
  let accountsUpdates: Record<string, unknown>[] = [];
  let voiceSettingsUpserts: Record<string, unknown>[] = [];
  let adminInventoryRows: Array<{ e164_number: string }> = [];
  let adminInventoryError: Error | null = null;
  let currentTrackingNumber: string | null = DEDICATED_LINE;

  const mockSupabase = {
    from(table: string) {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.maybeSingle = async () => {
        if (table === 'accounts') {
          return { data: { call_tracking_number: currentTrackingNumber }, error: null };
        }
        return { data: null, error: null };
      };
      query.update = (patch: Record<string, unknown>) => {
        return {
          eq: async () => {
            accountsUpdates.push(patch);
            return { error: null };
          },
        };
      };
      query.upsert = async (payload: Record<string, unknown>, _options?: unknown) => {
        voiceSettingsUpserts.push(payload);
        return { error: null };
      };
      return query;
    },
  };

  const mockAdmin = {
    from(table: string) {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.is = async () => {
        if (table === 'voice_number_inventory') {
          return {
            data: adminInventoryError ? null : adminInventoryRows,
            error: adminInventoryError,
          };
        }
        return { data: null, error: null };
      };
      return query;
    },
  };

  beforeEach(() => {
    accountsUpdates = [];
    voiceSettingsUpserts = [];
    adminInventoryRows = [{ e164_number: DEDICATED_LINE }];
    adminInventoryError = null;
    currentTrackingNumber = DEDICATED_LINE;

    mocks.revalidatePath.mockReset();
    mocks.requireOfficeContext.mockReset().mockResolvedValue({
      supabase: mockSupabase,
      accountId: ACCOUNT_ID,
    });
    mocks.createAdminClient.mockReset().mockReturnValue(mockAdmin);
  });

  it('throws and blocks write when attempting to change provisioned dedicated tracking number', async () => {
    await expect(
      updateMissedCallNumbersAction({
        forward: '+18103042061',
        tracking: '+18105550199', // Different number
      }),
    ).rejects.toThrow('This account has a dedicated AI Voice number provisioned.');

    expect(accountsUpdates).toHaveLength(0);
    expect(voiceSettingsUpserts).toHaveLength(0);
  });

  it('rewrites dedicated number rather than null when tracking input is cleared', async () => {
    await updateMissedCallNumbersAction({
      forward: '+18103042061',
      tracking: '', // Cleared in UI
    });

    expect(accountsUpdates).toHaveLength(1);
    expect(accountsUpdates[0]).toEqual(
      expect.objectContaining({
        call_forward_number: '+18103042061',
        call_tracking_number: DEDICATED_LINE,
      }),
    );
    expect(voiceSettingsUpserts).toHaveLength(1);
    expect(voiceSettingsUpserts[0]).toEqual({
      account_id: ACCOUNT_ID,
      transfer_number: '+18103042061',
    });
  });

  it('fails closed if voice_number_inventory query encounters an error', async () => {
    adminInventoryError = new Error('Database connection failed');

    await expect(
      updateMissedCallNumbersAction({
        forward: '+18103042061',
        tracking: '+18105550199',
      }),
    ).rejects.toThrow('Could not verify dedicated number status.');

    expect(accountsUpdates).toHaveLength(0);
  });

  it('fails closed if voice_number_inventory has multiple unreleased rows', async () => {
    adminInventoryRows = [
      { e164_number: DEDICATED_LINE },
      { e164_number: '+18103209999' },
    ];

    // Attempting to change to an arbitrary number must be rejected
    await expect(
      updateMissedCallNumbersAction({
        forward: '+18103042061',
        tracking: '+18105550199',
      }),
    ).rejects.toThrow('This account has a dedicated AI Voice number provisioned.');

    expect(accountsUpdates).toHaveLength(0);
  });

  it('synchronizes voice_settings.transfer_number via upsert even when no prior voice_settings row exists', async () => {
    await updateMissedCallNumbersAction({
      forward: '+18103042061',
      tracking: DEDICATED_LINE,
    });

    expect(voiceSettingsUpserts).toHaveLength(1);
    expect(voiceSettingsUpserts[0]).toEqual({
      account_id: ACCOUNT_ID,
      transfer_number: '+18103042061',
    });
  });

  it('clearing forward number writes null to both accounts and voice_settings', async () => {
    await updateMissedCallNumbersAction({
      forward: '',
      tracking: DEDICATED_LINE,
    });

    expect(accountsUpdates).toHaveLength(1);
    expect(accountsUpdates[0]).toEqual(
      expect.objectContaining({
        call_forward_number: null,
        call_tracking_number: DEDICATED_LINE,
      }),
    );
    expect(voiceSettingsUpserts).toHaveLength(1);
    expect(voiceSettingsUpserts[0]).toEqual({
      account_id: ACCOUNT_ID,
      transfer_number: null,
    });
  });

  it('allows setting custom tracking number when account has no dedicated line provisioned', async () => {
    adminInventoryRows = []; // No dedicated number
    currentTrackingNumber = null;

    await updateMissedCallNumbersAction({
      forward: '+18103042061',
      tracking: '+18105550188',
    });

    expect(accountsUpdates).toHaveLength(1);
    expect(accountsUpdates[0]).toEqual(
      expect.objectContaining({
        call_forward_number: '+18103042061',
        call_tracking_number: '+18105550188',
        call_tracking_verified_at: null,
      }),
    );
  });
});
