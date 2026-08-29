import { describe, it, expect, beforeEach } from 'vitest';
import {
  JWKS_FORCE_FLOOR_MS,
  JWKS_TTL_MS,
  resetJwksCacheForTest,
  signingKeys,
  type Jwk,
} from '../src/lib/auth-jwks';

/**
 * The signing keys are what make local JWT verification cheaper than the
 * getUser() round trip it replaces. If this cache stops holding, every request
 * pays a JWKS fetch instead — the same network call, to a different path, with
 * nothing gained. These tests are about that property, and about the one
 * failure mode that would be worse than slow: throwing away a working key set
 * because a refresh blipped, which would lock every owner out.
 */

const KEY: Jwk = { kty: 'EC', key_ops: ['verify'], alg: 'ES256', kid: 'first' };
const ROTATED: Jwk = { kty: 'EC', key_ops: ['verify'], alg: 'ES256', kid: 'second' };

function fetcher(queue: Array<{ ok: boolean; keys?: Jwk[] } | Error>) {
  const calls: string[] = [];
  const impl = (async (url: unknown) => {
    calls.push(String(url));
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected extra fetch');
    if (next instanceof Error) throw next;
    return {
      ok: next.ok,
      json: async () => ({ keys: next.keys ?? [] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

beforeEach(() => {
  resetJwksCacheForTest();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
});

describe('signingKeys', () => {
  it('fetches once and serves the cache after', async () => {
    const { impl, calls } = fetcher([{ ok: true, keys: [KEY] }]);

    expect(await signingKeys({ fetchImpl: impl })).toEqual([KEY]);
    expect(await signingKeys({ fetchImpl: impl })).toEqual([KEY]);
    expect(await signingKeys({ fetchImpl: impl })).toEqual([KEY]);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe('https://example.supabase.co/auth/v1/.well-known/jwks.json');
  });

  it('collapses a cold-start stampede into one fetch', async () => {
    const { impl, calls } = fetcher([{ ok: true, keys: [KEY] }]);

    // Every request on a fresh instance arrives before the first fetch lands.
    const all = await Promise.all([
      signingKeys({ fetchImpl: impl }),
      signingKeys({ fetchImpl: impl }),
      signingKeys({ fetchImpl: impl }),
      signingKeys({ fetchImpl: impl }),
    ]);

    expect(all.every((k) => k?.[0]?.kid === 'first')).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('refetches once the TTL has passed', async () => {
    const { impl, calls } = fetcher([
      { ok: true, keys: [KEY] },
      { ok: true, keys: [ROTATED] },
    ]);

    const t0 = 1_000_000;
    expect(await signingKeys({ fetchImpl: impl, now: t0 })).toEqual([KEY]);
    // Still inside the window.
    expect(await signingKeys({ fetchImpl: impl, now: t0 + JWKS_TTL_MS - 1 })).toEqual([KEY]);
    expect(calls).toHaveLength(1);

    expect(await signingKeys({ fetchImpl: impl, now: t0 + JWKS_TTL_MS + 1 })).toEqual([ROTATED]);
    expect(calls).toHaveLength(2);
  });

  it('force refetches, which is how a rotated key heals mid-window', async () => {
    const { impl, calls } = fetcher([
      { ok: true, keys: [KEY] },
      { ok: true, keys: [ROTATED] },
    ]);

    const t0 = 1_000_000;
    expect(await signingKeys({ fetchImpl: impl, now: t0 })).toEqual([KEY]);
    expect(await signingKeys({ fetchImpl: impl, force: true, now: t0 + JWKS_FORCE_FLOOR_MS + 1 })).toEqual([ROTATED]);
    expect(calls).toHaveLength(2);
  });

  /**
   * A failed signature is indistinguishable from a rotated key, so the caller
   * forces a refetch on both. Without this floor, replaying forged tokens would
   * turn each one into a request to the JWKS endpoint.
   */
  it('answers a force inside the floor from cache, so bad tokens cannot amplify', async () => {
    const { impl, calls } = fetcher([{ ok: true, keys: [KEY] }]);

    const t0 = 1_000_000;
    expect(await signingKeys({ fetchImpl: impl, now: t0 })).toEqual([KEY]);

    for (let i = 0; i < 25; i++) {
      expect(await signingKeys({ fetchImpl: impl, force: true, now: t0 + i })).toEqual([KEY]);
    }

    expect(calls).toHaveLength(1);
  });

  /**
   * The one that matters. A failed refresh must never downgrade a working key
   * set to null — null means "no keys to supply", and while that is merely
   * slower for verification, discarding good keys on every blip is how a
   * transient 500 at the JWKS endpoint turns into an auth incident.
   */
  it('keeps serving the keys it has when a refresh fails', async () => {
    const { impl } = fetcher([
      { ok: true, keys: [KEY] },
      new Error('network down'),
      { ok: false },
      { ok: true, keys: [] },
    ]);

    const t0 = 1_000_000;
    const past = (n: number) => t0 + (JWKS_FORCE_FLOOR_MS + 1) * n;
    expect(await signingKeys({ fetchImpl: impl, now: t0 })).toEqual([KEY]);

    // Thrown, non-ok, and empty-body all preserve the cached set.
    expect(await signingKeys({ fetchImpl: impl, force: true, now: past(1) })).toEqual([KEY]);
    expect(await signingKeys({ fetchImpl: impl, force: true, now: past(2) })).toEqual([KEY]);
    expect(await signingKeys({ fetchImpl: impl, force: true, now: past(3) })).toEqual([KEY]);
  });

  it('reports null only when it has never had keys', async () => {
    const { impl } = fetcher([new Error('network down')]);
    expect(await signingKeys({ fetchImpl: impl })).toBeNull();
  });
});
