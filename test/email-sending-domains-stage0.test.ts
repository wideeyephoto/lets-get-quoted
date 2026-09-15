import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbWrites: Array<{ table: string; operation: string; data?: unknown }> = [];

const requireOfficeContextMock = vi.fn().mockResolvedValue({ accountId: 'test-account-stage0' });

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: (...args: unknown[]) => requireOfficeContextMock(...args),
  createAdminClient: () => ({
    from: (table: string) => {
      let queryType = 'select';
      return {
        select: () => {
          queryType = 'select';
          return {
            eq: () => ({
              neq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          };
        },
        insert: (payload: unknown) => {
          dbWrites.push({ table, operation: 'insert', data: payload });
          return {
            select: () => ({
              maybeSingle: async () => ({
                data: { id: 'test-row-id', ...(payload as object) },
                error: null,
              }),
            }),
          };
        },
        update: (payload: unknown) => {
          dbWrites.push({ table, operation: 'update', data: payload });
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'test-row-id', ...(payload as object) },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        },
      };
    },
  }),
}));

describe('Stage 0 — Domain Provisioning Permissions & Error Sanitization Contract', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    dbWrites.length = 0;
    vi.restoreAllMocks();
    requireOfficeContextMock.mockResolvedValue({ accountId: 'test-account-stage0' });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('Gate 2: RESEND_DOMAINS_API_KEY is preferred when both are set; RESEND_API_KEY is used when it is not', async () => {
    const { getApiKey } = await import('@/lib/resend-domains');

    process.env.RESEND_DOMAINS_API_KEY = 're_domains_full_access_key';
    process.env.RESEND_API_KEY = 're_sending_only_restricted_key';

    expect(getApiKey()).toBe('re_domains_full_access_key');

    delete process.env.RESEND_DOMAINS_API_KEY;
    process.env.RESEND_API_KEY = 're_sending_only_restricted_key';

    expect(getApiKey()).toBe('re_sending_only_restricted_key');
  });

  it('Gate 1: A 401 restricted_api_key response makes isSendingDomainProvisioningConfigured() false and writes no row', async () => {
    process.env.RESEND_DOMAINS_API_KEY = 're_restricted_key';
    process.env.RESEND_API_KEY = 're_restricted_key';

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('/domains')) {
        return new Response(
          JSON.stringify({
            statusCode: 401,
            message: 'This API key is restricted to only send emails',
            name: 'restricted_api_key',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }
      return originalFetch(input);
    });
    globalThis.fetch = fetchMock;

    try {
      const {
        isSendingDomainProvisioningConfigured,
        _resetSendingDomainConfiguredCacheForTesting,
      } = await import('@/lib/resend-domains');

      if (_resetSendingDomainConfiguredCacheForTesting) {
        _resetSendingDomainConfiguredCacheForTesting();
      }

      const configured = await isSendingDomainProvisioningConfigured();
      expect(configured).toBe(false);

      const { createEmailSendingDomainAction } = await import(
        '@/app/dashboard/settings/email-domain-actions'
      );

      await expect(
        createEmailSendingDomainAction({ domain: 'contractor-electrical.com' }),
      ).rejects.toThrow();

      expect(dbWrites.filter((w) => w.table === 'email_sending_domains')).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("Gate 3: No provider error body reaches the action's thrown message", async () => {
    process.env.RESEND_DOMAINS_API_KEY = 're_failing_key';
    process.env.RESEND_API_KEY = 're_failing_key';

    const providerRawError = JSON.stringify({
      statusCode: 401,
      message: 'This API key is restricted to only send emails',
      name: 'restricted_api_key',
    });

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      return new Response(providerRawError, {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock;

    try {
      const {
        _resetSendingDomainConfiguredCacheForTesting,
      } = await import('@/lib/resend-domains');
      if (_resetSendingDomainConfiguredCacheForTesting) {
        _resetSendingDomainConfiguredCacheForTesting();
      }

      const { createEmailSendingDomainAction } = await import(
        '@/app/dashboard/settings/email-domain-actions'
      );

      let thrownError: Error | null = null;
      try {
        await createEmailSendingDomainAction({ domain: 'contractor-plumbing.com' });
      } catch (err) {
        thrownError = err as Error;
      }

      expect(thrownError).not.toBeNull();
      const message = thrownError?.message || '';

      // Contractor-safe message assertion
      expect(message).toContain('temporarily unavailable');

      // Assert no raw provider details leak
      expect(message).not.toContain('restricted_api_key');
      expect(message).not.toContain('statusCode');
      expect(message).not.toContain('Resend API error');
      expect(message).not.toContain('{');
      expect(message).not.toContain('}');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
