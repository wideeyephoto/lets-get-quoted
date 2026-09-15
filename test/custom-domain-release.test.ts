import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Deleting an account used to strand its custom domain on the Vercel project
 * forever: `sites` cascades away with the account, so by the time anything knew
 * the account was gone, the domain it held was unreadable. Our project kept
 * answering for a hostname nobody here owned, and — because Vercel refuses the
 * same domain on two projects — whoever pointed that name somewhere else next
 * could never attach it.
 *
 * The ordering is the whole fix: READ while the rows exist, RELEASE only after
 * the delete is confirmed.
 */

const removeDomainFromVercel = vi.fn(async (_domain: string): Promise<boolean> => true);

vi.mock('@/lib/vercel-domains', () => ({
  removeDomainFromVercel: (...a: [string]) => removeDomainFromVercel(...a),
}));

const { readAccountCustomDomains, releaseCustomDomains } = await import('@/lib/custom-domain-release');

function dbReturning(result: { data: unknown; error: { message: string } | null }) {
  const filters: Record<string, unknown> = {};
  const client = {
    from: () => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return Promise.resolve(result);
        },
      }),
    }),
  } as never;
  return { client, filters };
}

beforeEach(() => {
  vi.clearAllMocks();
  removeDomainFromVercel.mockResolvedValue(true);
});

describe('reading the domains an account holds', () => {
  it('returns every non-empty custom domain, scoped to the account', async () => {
    const db = dbReturning({
      data: [{ custom_domain: 'www.eliteelectricians.com' }, { custom_domain: null }, { custom_domain: '  ' }],
      error: null,
    });

    expect(await readAccountCustomDomains(db.client, 'acct-1')).toEqual(['www.eliteelectricians.com']);
    expect(db.filters.account_id).toBe('acct-1');
  });

  it('throws rather than reporting an empty list it did not read', async () => {
    const db = dbReturning({ data: null, error: { message: 'permission denied' } });

    // Returning [] here would silently convert an unreadable table into "this
    // account held no domains", and the leak would be invisible again.
    await expect(readAccountCustomDomains(db.client, 'acct-1')).rejects.toThrow(/permission denied/);
  });
});

describe('releasing the domains after the delete', () => {
  it('detaches each domain once, even when the same one appears twice', async () => {
    const result = await releaseCustomDomains([
      'www.eliteelectricians.com',
      'www.eliteelectricians.com',
      'www.midwestglass.com',
    ]);

    expect(removeDomainFromVercel).toHaveBeenCalledTimes(2);
    expect(result.released.sort()).toEqual(['www.eliteelectricians.com', 'www.midwestglass.com']);
    expect(result.failed).toEqual([]);
  });

  it('reports what stayed attached instead of throwing', async () => {
    removeDomainFromVercel.mockResolvedValueOnce(false);

    // This runs AFTER the account row is gone. Throwing here would turn a
    // completed deletion into a reported failure and invite a retry of work
    // that cannot be repeated.
    const result = await releaseCustomDomains(['www.stuck.com']);

    expect(result.failed).toEqual(['www.stuck.com']);
    expect(result.released).toEqual([]);
  });

  it('does nothing at all for an account that held no domains', async () => {
    const result = await releaseCustomDomains([]);

    expect(removeDomainFromVercel).not.toHaveBeenCalled();
    expect(result).toEqual({ released: [], failed: [] });
  });
});
