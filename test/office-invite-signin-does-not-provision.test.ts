import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An invited employee's first sign-in must not make them an owner.
 *
 * ensureAccountMembership provisions a workspace for anyone holding no
 * membership, and it already declined to do that for an existing OFFICE user --
 * its own comment explains that an owner row outranks the office one in
 * getCurrentMembership and strands the workspace that hired them.
 *
 * That check could never fire for the case it was written for. An invitation is
 * accepted AFTER sign-in: /office-invite/<token> bounces an anonymous visitor to
 * /login and back, so on the one sign-in every office user must pass through,
 * there is no office membership to find yet.
 *
 * WHAT THE FIRST ATTEMPT GOT WRONG, because the shape of the fix is the whole
 * lesson. It asked the database "does this address have a pending invitation?"
 * and skipped provisioning if so. That answer PERSISTS: it suppressed
 * provisioning on every sign-in for as long as the row lived, so somebody who
 * was invited but wanted their own account got no membership at all -- and a
 * memberless signed-in user is redirected to /login, which is a loop. Since
 * anybody may invite any address, it was also a way to block an arbitrary email
 * from ever completing a signup.
 *
 * The sign-in that needs suppressing is identifiable WITHOUT guessing: the
 * callback holds `next`, and for an invited employee it names the invitation.
 * So the condition lasts exactly one request and heals by itself.
 */

type Row = Record<string, any>;

let memberships: Row[] = [];
let accountsCreated: Row[] = [];

function filterChain(rowsFor: () => Row[]) {
  const preds: Array<(row: Row) => boolean> = [];
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = (column: string, value: unknown) => { preds.push((row) => row[column] === value); return chain; };
  chain.is = (column: string, value: null) => { preds.push((row) => (row[column] ?? null) === value); return chain; };
  chain.gt = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = () => Promise.resolve({
    data: rowsFor().find((row) => preds.every((p) => p(row))) ?? null,
    error: null,
  });
  return chain;
}

function table(name: string) {
  if (name === 'memberships') {
    const chain: any = filterChain(() => memberships);
    chain.insert = (row: Row) => { memberships.push(row); return Promise.resolve({ error: null }); };
    return chain;
  }

  if (name === 'accounts') {
    const chain: any = {};
    chain.insert = (row: Row) => {
      const created = { id: 'acct-' + (accountsCreated.length + 1), ...row };
      accountsCreated.push(created);
      const after: any = {};
      after.select = () => after;
      after.single = () => Promise.resolve({ data: created, error: null });
      return after;
    };
    chain.delete = () => ({ eq: () => Promise.resolve({ error: null }) });
    return chain;
  }

  throw new Error('unexpected table: ' + name);
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (name: string) => table(name) }),
}));
vi.mock('next/headers', () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => ({
    from: (name: string) => table(name),
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound'); },
  redirect: (to: string) => { throw new Error('REDIRECT:' + to); },
}));

const { ensureAccountMembership } = await import('@/lib/auth');
const { isInvitationPath, invitationLink, INVITATION_PATH_PREFIX } = await import('@/lib/office-invitations');

