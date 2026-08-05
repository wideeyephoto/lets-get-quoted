import { describe, expect, it } from 'vitest';
import { cleanupVerdict, realmFromQuery } from '@/lib/quickbooks/disconnect-landing';
import { needsCanonicalHost } from '@/lib/tenant-host';

const REALM = '9341454792304783';

describe('a GET cannot disconnect somebody', () => {
  // The whole point of the route. Intuit sends a browser here with a realmId in
  // the URL, and browsers, mail clients and link-preview bots all prefetch GETs.
  it('refuses when there is no session, however right the realm looks', () => {
    expect(cleanupVerdict({ accountId: null, storedRealmId: REALM, claimedRealmId: REALM }))
      .toEqual({ cleanup: false, reason: 'signed-out' });
  });

  it('refuses a realm that is not the one we hold for that account', () => {
    expect(cleanupVerdict({ accountId: 'acc', storedRealmId: REALM, claimedRealmId: '1111111111111111' }))
      .toEqual({ cleanup: false, reason: 'realm-mismatch' });
  });

  // An absent realmId must not read as "whichever one you have".
  it('refuses when the URL names no realm at all', () => {
    expect(cleanupVerdict({ accountId: 'acc', storedRealmId: REALM, claimedRealmId: null }))
      .toEqual({ cleanup: false, reason: 'no-realm' });
    expect(cleanupVerdict({ accountId: 'acc', storedRealmId: REALM, claimedRealmId: '  ' }))
      .toEqual({ cleanup: false, reason: 'no-realm' });
  });

  it('says so plainly when there was nothing connected', () => {
    expect(cleanupVerdict({ accountId: 'acc', storedRealmId: null, claimedRealmId: REALM }))
      .toEqual({ cleanup: false, reason: 'not-connected' });
  });

  it('cleans up only when the session owns the realm being disconnected', () => {
    expect(cleanupVerdict({ accountId: 'acc', storedRealmId: REALM, claimedRealmId: REALM }))
      .toEqual({ cleanup: true });
    // Whitespace off a query string must not defeat the match.
    expect(cleanupVerdict({ accountId: 'acc', storedRealmId: ` ${REALM} `, claimedRealmId: REALM }))
      .toEqual({ cleanup: true });
  });
});

describe('a realm id is a digit string, not any string', () => {
  it('rejects the values that would otherwise match loosely', () => {
    for (const junk of ['', '   ', 'null', 'undefined', '0x1', `${REALM}'--`, '../..', '9'.repeat(33)]) {
      expect(cleanupVerdict({ accountId: 'acc', storedRealmId: REALM, claimedRealmId: junk }).cleanup, junk).toBe(false);
    }
  });

  // "0" is a digit string, so it passes the shape check — it must still not
  // match a real realm.
  it('treats a well-formed but wrong realm as a mismatch, not a pass', () => {
    expect(cleanupVerdict({ accountId: 'acc', storedRealmId: REALM, claimedRealmId: '0' }))
      .toEqual({ cleanup: false, reason: 'realm-mismatch' });
  });

  it('will not let a garbled STORED realm authorise anything', () => {
    expect(cleanupVerdict({ accountId: 'acc', storedRealmId: 'not-a-realm', claimedRealmId: 'not-a-realm' }))
      .toEqual({ cleanup: false, reason: 'not-connected' });
  });
});

describe('finding the realm in whatever Intuit sends', () => {
  it('reads the documented spelling', () => {
    expect(realmFromQuery({ realmId: REALM })).toBe(REALM);
  });

  it('survives a casing or underscore variant rather than silently finding none', () => {
    expect(realmFromQuery({ realmid: REALM })).toBe(REALM);
    expect(realmFromQuery({ realm_id: REALM })).toBe(REALM);
  });

  it('takes the first of a repeated parameter rather than the array', () => {
    expect(realmFromQuery({ realmId: [REALM, '1111'] })).toBe(REALM);
  });

  it('is null when there is nothing usable', () => {
    expect(realmFromQuery({})).toBeNull();
    expect(realmFromQuery({ realmId: 'abc' })).toBeNull();
    expect(realmFromQuery({ state: 'x' })).toBeNull();
  });
});

describe('the landing page is served from the host that holds the session', () => {
  // Both the apex and app. serve this app, and a session cookie belongs to one
  // of them. Without this, a signed-in owner landing on the apex arrives with no
  // cookie, the cleanup silently never fires, and the page tells them to sign in
  // when they already are. Same bug as the QuickBooks CALLBACK had.
  it('routes /quickbooks to the canonical host', () => {
    expect(needsCanonicalHost('/quickbooks/disconnected')).toBe(true);
  });

  it('leaves the token-bearing public pages where they are', () => {
    for (const path of ['/invoice/abc', '/pay/abc', '/portal/view/abc', '/book/x', '/track/x']) {
      expect(needsCanonicalHost(path), path).toBe(false);
    }
  });
});
