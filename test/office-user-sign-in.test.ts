import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What happens when somebody who accepted an office invitation signs in.
 *
 * Before this, three things went wrong in sequence and each hid the next.
 * `ensureAccountMembership` saw no OWNER row and provisioned a brand-new
 * workspace; that new row was itself an owner row, so every later sign-in
 * resolved to it; and the workspace that had actually invited them became
 * permanently unreachable. Nothing errored at any point.
 */

const rows: Record<string, unknown> = {};
const inserted: unknown[] = [];

function table(name: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'is', 'gt']) chain[method] = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: rows[name] ?? null, error: null });
  chain.single = () => Promise.resolve({ data: rows[`${name}:single`] ?? null, error: null });
  chain.insert = (row: unknown) => {
    inserted.push({ table: name, row });
    const after: Record<string, unknown> = {};
    after.select = () => after;
    after.single = () => Promise.resolve({ data: rows[`${name}:single`] ?? null, error: null });
    return Object.assign(Promise.resolve({ error: null }), after);
  };
  chain.delete = () => chain;
  (chain as { then: unknown }).then = (r: (v: unknown) => unknown) =>
    r({ data: rows[`${name}:list`] ?? [], error: null });
  return chain;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (name: string) => table(name),
    // ensureAccountMembership now looks up the signing-in user's address to see
    // whether an office invitation is waiting for it. A literal rather than the
    // USER constant below: vi.mock is hoisted above these declarations.
    auth: {
      admin: {
        getUserById: () => Promise.resolve({
          data: { user: { id: '33333333-3333-4333-8333-333333333333', email: 'new@example.com' } },
          error: null,
        }),
      },
    },
  }),
}));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('@/lib/supabase-server', () => ({ createSupabaseServerClient: () => ({}) }));

const redirected: string[] = [];
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound'); },
  redirect: (to: string) => { redirected.push(to); throw new Error(`REDIRECT:${to}`); },
}));

const { ensureAccountMembership, getCurrentMembership } = await import('@/lib/auth');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const EMPLOYER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  for (const key of Object.keys(rows)) delete rows[key];
  inserted.length = 0;
  redirected.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('signing in as an office user', () => {
  it('does not provision a workspace for somebody who already joined one', async () => {
    // THE BUG. No owner row meant "brand-new signup", so they were handed an
    // empty business of their own and the one that hired them was orphaned.
    rows.memberships = { account_id: EMPLOYER, role: 'office' };
    const membership = await ensureAccountMembership(USER);
    expect(membership).toMatchObject({ account_id: EMPLOYER, role: 'office' });
    expect(inserted.filter((i) => (i as { table: string }).table === 'accounts')).toHaveLength(0);
  });

  it('still provisions for a genuinely new user', async () => {
    // The office check must not have turned every first sign-in into a no-op.
    rows.memberships = null;
    rows['accounts:single'] = { id: ACCOUNT };
    await ensureAccountMembership(USER);
    expect(inserted.some((i) => (i as { table: string }).table === 'accounts')).toBe(true);
    expect(inserted.some((i) => (i as { table: string; row: { role?: string } }).row?.role === 'owner')).toBe(true);
  });
});

describe('which workspace a person resolves to', () => {
  const resolve = async (memberships: unknown[]) => {
    rows['memberships:list'] = memberships;
    return getCurrentMembership(USER);
  };

  it('prefers the workspace they own', async () => {
    expect(await resolve([
      { account_id: EMPLOYER, role: 'office' },
      { account_id: ACCOUNT, role: 'owner' },
    ])).toMatchObject({ accountId: ACCOUNT, role: 'owner' });
  });

  it('prefers office over an older crew row', async () => {
    // Ordered oldest-first, so the crew row is data[0]. Taking it would put a
    // bookkeeper in the field app instead of at the business that hired them.
    expect(await resolve([
      { account_id: ACCOUNT, role: 'crew' },
      { account_id: EMPLOYER, role: 'office' },
    ])).toMatchObject({ accountId: EMPLOYER, role: 'office' });
  });

  it('leaves a crew-only user exactly where they were', async () => {
    expect(await resolve([{ account_id: ACCOUNT, role: 'crew' }]))
      .toMatchObject({ accountId: ACCOUNT, role: 'crew' });
  });

  it('reports nothing for somebody with no membership at all', async () => {
    expect(await resolve([])).toMatchObject({ accountId: null, role: null });
  });
});

describe('the owner guard sends them somewhere that exists', () => {
  it('does not send an office user to /login, which would loop', () => {
    // They are already signed in, so /login returns them straight here. The
    // loop is the failure; the wording is the point.
    const auth = readFileSync(join(process.cwd(), 'src', 'lib', 'auth.ts'), 'utf8');
    const officeBranch = auth.indexOf("membership.role === 'office'");
    const loginBranch = auth.indexOf("membership.role !== 'owner'");
    expect(officeBranch).toBeGreaterThan(0);
    // Order matters: the office case has to be decided before the catch-all.
    expect(officeBranch).toBeLessThan(loginBranch);
    expect(auth).toContain("redirect('/office-access')");
  });

  it('lands on a page outside the guard it was rejected by', () => {
    // Anything under /dashboard runs requireOwnerContext, so a page whose job
    // is to catch the people that guard rejects cannot live behind it.
    const page = readFileSync(
      join(process.cwd(), 'src', 'app', 'office-access', 'page.tsx'), 'utf8');
    // Not "never mentions it" -- the page explains in prose why it exists
    // outside that guard, and an assertion that forbade the word would forbid
    // the explanation. What must be absent is the IMPORT.
    expect(page).not.toMatch(/import[^;]*requireOwnerContext/);
    expect(page).toContain("redirect('/dashboard')");
    expect(page).toContain("redirect('/login')");
  });

  it('tells them the truth rather than showing an empty dashboard', () => {
    const page = readFileSync(
      join(process.cwd(), 'src', 'app', 'office-access', 'page.tsx'), 'utf8');
    expect(page).toMatch(/isn&apos;t switched on yet/);
    expect(page).toMatch(/Nothing has gone wrong with your sign-in/);
  });
});