beforeEach(() => {
  memberships = [];
  accountsCreated = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('an invited employee is not provisioned a workspace of their own', () => {
  it('provisions nothing on the hop that is on its way to the invitation', async () => {
    // The defect, in one test. Before the fix this returned an owner membership
    // and created an account, which then outranked the office row for good.
    expect(await ensureAccountMembership('user-1', { arrivingAtInvitation: true })).toBeNull();
    expect(accountsCreated, 'a workspace was created for an invited employee').toHaveLength(0);
    expect(memberships).toHaveLength(0);
  });
});

describe('the condition lasts one request and heals', () => {
  it('provisions normally for somebody who was invited but signed up on their own', async () => {
    // THE REGRESSION THE FIRST ATTEMPT INTRODUCED. Keying on a pending
    // invitation row meant this person got no workspace at all, and a
    // memberless signed-in user is bounced to /login -- a loop, because they
    // are already signed in. Their sign-in is not headed for the invitation, so
    // nothing about it should change.
    expect(await ensureAccountMembership('user-1')).toEqual({ account_id: 'acct-1', role: 'owner' });
    expect(accountsCreated).toHaveLength(1);
  });

  it('provisions on the NEXT request when the accept failed', async () => {
    // The self-healing property, and the reason a one-request condition is
    // safe where a database-derived one is not. The accept can fail for
    // reasons the invitee cannot fix -- a seat taken between invite and accept,
    // an expired or revoked token -- and they must not be left with no account
    // and no way to get one.
    expect(await ensureAccountMembership('user-1', { arrivingAtInvitation: true })).toBeNull();
    expect(accountsCreated).toHaveLength(0);

    // Their very next page load, with no option passed.
    expect(await ensureAccountMembership('user-1')).toEqual({ account_id: 'acct-1', role: 'owner' });
    expect(accountsCreated).toHaveLength(1);
  });

  it('defaults to provisioning when the caller says nothing', async () => {
    // Every OTHER caller -- the phone verify route, and the guards that run on
    // ordinary dashboard page loads -- passes no options at all. The default
    // has to be the old behaviour or every new signup breaks.
    expect(await ensureAccountMembership('user-1', {})).toEqual({ account_id: 'acct-1', role: 'owner' });
    expect(accountsCreated).toHaveLength(1);
  });
});

describe('the existing short-circuits still come first', () => {
  it('an owner opening an invitation keeps their own business', async () => {
    // Somebody who runs their own business and also keeps the books for
    // another. The owner lookup runs BEFORE the new check, so following an
    // invitation link must not detach them from their workspace.
    memberships = [{ account_id: 'acct-owned', role: 'owner', user_id: 'user-1' }];

    expect(await ensureAccountMembership('user-1', { arrivingAtInvitation: true }))
      .toMatchObject({ account_id: 'acct-owned', role: 'owner' });
    expect(accountsCreated).toHaveLength(0);
  });

  it('an accepted office user resolves to the workspace that hired them', async () => {
    memberships = [{ account_id: 'acct-employer', role: 'office', user_id: 'user-1' }];

    expect(await ensureAccountMembership('user-1')).toMatchObject({ account_id: 'acct-employer', role: 'office' });
    expect(accountsCreated).toHaveLength(0);
  });
});

describe('recognising an invitation path', () => {
  it('matches the path invitationLink actually mints', () => {
    // Pinned against the minting function rather than a hand-written string, so
    // moving the route cannot leave the login rail matching the old one.
    const link = invitationLink('https://example.com', 'tok-123');
    expect(isInvitationPath(new URL(link).pathname)).toBe(true);
  });

  it.each([
    ['/office-invited/abc', 'a longer route that merely starts the same way'],
    ['/office-invite', 'the prefix without its trailing slash'],
    ['/dashboard', 'an ordinary destination'],
    ['/', 'the site root'],
    ['', 'the empty string'],
  ])('does not match %s (%s)', (path) => {
    expect(isInvitationPath(path)).toBe(false);
  });

  it('handles a missing path rather than throwing', () => {
    // safeNextPath always returns a string, but this is called on a URL
    // pathname too, and a guard that throws here would break sign-in itself.
    expect(isInvitationPath(null)).toBe(false);
    expect(isInvitationPath(undefined)).toBe(false);
  });

  it('is the prefix the constant declares', () => {
    expect(INVITATION_PATH_PREFIX).toBe('/office-invite/');
  });
});

describe('the callbacks actually pass it', () => {
  /**
   * The wiring is what makes any of the above true. ensureAccountMembership
   * cannot see `next`, so if a callback forgets to say where the user is
   * headed, the guard silently never fires and the original defect is back
   * with every test above still green.
   */
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

  it.each([
    ['src/app/auth/callback/route.ts', 'redirectUrl.pathname'],
    ['src/app/auth/magic-link-callback/route.ts', 'safeNext'],
  ])('%s decides from %s', (path, source) => {
    const src = read(path);
    expect(src).toContain('arrivingAtInvitation: isInvitationPath(' + source + ')');
    expect(src).toContain("from '@/lib/office-invitations'");
  });

  it('every caller that can be null checks before recording a login event', () => {
    // A null membership has no account to attribute a sign-in to. Reading
    // .account_id off it is a crash on the sign-in path.
    for (const path of [
      'src/app/auth/callback/route.ts',
      'src/app/auth/magic-link-callback/route.ts',
      'src/app/auth/verify-phone/route.ts',
    ]) {
      const src = read(path);
      const at = src.indexOf('await ensureAccountMembership');
      expect(at, path + ' does not call ensureAccountMembership').toBeGreaterThan(-1);
      const after = src.slice(at, at + 700);
      expect(after, path + ' reads account_id without a null check').toContain('if (membership)');
    }
  });
});
