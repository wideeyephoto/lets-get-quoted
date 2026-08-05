/**
 * Where a contractor lands when they disconnect us from INSIDE QuickBooks.
 *
 * Intuit requires a "Disconnect URL" before an app can be published, and sends
 * the user's BROWSER there with a GET when they hit Disconnect under My Apps.
 * Until now that setting pointed at /api/quickbooks/disconnect, which is POST
 * only — so the one flow Intuit tests during review answered 405 and the
 * contractor got a raw error page at the end of a perfectly normal action.
 *
 * The interesting question is not what the page says. It is what a GET is
 * allowed to DO, given it arrives:
 *
 *   * unauthenticated as often as not — somebody can disconnect from QuickBooks
 *     on a laptop they have never signed into us on;
 *   * with a `realmId` in the query string that is entirely caller-supplied;
 *   * as a GET, which browsers, mail clients and link-preview bots prefetch.
 *
 * Deleting a connection keyed on that query parameter would mean anyone who
 * learned a realm id could sever a contractor's accounting link by getting them
 * to load a URL. That is the same reasoning that made the Settings disconnect
 * POST-only, and landing on this page must not quietly undo it.
 *
 * So the cleanup is allowed only when all three hold: there is a real session,
 * that session's own account has a connection, and the realm the caller names is
 * the realm we have stored for them. Anything short of that changes nothing —
 * and nothing is lost by refusing, because a revoked connection self-heals: the
 * next sync gets a 401, markBroken() runs, and Settings says "reconnect".
 */

export type CleanupVerdict =
  | { cleanup: true }
  | {
      cleanup: false;
      /**
       * Why not. Drives what the page SAYS, not just what it does — "we couldn't
       * tell which account this was" and "you weren't connected anyway" are very
       * different messages to read after disconnecting something.
       */
      reason: 'signed-out' | 'not-connected' | 'no-realm' | 'realm-mismatch';
    };

export function cleanupVerdict(input: {
  /** The signed-in visitor's account, or null when there is no session. */
  accountId: string | null | undefined;
  /** The realm on the connection WE hold for that account. */
  storedRealmId: string | null | undefined;
  /** The realm the query string claims. Never trusted on its own. */
  claimedRealmId: string | null | undefined;
}): CleanupVerdict {
  if (!input.accountId) return { cleanup: false, reason: 'signed-out' };

  const stored = normalizeRealm(input.storedRealmId);
  if (!stored) return { cleanup: false, reason: 'not-connected' };

  const claimed = normalizeRealm(input.claimedRealmId);
  // Intuit does send realmId, but an absent one must not be read as "any realm".
  // Refusing costs nothing: the connection self-heals on the next sync.
  if (!claimed) return { cleanup: false, reason: 'no-realm' };

  if (claimed !== stored) return { cleanup: false, reason: 'realm-mismatch' };
  return { cleanup: true };
}

/**
 * A realm id is a digit string from Intuit. Anything else is not a realm id, and
 * comparing it loosely is how "0" or "" starts matching something.
 */
function normalizeRealm(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || !/^\d{1,32}$/.test(trimmed)) return null;
  return trimmed;
}

/** Intuit spells the parameter `realmId`; accept the casing variants rather than
 *  silently failing to find one because a query key arrived lowercased. */
export function realmFromQuery(query: Record<string, string | string[] | undefined>): string | null {
  for (const key of ['realmId', 'realmid', 'RealmId', 'realm_id']) {
    const raw = query[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const normalized = normalizeRealm(value);
    if (normalized) return normalized;
  }
  return null;
}
