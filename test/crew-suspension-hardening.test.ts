import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  linkCrewUserByEmail,
  sendCrewMagicLink,
  listFieldBusinesses,
  loadCrewContext,
} from '@/lib/crew-auth';

const tables: Record<string, any> = {};
const calls: Record<string, any[]> = {};

function recordCall(table: string, op: string, payload?: any) {
  if (!calls[table]) calls[table] = [];
  calls[table].push({ op, payload });
}

function mockSupabase(role: 'admin' | 'session') {
  return {
    from: (tableName: string) => {
      const state: any = {
        _table: tableName,
        _filters: {},
        _selectCols: '*',
        _selected: null,
      };

      const chain: any = {
        select: (cols: string) => {
          state._selectCols = cols;
          return chain;
        },
        eq: (col: string, val: any) => {
          state._filters[col] = val;
          return chain;
        },
        ilike: (col: string, val: any) => {
          state._filters[col] = val;
          return chain;
        },
        is: (col: string, val: any) => {
          state._filters[`${col}:is`] = val;
          return chain;
        },
        in: (col: string, vals: any[]) => {
          state._filters[`${col}:in`] = vals;
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        update: (data: any) => {
          recordCall(tableName, 'update', data);
          return {
            eq: (col: string, val: any) => {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        upsert: (data: any, options?: any) => {
          recordCall(tableName, 'upsert', { data, options });
          return Promise.resolve({ data: null, error: null });
        },
        delete: () => {
          recordCall(tableName, 'delete', state._filters);
          return {
            eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
          };
        },
        maybeSingle: () => {
          const config = tables[tableName];
          if (typeof config === 'function') {
            return Promise.resolve(config(state, 'maybeSingle'));
          }
          if (tableName === 'accounts') {
            // Support testing fallback when time_clock_mode column doesn't exist
            if (tables['accounts:failTimeClock'] && state._selectCols.includes('time_clock_mode')) {
              return Promise.resolve({ data: null, error: { message: 'column time_clock_mode does not exist', code: '42703' } });
            }
            const accId = state._filters['id'];
            const acc = tables['accounts']?.[accId] ?? null;
            return Promise.resolve({ data: acc, error: null });
          }
          if (tableName === 'sites') {
            const accId = state._filters['account_id'];
            return Promise.resolve({ data: tables['sites']?.[accId] ?? null, error: null });
          }
          return Promise.resolve({ data: tables[tableName] ?? null, error: null });
        },
        then: (resolve: any) => {
          if (tableName === 'crew') {
            const list = tables['crew'] ?? [];
            return resolve({ data: list, error: null });
          }
          if (tableName === 'accounts') {
            const inIds = state._filters['id:in'];
            if (inIds && Array.isArray(inIds)) {
              const res = inIds.map((id: string) => tables['accounts']?.[id] || { id, suspended_at: null });
              return resolve({ data: res, error: null });
            }
            return resolve({ data: Object.values(tables['accounts'] || {}), error: null });
          }
          if (tableName === 'sites') {
            return resolve({ data: Object.values(tables['sites'] || {}), error: null });
          }
          return resolve({ data: tables[tableName] ?? [], error: null });
        },
      };

      return chain;
    },
    auth: {
      admin: {
        generateLink: vi.fn().mockResolvedValue({
          data: { properties: { hashed_token: 'valid_token_hash' } },
          error: null,
        }),
      },
      getUser: vi.fn().mockResolvedValue({
        data: { user: tables['auth:user'] ?? { id: 'user-123', email: 'crew@example.com' } },
      }),
    },
  };
}

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mockSupabase('admin'),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => mockSupabase('session'),
}));

vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: vi.fn().mockResolvedValue({ error: null }),
      };
    },
  };
});

vi.mock('@/lib/field-account', () => ({
  readFieldAccount: () => tables['field_account'] ?? null,
}));

