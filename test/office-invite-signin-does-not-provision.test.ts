import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * An invited employee's first sign-in must not make them an owner.
 *
 * ensureAccountMembership provisions a workspace for anyone holding no
 * membership, and it already declines to do that for an existing OFFICE user --
 * its own comment explains that an owner row would outrank the office one in
 * getCurrentMembership and strand the workspace that hired them.
 *
 * But an invitation is accepted AFTER sign-in, not before: /office-invite/<token>
 * bounces an anonymous visitor to /login and back, so on the one sign-in every
 * office user must pass through, there is no office membership to find yet. The
 * guard was correct and unreachable. Crew never had this problem because
 * auth/crew-callback deliberately does not call this function at all.
 *
 * The mock EVALUATES the query filters rather than recording them, so "revoked,
 * accepted and expired invitations do not suppress provisioning" is an assertion
 * about behaviour and not a restatement of the source.
 */

type Row = Record<string, any>;

let invitations: Row[] = [];
let memberships: Row[] = [];
let accountsCreated: Row[] = [];
let userEmail: string | null = null;
let userLookupError: string | null = null;
let inviteLookupError: string | null = null;

function filterChain(rowsFor: () => Row[]) {
  const preds: Array<(row: Row) => boolean> = [];
  const chain: any = {};
  chain.select = () => chain;
  chain.eq = (column: string, value: unknown) => { preds.push((row) => row[column] === value); return chain; };
  chain.is = (column: string, value: null) => { preds.push((row) => (row[column] ?? null) === value); return chain; };
  chain.gt = (column: string, value: string) => {
    preds.push((row) => new Date(row[column]).getTime() > new Date(value).getTime());
    return chain;
  };
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = () => Promise.resolve({
    data: rowsFor().find((row) => preds.every((p) => p(row))) ?? null,
    error: null,
  });
  return chain;
}

function table(name: string) {
  if (name === 'office_invitations') {
    const chain: any = filterChain(() => invitations);
    const inner = chain.maybeSingle;
    chain.maybeSingle = () => (inviteLookupError
      ? Promise.resolve({ data: null, error: { message: inviteLookupError } })
      : inner());
    return chain;
  }

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
  createClient: () => ({
    from: (name: string) => table(name),
    auth: {
      admin: {
        getUserById: () => Promise.resolve(userLookupError
          ? { data: { user: null }, error: { message: userLookupError } }
          : {
              data: { user: userEmail === null ? null : { id: 'user-1', email: userEmail } },
              error: null,
            }),
      },
    },
  }),
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

const HOUR = 60 * 60 * 1000;
const future = () => new Date(Date.now() + 24 * HOUR).toISOString();
const past = () => new Date(Date.now() - HOUR).toISOString();

const pendingInvite = (email: string) => ({
  id: 'inv-1', email, accepted_at: null, revoked_at: null, expires_at: future(),
});

beforeEach(() => {
  invitations = [];
  memberships = [];
  accountsCreated = [];
  userEmail = 'newhire@example.com';
  userLookupError = null;
  inviteLookupError = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('an invited employee is not provisioned a workspace of their own', () => {
  it('provisions nothing on the sign-in the invitation link sends them through', async () => {
    // The defect, in one test. Before the fix this returned an owner membership
    // and created an account, which then outranked the office row for good.
    invitations = [pendingInvite('newhire@example.com')];

    expect(await ensureAccountMembership('user-1')).toBeNull();
    expect(accountsCreated, 'a workspace was created for an invited employee').toHaveLength(0);
    expect(memberships).toHaveLength(0);
  });

  it('matches the invitation regardless of case or stray whitespace', async () => {
    // inviteOfficeUserAction stores .trim().toLowerCase(); the auth user's
    // address is whatever they typed at signup. Comparing them raw would
    // silently reopen the whole defect for anyone who capitalises their email.
    invitations = [pendingInvite('newhire@example.com')];
    userEmail = '  NewHire@Example.COM ';

    expect(await ensureAccountMembership('user-1')).toBeNull();
    expect(accountsCreated).toHaveLength(0);
  });
});

describe('everyone else is provisioned exactly as before', () => {
  it('gives a brand-new signup with no invitation their own workspace', async () => {
    const membership = await ensureAccountMembership('user-1');

    expect(membership).toEqual({ account_id: 'acct-1', role: 'owner' });
    expect(accountsCreated).toHaveLength(1);
  });

  it.each([
    ['revoked', { revoked_at: new Date().toISOString() }],
    ['already accepted', { accepted_at: new Date().toISOString() }],
    ['expired', { expires_at: past() }],
  ])('a %s invitation does not block their signup', async (_label, overrides) => {
    // Each of these is a dead invitation. Suppressing provisioning on one would
    // leave a real new customer with no workspace and no way to get one --
    // the same bug failing in the opposite, louder direction.
    invitations = [{ ...pendingInvite('newhire@example.com'), ...overrides }];

    expect(await ensureAccountMembership('user-1')).toEqual({ account_id: 'acct-1', role: 'owner' });
    expect(accountsCreated).toHaveLength(1);
  });

  it('ignores an invitation addressed to somebody else', async () => {
    invitations = [pendingInvite('someone.else@example.com')];

    expect(await ensureAccountMembership('user-1')).toEqual({ account_id: 'acct-1', role: 'owner' });
    expect(accountsCreated).toHaveLength(1);
  });

  it('still provisions when the auth user has no email at all', async () => {
    // Phone signup reaches this same function. No address means no invitation
    // can have been addressed to them, so they are an ordinary new signup.
    userEmail = null;

    expect(await ensureAccountMembership('user-1')).toEqual({ account_id: 'acct-1', role: 'owner' });
    expect(accountsCreated).toHaveLength(1);
  });
});

describe('the existing short-circuits still come first', () => {
  it('an owner keeps landing in their own business even with an invitation waiting', async () => {
    // The documented case: somebody who runs their own business and also keeps
    // the books for another. The owner lookup runs BEFORE the invitation check,
    // so this must be unchanged by the fix.
    memberships = [{ account_id: 'acct-owned', role: 'owner', user_id: 'user-1' }];
    invitations = [pendingInvite('newhire@example.com')];

    expect(await ensureAccountMembership('user-1')).toMatchObject({ account_id: 'acct-owned', role: 'owner' });
    expect(accountsCreated).toHaveLength(0);
  });

  it('an accepted office user resolves to the workspace that hired them', async () => {
    memberships = [{ account_id: 'acct-employer', role: 'office', user_id: 'user-1' }];

    expect(await ensureAccountMembership('user-1')).toMatchObject({ account_id: 'acct-employer', role: 'office' });
    expect(accountsCreated).toHaveLength(0);
  });
});

describe('a lookup that fails is not read as "no invitation"', () => {
  // Both of these could have been written to fall through, and falling through
  // means provisioning. That is the silent, permanent failure -- an owner row
  // outranking their office one for good. Refusing is loud and retryable, so
  // these assert BOTH that it throws and that nothing was created.

  it('refuses when the signing-in user cannot be read', async () => {
    invitations = [pendingInvite('newhire@example.com')];
    userLookupError = 'upstream unavailable';

    await expect(ensureAccountMembership('user-1')).rejects.toThrow(/Could not read the signing-in user/);
    expect(accountsCreated).toHaveLength(0);
  });

  it('refuses when the invitation lookup fails', async () => {
    inviteLookupError = 'statement timeout';

    await expect(ensureAccountMembership('user-1')).rejects.toThrow(/Could not check for a pending invitation/);
    expect(accountsCreated).toHaveLength(0);
  });
});
