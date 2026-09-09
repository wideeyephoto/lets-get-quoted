import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbRows: Record<string, unknown[]> = {
  email_sending_domains: [],
};

let currentAccountId = 'test-workspace-1';

const requireOfficeContextMock = vi.fn().mockImplementation(async () => ({
  accountId: currentAccountId,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: (...args: unknown[]) => requireOfficeContextMock(...args),
  createAdminClient: () => {
    return {
      from: (table: string) => {
        let op = 'select';
        let patchData: Record<string, unknown> = {};
        const filters: Record<string, unknown> = {};
        const neqFilters: Record<string, unknown> = {};

        const resolve = () => {
          const rows = (dbRows[table] || []) as Array<Record<string, unknown>>;
          const filtered = rows.filter((r) => {
            for (const [k, v] of Object.entries(filters)) {
              if (r[k] !== v) return false;
            }
            for (const [k, v] of Object.entries(neqFilters)) {
              if (r[k] === v) return false;
            }
            return true;
          });

          if (op === 'select') {
            return { data: filtered, error: null };
          }
          if (op === 'insert') {
            const newRow = { id: `row-${Date.now()}`, ...patchData };
            dbRows[table].push(newRow);
            return { data: newRow, error: null };
          }
          if (op === 'update') {
            if (filtered.length === 0) {
              return { data: null, error: null };
            }
            for (const row of filtered) {
              Object.assign(row, patchData);
            }
            return { data: filtered[0], error: null };
          }
          if (op === 'delete') {
            dbRows[table] = rows.filter((r) => !filtered.includes(r));
            return { data: null, error: null };
          }
          return { data: null, error: null };
        };

        const builder: Record<string, unknown> = {
          select() {
            return builder;
          },
          insert(payload: Record<string, unknown>) {
            op = 'insert';
            patchData = payload;
            return builder;
          },
          update(payload: Record<string, unknown>) {
            op = 'update';
            patchData = payload;
            return builder;
          },
          delete() {
            op = 'delete';
            return builder;
          },
          eq(col: string, val: unknown) {
            filters[col] = val;
            return builder;
          },
          neq(col: string, val: unknown) {
            neqFilters[col] = val;
            return builder;
          },
          ilike() {
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          maybeSingle: async () => {
            const res = resolve();
            if (Array.isArray(res.data)) {
              return { data: res.data[0] ?? null, error: res.error };
            }
            return res;
          },
          then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
            return Promise.resolve(resolve()).then(onOk, onErr);
          },
        };
        return builder;
      },
    };
  },
}));

