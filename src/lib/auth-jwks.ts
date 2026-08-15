import { normalizeSupabaseUrl } from '@/lib/supabase-url';

/**
 * The project's JWT signing keys, cached for the life of the server instance.
 *
 * WHY THIS EXISTS AT ALL, given supabase-js caches JWKS itself.
 *
 * It caches them on the CLIENT INSTANCE (`this.jwks`), and this app builds a
 * fresh client per request — `createSupabaseServerClient()` reads the request's
 * cookies, so it cannot be a singleton. So the library's cache never survives a
 * request, and `getClaims()` on its own would fetch the JWKS every time: the
 * same network round trip to the same host that `getUser()` was making, just to
 * a different path. Nothing would have been saved.
 *
 * `getClaims(jwt, { keys })` lets the caller supply the keys, which is the seam
 * this module fills. Cached at module scope, so it survives across requests
 * served by the same instance and costs one fetch per cold start.
 *
 * The keys are PUBLIC — this is a public key set, published unauthenticated at
 * a well-known URL. Caching it holds nothing secret in memory.
 */
/**
 * Structurally compatible with supabase-js's own `JWK`, declared here rather
 * than imported: that type lives in @supabase/auth-js, which this project only
 * has transitively through @supabase/supabase-js, and importing across a
 * dependency it does not declare is a break waiting for a hoist to change.
 */
export type Jwk = {
  kty: string;
  key_ops: string[];
  alg?: string;
  kid?: string;
  [key: string]: unknown;
};

/** Long enough that steady-state traffic never refetches, short enough that a
 *  rotation heals on its own within minutes even without a verification miss. */
export const JWKS_TTL_MS = 10 * 60 * 1000;

/**
 * Floor on how often `force` may actually go to the network.
 *
 * The caller forces a refetch when a signature fails to verify, on the theory
 * that the key rotated. But "this signature is wrong" is also what a forged
 * token looks like, and without a floor a client replaying bad tokens would
 * turn each one into a JWKS request. Thirty seconds still heals a real rotation
 * almost immediately and makes the amplification worth nothing.
 */
export const JWKS_FORCE_FLOOR_MS = 30 * 1000;

let cachedKeys: Jwk[] | null = null;
let cachedAt = 0;
let inFlight: Promise<Jwk[] | null> | null = null;

/** Test seam. Never called by application code. */
export function resetJwksCacheForTest(): void {
  cachedKeys = null;
  cachedAt = 0;
  inFlight = null;
}

export function jwksUrl(): string {
  return `${normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)}/auth/v1/.well-known/jwks.json`;
}

/**
 * The cached key set, fetching it if the cache is cold, stale, or `force`d.
 *
 * Returns null only when there has never been a successful fetch. A FAILED
 * refresh keeps serving the keys already held rather than throwing them away:
 * signing keys change on the order of never, and a blip at the JWKS endpoint
 * must not become an authentication outage. The caller treats null as "no keys
 * to supply", which makes supabase-js fetch them itself — correct, just slower.
 */
export async function signingKeys(
  options: { force?: boolean; now?: number; fetchImpl?: typeof fetch } = {},
): Promise<Jwk[] | null> {
  const now = options.now ?? Date.now();
  if (!options.force && cachedKeys && now - cachedAt < JWKS_TTL_MS) return cachedKeys;

  // A force that lands inside the floor is answered from cache — see
  // JWKS_FORCE_FLOOR_MS. Only applies once there is something to serve.
  if (options.force && cachedKeys && now - cachedAt < JWKS_FORCE_FLOOR_MS) return cachedKeys;

  // Collapse a stampede: on a cold start every concurrent request would
  // otherwise fetch the same public key set at once.
  if (inFlight && !options.force) return inFlight;

  const doFetch = async (): Promise<Jwk[] | null> => {
    try {
      const res = await (options.fetchImpl ?? fetch)(jwksUrl(), {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
      });
      if (!res.ok) return cachedKeys;
      const body = (await res.json()) as { keys?: Jwk[] };
      if (!Array.isArray(body?.keys) || body.keys.length === 0) return cachedKeys;
      cachedKeys = body.keys;
      cachedAt = now;
      return cachedKeys;
    } catch {
      return cachedKeys;
    } finally {
      inFlight = null;
    }
  };

  inFlight = doFetch();
  return inFlight;
}