describe('Crew Suspension Hardening', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_mock_test_key';
    for (const key of Object.keys(tables)) delete tables[key];
    for (const key of Object.keys(calls)) delete calls[key];
  });

  describe('linkCrewUserByEmail', () => {
    it('refuses to link and skips membership upsert for suspended accounts', async () => {
      tables['crew'] = [
        { id: 'crew-1', account_id: 'acc-active', email: 'crew@example.com', active: true, access_revoked_at: null, user_id: null },
        { id: 'crew-2', account_id: 'acc-suspended', email: 'crew@example.com', active: true, access_revoked_at: null, user_id: null },
      ];

      tables['accounts'] = {
        'acc-active': { id: 'acc-active', suspended_at: null },
        'acc-suspended': { id: 'acc-suspended', suspended_at: '2026-08-01T00:00:00Z' },
      };

      const linked = await linkCrewUserByEmail('user-123', 'crew@example.com');

      // Only the active account was returned
      expect(linked).toEqual(['acc-active']);

      // Memberships upsert was only called for active account, NEVER suspended account
      const membershipUpserts = calls['memberships']?.filter((c) => c.op === 'upsert') ?? [];
      expect(membershipUpserts.length).toBe(1);
      expect(membershipUpserts[0].payload.data.account_id).toBe('acc-active');
      expect(membershipUpserts[0].payload.data.user_id).toBe('user-123');
    });

    it('returns empty array and does not touch memberships if all accounts are suspended', async () => {
      tables['crew'] = [
        { id: 'crew-1', account_id: 'acc-suspended', email: 'crew@example.com', active: true, access_revoked_at: null, user_id: null },
      ];

      tables['accounts'] = {
        'acc-suspended': { id: 'acc-suspended', suspended_at: '2026-08-01T00:00:00Z' },
      };

      const linked = await linkCrewUserByEmail('user-123', 'crew@example.com');

      expect(linked).toEqual([]);
      expect(calls['memberships']).toBeUndefined();
    });
  });

  describe('sendCrewMagicLink', () => {
    it('rejects sending magic link if accountId is suspended', async () => {
      tables['accounts'] = {
        'acc-suspended': { id: 'acc-suspended', suspended_at: '2026-08-01T00:00:00Z' },
      };

      await expect(
        sendCrewMagicLink('crew@example.com', 'Suspended Co', 'acc-suspended')
      ).rejects.toThrow('Account is suspended.');
    });

    it('allows sending magic link if accountId is active and not suspended', async () => {
      tables['accounts'] = {
        'acc-active': { id: 'acc-active', suspended_at: null },
      };

      await expect(
        sendCrewMagicLink('crew@example.com', 'Active Co', 'acc-active')
      ).resolves.not.toThrow();
    });
  });

  describe('loadCrewContext & loadFieldAccountRow fallback', () => {
    it('catches suspended account even if wide select fails with time_clock_mode error', async () => {
      tables['auth:user'] = { id: 'user-123', email: 'crew@example.com' };
      tables['crew'] = [
        { id: 'crew-1', account_id: 'acc-1', email: 'crew@example.com', user_id: 'user-123', active: true, access_revoked_at: null },
      ];
      tables['accounts:failTimeClock'] = true;
      tables['accounts'] = {
        'acc-1': { id: 'acc-1', business_name: 'Suspended Business', suspended_at: '2026-08-01T00:00:00Z' },
      };

      const result = await loadCrewContext();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('suspended');
      }
    });
  });

  describe('listFieldBusinesses', () => {
    it('filters out suspended accounts from the business switcher list', async () => {
      tables['auth:user'] = { id: 'user-123', email: 'crew@example.com' };
      tables['crew'] = [
        { id: 'crew-1', account_id: 'acc-active', user_id: 'user-123', active: true, access_revoked_at: null },
        { id: 'crew-2', account_id: 'acc-suspended', user_id: 'user-123', active: true, access_revoked_at: null },
      ];
      tables['accounts'] = {
        'acc-active': { id: 'acc-active', business_name: 'Active Business', suspended_at: null },
        'acc-suspended': { id: 'acc-suspended', business_name: 'Suspended Business', suspended_at: '2026-08-01T00:00:00Z' },
      };
      tables['sites'] = {};

      const res = await listFieldBusinesses();
      expect(res).not.toBeNull();
      expect(res?.businesses.length).toBe(1);
      expect(res?.businesses[0].accountId).toBe('acc-active');
    });
  });
});