describe('Contractor Email Sending Domains - Release Controls & Guards', () => {
  const originalEnv = { ...process.env };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    dbRows.email_sending_domains = [];
    currentAccountId = 'test-workspace-1';
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.RESEND_API_KEY = 're_test_key_123';

    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('/domains')) {
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  describe('C01: Server-Side Workspace Rollout Control', () => {
    it('isWorkspaceEligibleForSendingDomains respects allowlist in production', async () => {
      const { isWorkspaceEligibleForSendingDomains } = await import('@/lib/resend-domains');

      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      (process.env as any).NODE_ENV = 'production';
      process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST = 'ws-canary-1,ws-canary-2';

      expect(isWorkspaceEligibleForSendingDomains('ws-canary-1')).toBe(true);
      expect(isWorkspaceEligibleForSendingDomains('ws-canary-2')).toBe(true);
      expect(isWorkspaceEligibleForSendingDomains('ws-other')).toBe(false);
    });

    it('isWorkspaceEligibleForSendingDomains fails closed in production when allowlist is missing', async () => {
      const { isWorkspaceEligibleForSendingDomains } = await import('@/lib/resend-domains');

      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      (process.env as any).NODE_ENV = 'production';
      delete process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST;

      expect(isWorkspaceEligibleForSendingDomains('ws-any')).toBe(false);
    });

    it('isWorkspaceEligibleForSendingDomains supports wildcard * for all workspaces', async () => {
      const { isWorkspaceEligibleForSendingDomains } = await import('@/lib/resend-domains');

      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      (process.env as any).NODE_ENV = 'production';
      process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST = '*';

      expect(isWorkspaceEligibleForSendingDomains('ws-canary-1')).toBe(true);
      expect(isWorkspaceEligibleForSendingDomains('ws-unrelated')).toBe(true);
    });

    it('createEmailSendingDomainAction rejects non-allowlisted workspace before any provider call or DB write', async () => {
      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      (process.env as any).NODE_ENV = 'production';
      process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST = 'ws-canary-only';

      currentAccountId = 'ws-blocked';

      const { createEmailSendingDomainAction } = await import(
        '@/app/dashboard/settings/email-domain-actions'
      );

      await expect(
        createEmailSendingDomainAction({ domain: 'blocked-electric.com' }),
      ).rejects.toThrow(/limited to early access workspaces/i);

      expect(dbRows.email_sending_domains).toHaveLength(0);
    });

    it('getEmailSendingDomainAction preserves view and manage access for existing tenant domain even when enrollment is paused', async () => {
      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      (process.env as any).NODE_ENV = 'production';
      process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST = 'ws-other'; // currentAccountId not in allowlist

      currentAccountId = 'ws-existing-tenant';
      dbRows.email_sending_domains.push({
        id: 'domain-row-1',
        account_id: currentAccountId,
        domain: 'tenant-electric.com',
        status: 'verified',
      });

      const { getEmailSendingDomainAction } = await import(
        '@/app/dashboard/settings/email-domain-actions'
      );

      const res = await getEmailSendingDomainAction();
      expect(res.isEnabled).toBe(true); // Section is shown so existing tenant can view and manage
      expect(res.isEnrollmentAllowed).toBe(false); // But new enrollments are paused
      expect(res.domain?.domain).toBe('tenant-electric.com');
    });
  });

  describe('C05: Quota Bounds & Capacity Exhaustion Handling', () => {
    it('refuses to connect a second distinct sending domain for the same workspace', async () => {
      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST = '*';

      currentAccountId = 'ws-single-domain';
      dbRows.email_sending_domains.push({
        id: 'row-first',
        account_id: currentAccountId,
        domain: 'first-domain.com',
        status: 'pending',
      });

      const { createEmailSendingDomainAction } = await import(
        '@/app/dashboard/settings/email-domain-actions'
      );

      await expect(
        createEmailSendingDomainAction({ domain: 'second-domain.com' }),
      ).rejects.toThrow(/already has a sending domain configured/i);
    });
  });

  describe('C04: Durable Administrative Suspension', () => {
    it('verifyEmailSendingDomainAction refuses to verify a domain in disabled status', async () => {
      currentAccountId = 'ws-disabled';
      dbRows.email_sending_domains.push({
        id: 'domain-disabled-1',
        account_id: currentAccountId,
        domain: 'suspended-electric.com',
        provider_domain_id: 'rsd_dis_1',
        status: 'disabled',
        failure_reason: 'Administrative hold: abuse inquiry',
      });

      const { verifyEmailSendingDomainAction } = await import(
        '@/app/dashboard/settings/email-domain-actions'
      );

      await expect(
        verifyEmailSendingDomainAction('domain-disabled-1'),
      ).rejects.toThrow(/disabled and cannot be verified/i);
    });

    it('deleteEmailSendingDomainAction refuses to disconnect a domain under administrative hold', async () => {
      currentAccountId = 'ws-admin-hold';
      dbRows.email_sending_domains.push({
        id: 'domain-admin-hold-1',
        account_id: currentAccountId,
        domain: 'hold-electric.com',
        provider_domain_id: 'rsd_hold_1',
        status: 'disabled',
        failure_reason: 'Administrative hold: compliance investigation',
      });

      const { deleteEmailSendingDomainAction } = await import(
        '@/app/dashboard/settings/email-domain-actions'
      );

      await expect(
        deleteEmailSendingDomainAction('domain-admin-hold-1'),
      ).rejects.toThrow(/administrative hold and cannot be disconnected/i);
    });
  });
});
