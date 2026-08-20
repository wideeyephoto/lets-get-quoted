import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  INVITATION_TTL_DAYS,
  hashInvitationToken,
  invitationExpiry,
  invitationLink,
  invitationStatus,
  invitationTokenMatches,
  mintInvitationToken,
  type OfficeInvitationRow,
} from '@/lib/office-invitations';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const row = (over: Partial<OfficeInvitationRow> = {}): OfficeInvitationRow => ({
  id: 'i1',
  email: 'bookkeeper@acme.test',
  expiresAt: '2026-08-26T00:00:00Z',
  sendCount: 1,
  lastSentAt: '2026-08-19T00:00:00Z',
  acceptedAt: null,
  revokedAt: null,
  ...over,
});

describe('the token', () => {
  it('is long, random, and different every time', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => mintInvitationToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      // 32 bytes base64url. Guessing is not a strategy against this.
      expect(token.length).toBeGreaterThanOrEqual(42);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('hashes to something the database can hold and nothing can reverse', () => {
    const token = mintInvitationToken();
    const digest = hashInvitationToken(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    // Same token, same digest, or a resend would invalidate itself.
    expect(hashInvitationToken(token)).toBe(digest);
    expect(digest).not.toContain(token);
  });

  it('gives different tokens different digests', () => {
    expect(hashInvitationToken('a')).not.toBe(hashInvitationToken('b'));
  });

  it('compares digests without timing the answer', () => {
    const a = hashInvitationToken('one');
    expect(invitationTokenMatches(a, a)).toBe(true);
    expect(invitationTokenMatches(a, hashInvitationToken('two'))).toBe(false);
    // Anything not a digest is refused rather than compared, so a shorter value
    // cannot reach timingSafeEqual and throw on a length mismatch.
    for (const bad of ['', 'zz', 'g'.repeat(64), `${a}0`]) {
      expect(invitationTokenMatches(a, bad), bad.slice(0, 8)).toBe(false);
    }
  });
});

describe('expiry is derived, never stored', () => {
  it('expires a week out', () => {
    const now = new Date('2026-08-19T12:00:00Z');
    expect(invitationExpiry(now).toISOString()).toBe('2026-08-26T12:00:00.000Z');
    expect(INVITATION_TTL_DAYS).toBe(7);
  });

  it('reads pending, accepted, revoked and expired off the row', () => {
    const before = new Date('2026-08-20T00:00:00Z');
    const after = new Date('2026-08-27T00:00:00Z');
    expect(invitationStatus(row(), before)).toBe('pending');
    expect(invitationStatus(row(), after)).toBe('expired');
    expect(invitationStatus(row({ acceptedAt: '2026-08-20T00:00:00Z' }), after)).toBe('accepted');
    expect(invitationStatus(row({ revokedAt: '2026-08-20T00:00:00Z' }), before)).toBe('revoked');
  });

  it('prefers accepted over expired, because it happened first', () => {
    // A stored status column would need a job to keep it true, and between the
    // expiry instant and that job the row would claim pending while the database
    // refused it -- two answers to one question.
    expect(invitationStatus(
      row({ acceptedAt: '2026-08-20T00:00:00Z' }), new Date('2027-01-01T00:00:00Z'),
    )).toBe('accepted');
  });
});

describe('the link', () => {
  it('carries the token in the path and nothing else', () => {
    const link = invitationLink('https://letsgetquoted.com/', 'abc-123');
    expect(link).toBe('https://letsgetquoted.com/office-invite/abc-123');
    // No query string: a token in one is a token in a referrer header.
    expect(link).not.toContain('?');
  });

  it('escapes a token that would otherwise change the path', () => {
    expect(invitationLink('https://x.test', 'a/b?c')).toBe('https://x.test/office-invite/a%2Fb%3Fc');
  });
});

describe('the action and the page keep the token to themselves', () => {
  it('never writes the token or its hash into the audit trail', () => {
    // The whole point of hashing it is undone by an audit row that carries it.
    const actions = read('src', 'app', 'dashboard', 'settings', 'office-team-actions.ts');
    const meta = actions.slice(actions.indexOf('meta: { email }'), actions.indexOf('revalidatePath'));
    expect(meta).not.toContain('token');
  });

  it('goes through the session client, so the RPC checks the caller', () => {
    const actions = read('src', 'app', 'dashboard', 'settings', 'office-team-actions.ts');
    expect(actions).not.toContain('createAdminClient');
    expect(actions).toContain('requireOwnerContext');
  });

  it('hashes on the server before anything reaches the database', () => {
    const page = read('src', 'app', 'office-invite', '[token]', 'page.tsx');
    expect(page).toContain('hashInvitationToken(token)');
    // The raw token must not be handed to the RPC, which would store it in a
    // query log the moment anybody turned statement logging on.
    expect(page).not.toMatch(/p_token_sha256:\s*token\b/);
  });

  it('requires a signed-in user before it will even look', () => {
    // The invitation is addressed to an email; that check cannot run without a
    // user, so a forwarded link must not be able to accept first and identify
    // afterwards.
    const page = read('src', 'app', 'office-invite', '[token]', 'page.tsx');
    const signIn = page.indexOf('redirect(`/login');
    // The CALL, not the mention -- the doc comment above explains the rule by
    // naming the RPC, and matching that found the comment instead of the code.
    // Third time today an assertion has tripped over the prose explaining it.
    const accept = page.indexOf("rpc('accept_office_invitation'");
    expect(signIn).toBeGreaterThan(0);
    expect(signIn).toBeLessThan(accept);
  });

  it('gives one message for every kind of dead link', () => {
    // Distinguishing expired from revoked from wrong-recipient lets anybody
    // holding a guessed token learn which workspaces have live invitations.
    const page = read('src', 'app', 'office-invite', '[token]', 'page.tsx');
    expect(page).toContain('expired, been cancelled, already been used, or been meant for a different email');
  });
});

describe('sign-in returns them to the link', () => {
  it('forwards a next path instead of pinning /dashboard', () => {
    // All three sign-in paths pinned /dashboard, so an invited person signed in
    // and landed on a dashboard they cannot use, with the invitation unopened.
    const login = read('src', 'app', 'login', 'page.tsx');
    expect(login).toContain('safeNextPath(searchParams.get(\'next\'))');
    expect(login).not.toContain("sendMagicLinkAction(value, '/dashboard')");
    expect(login).not.toContain("window.location.assign('/dashboard')");
    expect(login).not.toContain('auth/callback?next=/dashboard');
  });

  it('still sends it through the sanitiser, so it cannot leave the site', () => {
    const login = read('src', 'app', 'login', 'page.tsx');
    expect(login).toContain("from '@/lib/app-origin'");
  });
});
