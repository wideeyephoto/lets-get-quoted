import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbRows: Record<string, unknown[]> = {
  email_sending_domains: [],
};

let currentAccountId = 'test-workspace-1';
let beforeUpdate: (() => void) | undefined;

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
            return { data: filtered.map((row) => ({ ...row })), error: null };
          }
          if (op === 'insert') {
            if (rows.some((row) => row.account_id === patchData.account_id || row.domain === patchData.domain)) {
              return { data: null, error: { code: '23505', message: 'Domain reservation already exists' } };
            }
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
            beforeUpdate?.();
            beforeUpdate = undefined;
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
          is(col: string, val: unknown) {
            filters[col] = val;
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
    beforeUpdate = undefined;
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

    it.each(['true', 'false'])('keeps existing domains manageable with global flag %s and enrollment paused', async (enabled) => {
      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = enabled;
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
    it('reserves the workspace before provider creation and allows only one concurrent connection', async () => {
      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST = '*';
      const providerCreates: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST' && input.toString().endsWith('/domains')) {
          const { name } = JSON.parse(init.body as string);
          providerCreates.push(name);
          expect(dbRows.email_sending_domains).toHaveLength(1);
          expect(dbRows.email_sending_domains[0]).toMatchObject({
            account_id: currentAccountId, domain: name, status: 'pending',
            failure_reason: 'PROVISIONING_PENDING: Connecting to provider.',
          });
          return new Response(JSON.stringify({ id: 'rsd_reserved', name, status: 'not_started', records: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      const { createEmailSendingDomainAction } = await import('@/app/dashboard/settings/email-domain-actions');
      const results = await Promise.allSettled([
        createEmailSendingDomainAction({ domain: 'first-race.com' }),
        createEmailSendingDomainAction({ domain: 'second-race.com' }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect(providerCreates).toHaveLength(1);
      expect(dbRows.email_sending_domains).toHaveLength(1);
      expect(dbRows.email_sending_domains[0]).toMatchObject({ provider_domain_id: 'rsd_reserved', status: 'pending' });
    });

    it('retains a recoverable failed reservation when provider capacity is exhausted', async () => {
      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST = '*';
      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Domain quota exceeded' }), { status: 422 }));
      const { createEmailSendingDomainAction } = await import('@/app/dashboard/settings/email-domain-actions');
      await expect(createEmailSendingDomainAction({ domain: 'capacity-test.com' })).rejects.toThrow(/capacity limit/);
      expect(dbRows.email_sending_domains).toHaveLength(1);
      expect(dbRows.email_sending_domains[0]).toMatchObject({ status: 'failed', failure_reason: expect.stringContaining('PROVISIONING_FAILED:') });
    });

    it('removes a newly created provider binding if the owner disconnects during provisioning', async () => {
      process.env.LGQ_EMAIL_SENDING_DOMAINS_ENABLED = 'true';
      process.env.LGQ_EMAIL_SENDING_DOMAINS_WORKSPACE_ALLOWLIST = '*';
      const deleted: string[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          dbRows.email_sending_domains = [];
          return new Response(JSON.stringify({ id: 'rsd_unsaved', name: 'disconnect-race.com', status: 'not_started', records: [] }), { status: 200 });
        }
        if (init?.method === 'DELETE') deleted.push(input.toString());
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      const { createEmailSendingDomainAction } = await import('@/app/dashboard/settings/email-domain-actions');
      await expect(createEmailSendingDomainAction({ domain: 'disconnect-race.com' })).rejects.toThrow(/changed while connecting/);
      expect(deleted).toEqual(['https://api.resend.com/domains/rsd_unsaved']);
      expect(dbRows.email_sending_domains).toHaveLength(0);
    });

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
    it('preserves an administrative hold applied during a cleanup retry', async () => {
      const row = {
        id: 'racing-cleanup', account_id: currentAccountId, domain: 'held.example',
        provider_domain_id: 'rsd_held', status: 'disabled', failure_reason: 'CLEANUP_PENDING: retry',
      };
      dbRows.email_sending_domains.push(row);
      beforeUpdate = () => { row.failure_reason = 'Administrative hold: review'; };
      const { deleteEmailSendingDomainAction } = await import('@/app/dashboard/settings/email-domain-actions');
      await expect(deleteEmailSendingDomainAction(row.id)).rejects.toThrow(/changed while disconnecting/);
      expect(row.failure_reason).toBe('Administrative hold: review');
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(dbRows.email_sending_domains).toEqual([row]);
    });

    it('disables custom sending before provider deletion and retains recovery state on provider failure', async () => {
      const row = {
        id: 'disconnect-row', account_id: currentAccountId, domain: 'disconnect.example',
        provider_domain_id: 'rsd_disconnect', status: 'verified', failure_reason: null,
      };
      dbRows.email_sending_domains.push(row);
      globalThis.fetch = vi.fn(async () => {
        expect(row.status).toBe('disabled');
        expect(row.failure_reason).toMatch(/^CLEANUP_PENDING:/);
        return new Response('{}', { status: 503 });
      });
      const { deleteEmailSendingDomainAction } = await import('@/app/dashboard/settings/email-domain-actions');
      await expect(deleteEmailSendingDomainAction(row.id)).rejects.toThrow(/disabled instead/);
      expect(dbRows.email_sending_domains).toEqual([row]);
      expect(row.status).toBe('disabled');
    });

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
