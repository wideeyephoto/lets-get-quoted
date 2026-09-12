import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * resolveJobAccess is the whole authorisation story for /client/jobs/[token].
 *
 * There is no session behind that page. Every action on it — approving a quote,
 * answering a change order, picking a finish, signing a certificate — asks this
 * one function which account and which job the visitor is allowed to touch, and
 * uses nothing else. If it ever returns an account for a revoked or expired
 * link, or returns the wrong job, every one of those actions is wrong with it.
 *
 * So the cases here are the ones that decide whether a stranger holding an old
 * link gets in.
 */

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ from: mocks.from }) }));

import { resolveJobAccess } from '@/lib/change-order-client';

const TOKEN = 'homeowner-link-token';
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

type AccessRow = {
  account_id: string;
  job_id: string;
  expires_at: string | null;
  revoked_at: string | null;
};

describe('resolveJobAccess', () => {
  let row: AccessRow | null;
  let filters: Record<string, unknown>;
  let selected: string;

  beforeEach(() => {
    vi.clearAllMocks();
    filters = {};
    selected = '';
    row = { account_id: 'workspace-a', job_id: 'job-a', expires_at: null, revoked_at: null };
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('client_job_access');
      const query = {
        select: (columns: string) => {
          selected = columns;
          return query;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return query;
    });
  });

  it('looks the link up by the hash of the token, never the token itself', async () => {
    await resolveJobAccess(TOKEN);

    expect(filters).toEqual({ token_hash: TOKEN_HASH });
    // A raw token in the query means a raw token in the database, in the query
    // log, and in whatever ships those logs onward.
    expect(Object.values(filters)).not.toContain(TOKEN);
  });

  it('reads the revocation and expiry columns it has to judge on', async () => {
    await resolveJobAccess(TOKEN);

    for (const column of ['account_id', 'job_id', 'expires_at', 'revoked_at']) {
      expect(selected).toContain(column);
    }
  });

  it('returns the account and job the stored link names', async () => {
    await expect(resolveJobAccess(TOKEN)).resolves.toEqual({ accountId: 'workspace-a', jobId: 'job-a' });
  });

  it('refuses a token that matches no link', async () => {
    row = null;
    await expect(resolveJobAccess('not-a-real-token')).resolves.toBeNull();
  });

  it('refuses a revoked link even while it is still inside its expiry window', async () => {
    row = {
      account_id: 'workspace-a',
      job_id: 'job-a',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: new Date(Date.now() - 60_000).toISOString(),
    };
    await expect(resolveJobAccess(TOKEN)).resolves.toBeNull();
  });

  it('refuses an expired link', async () => {
    row = {
      account_id: 'workspace-a',
      job_id: 'job-a',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      revoked_at: null,
    };
    await expect(resolveJobAccess(TOKEN)).resolves.toBeNull();
  });

  it('allows a link whose expiry is still ahead', async () => {
    row = {
      account_id: 'workspace-a',
      job_id: 'job-a',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      revoked_at: null,
    };
    await expect(resolveJobAccess(TOKEN)).resolves.toEqual({ accountId: 'workspace-a', jobId: 'job-a' });
  });

  it('treats a null expiry as a link that does not expire', async () => {
    row = { account_id: 'workspace-a', job_id: 'job-a', expires_at: null, revoked_at: null };
    await expect(resolveJobAccess(TOKEN)).resolves.toEqual({ accountId: 'workspace-a', jobId: 'job-a' });
  });

  /**
   * The expiry test compares two strings rather than two dates, and the two
   * strings come from different places: PostgREST renders a timestamptz as
   * `2026-09-12T10:00:00+00:00` while `new Date().toISOString()` produces
   * `2026-09-12T10:00:00.000Z`. Lexicographic order still lands correctly on
   * both sides of the boundary for UTC values, and these two cases are what
   * hold that — swap in a format that sorts differently and they fail here
   * rather than by letting an expired link through in production.
   */
  describe('against the timestamp format PostgREST actually returns', () => {
    const postgrest = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, '+00:00');

    it('still refuses an hour-old expiry', async () => {
      row = {
        account_id: 'workspace-a',
        job_id: 'job-a',
        expires_at: postgrest(new Date(Date.now() - 3_600_000)),
        revoked_at: null,
      };
      await expect(resolveJobAccess(TOKEN)).resolves.toBeNull();
    });

    it('still allows an expiry an hour out', async () => {
      row = {
        account_id: 'workspace-a',
        job_id: 'job-a',
        expires_at: postgrest(new Date(Date.now() + 3_600_000)),
        revoked_at: null,
      };
      await expect(resolveJobAccess(TOKEN)).resolves.toEqual({ accountId: 'workspace-a', jobId: 'job-a' });
    });
  });

  it('gives two different tokens two different lookups', async () => {
    await resolveJobAccess('token-one');
    const first = filters.token_hash;
    filters = {};
    await resolveJobAccess('token-two');

    expect(first).not.toBe(filters.token_hash);
  });
});
