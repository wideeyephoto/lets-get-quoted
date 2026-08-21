import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The guard that lets an office user onto a dashboard surface, and the one that
 * still does not.
 *
 * `requireOwnerContext` has ~490 call sites and every one of them means "owner,
 * nobody else". It is NOT widened here and must never be: one miss is one
 * business reading another's customer list. `requireOfficeContext` is a separate
 * door, and a page or action opens to an office user only by being changed to
 * ask for it BY NAME along with the capability it needs. Everything nobody has
 * thought about stays owner-only by omission, which is the direction this has to
 * fail.
 */

const rows: Record<string, unknown> = {};

/**
 * `accounts` RLS, simulated, because the guard's correctness depends on it.
 *
 * The real policy is `acc_read` = `is_owner(id)`. An office user reading its own
 * workspace row through the SESSION client therefore gets nothing — and a null
 * row reads as "not suspended", which is precisely the gate that would silently
 * pass. Without this the mock answers both clients identically, and the
 * suspension test passes whether the guard reads with the service role or not:
 * a test that has stopped testing.
 */
function rlsBlind(name: string, client: 'admin' | 'session'): boolean {
  return name === 'accounts' && client === 'session' && currentRole === 'office';
}

function table(name: string, client: 'admin' | 'session' = 'admin') {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'is']) chain[method] = () => chain;
  chain.maybeSingle = () => Promise.resolve(
    rlsBlind(name, client)
      ? { data: null, error: null }
      : { data: rows[name] ?? null, error: rows[`${name}:error`] ?? null },
  );
  chain.single = () => Promise.resolve({ data: rows[`${name}:single`] ?? null, error: null });
  chain.insert = () => {
    const after: Record<string, unknown> = {};
    after.select = () => after;
    after.single = () => Promise.resolve({ data: rows[`${name}:single`] ?? null, error: null });
    return Object.assign(Promise.resolve({ error: null }), after);
  };
  chain.delete = () => chain;
  (chain as { then: unknown }).then = (r: (v: unknown) => unknown) =>
    r({ data: rows[`${name}:list`] ?? [], error: rows[`${name}:error`] ?? null });
  return chain;
}

let currentUser: { id: string; email: string } | null = { id: 'user-1', email: 'office@example.com' };
let currentRole: 'owner' | 'office' | 'crew' = 'office';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (name: string) => table(name, 'admin') }),
}));
vi.mock('next/headers', () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: () => ({
    from: (name: string) => table(name, 'session'),
    auth: { getUser: () => Promise.resolve({ data: { user: currentUser } }) },
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound'); },
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));

const { requireOfficeContext, requireOwnerContext, requireDashboardShellContext, loadHeldCapabilities } =
  await import('@/lib/auth');
const { TERMS_VERSION } = await import('@/lib/terms');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

/** The redirect a guard threw, or null if it returned. */
const redirectOf = async (run: () => Promise<unknown>): Promise<string | null> => {
  try {
    await run();
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw error;
  }
};

const asOffice = (capabilities: string[]) => {
  currentRole = 'office';
  rows['memberships:list'] = [{ account_id: ACCOUNT, role: 'office' }];
  rows.memberships = { account_id: ACCOUNT, role: 'office' };
  rows['office_capabilities:list'] = capabilities.map((capability) => ({ capability }));
  // Settled, unsuspended, terms accepted.
  rows.accounts = { suspended_at: null, terms_accepted_at: '2026-01-01', terms_version: TERMS_VERSION, timezone: 'UTC' };
};

const asOwner = () => {
  currentRole = 'owner';
  rows['memberships:list'] = [{ account_id: ACCOUNT, role: 'owner' }];
  rows.memberships = { account_id: ACCOUNT, role: 'owner' };
  rows.accounts = { suspended_at: null, terms_accepted_at: '2026-01-01', terms_version: TERMS_VERSION, timezone: 'UTC' };
};

beforeEach(() => {
  for (const key of Object.keys(rows)) delete rows[key];
  currentUser = { id: 'user-1', email: 'office@example.com' };
  currentRole = 'office';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('requireOwnerContext still means owner, nobody else', () => {
  it('sends an office user away even when they hold the capability', async () => {
    // The whole safety property. Nothing becomes reachable by being left alone:
    // ~490 unconverted call sites keep refusing office users with no edit.
    asOffice(['leads.read', 'leads.write']);
    expect(await redirectOf(() => requireOwnerContext())).toBe('/office-access');
  });

  it('still admits an owner', async () => {
    asOwner();
    expect(await redirectOf(() => requireOwnerContext())).toBeNull();
  });

  it('still blocks a suspended account', async () => {
    asOwner();
    rows.accounts = { suspended_at: '2026-08-01', terms_accepted_at: '2026-01-01', terms_version: TERMS_VERSION };
    expect(await redirectOf(() => requireOwnerContext())).toBe('/account-suspended');
  });

  it('still sends an owner who has not accepted terms to /welcome', async () => {
    asOwner();
    rows.accounts = { suspended_at: null, terms_accepted_at: null, terms_version: null };
    expect(await redirectOf(() => requireOwnerContext())).toBe('/welcome');
  });

  it('still fails OPEN on the pre-migration shape', async () => {
    // `acct` null means the read failed or the column does not exist yet. The
    // inverse default would turn one mis-ordered deploy into every owner locked
    // out of their own dashboard.
    asOwner();
    rows.accounts = null;
    expect(await redirectOf(() => requireOwnerContext())).toBeNull();
  });
});

describe('requireOfficeContext', () => {
  it('admits an office user holding every capability it names', async () => {
    asOffice(['leads.read', 'leads.write']);
    expect(await redirectOf(() => requireOfficeContext('leads.read'))).toBeNull();
    expect(await redirectOf(() => requireOfficeContext('leads.read', 'leads.write'))).toBeNull();
  });

  it('turns away an office user missing ANY of them', async () => {
    // All, not some. A jobs screen that cannot read clients is a list of work
    // for nobody, so a page naming two capabilities needs both.
    asOffice(['leads.read']);
    expect(await redirectOf(() => requireOfficeContext('leads.read', 'leads.write')))
      .toBe('/dashboard/leads');
  });

  it('sends somebody holding nothing to the holding page, not into a loop', async () => {
    asOffice([]);
    expect(await redirectOf(() => requireOfficeContext('leads.read'))).toBe('/office-access');
  });

  it('admits an owner unconditionally', async () => {
    // office_can()'s own first clause, restated. If the two ever disagreed,
    // opening a surface for an employee would close it for the person who owns
    // the business.
    asOwner();
    rows['office_capabilities:list'] = [];
    expect(await redirectOf(() => requireOfficeContext('leads.read', 'anything.at.all'))).toBeNull();
  });

  it('refuses to be called with no capability at all', async () => {
    // A guard asked for nothing would admit every office user to whatever it
    // guards. That is a mistake at the call site, not a permissive default.
    asOffice(['leads.read']);
    await expect(requireOfficeContext()).rejects.toThrow(/at least one capability/);
  });

  it('blocks an office user in a SUSPENDED account', async () => {
    // The gate that would have silently passed. `accounts` has acc_read as
    // is_owner(id), so an office user's read through the session client returns
    // NOTHING -- which reads as "not suspended". The guard reads with the
    // service role for exactly this reason.
    asOffice(['leads.read']);
    rows.accounts = { suspended_at: '2026-08-01', terms_accepted_at: '2026-01-01', terms_version: TERMS_VERSION };
    expect(await redirectOf(() => requireOfficeContext('leads.read'))).toBe('/account-suspended');
  });

  it('does not send an office user to /welcome to accept somebody else’s terms', async () => {
    // They cannot agree on behalf of the business, and could not proceed if they
    // declined. The business has not finished setting itself up; the holding
    // page says so, and the owner is the one who can change it.
    asOffice(['leads.read']);
    rows.accounts = { suspended_at: null, terms_accepted_at: null, terms_version: null };
    expect(await redirectOf(() => requireOfficeContext('leads.read'))).toBe('/office-access');
  });

  it('sends a signed-out visitor to /login', async () => {
    currentUser = null;
    expect(await redirectOf(() => requireOfficeContext('leads.read'))).toBe('/login');
  });

  it('sends a crew member to /login rather than treating them as office', async () => {
    rows['memberships:list'] = [{ account_id: ACCOUNT, role: 'crew' }];
    rows.memberships = { account_id: ACCOUNT, role: 'crew' };
    expect(await redirectOf(() => requireOfficeContext('leads.read'))).toBe('/login');
  });
});

describe('capabilities fail closed', () => {
  it('grants nothing when the catalog cannot be read', async () => {
    // Showing an employee a screen they should not see cannot be undone by a
    // later deploy, so a read error means "holds nothing".
    rows['office_capabilities:error'] = { message: 'boom' };
    expect((await loadHeldCapabilities('office')).size).toBe(0);
  });

  it('grants nothing to a crew member or a signed-out visitor', async () => {
    expect((await loadHeldCapabilities('crew')).size).toBe(0);
    expect((await loadHeldCapabilities(null)).size).toBe(0);
  });

  it('grants an owner everything, including keys nobody has defined', async () => {
    const held = await loadHeldCapabilities('owner');
    expect(held.has('leads.read')).toBe(true);
    expect(held.has('a.capability.invented.next.year')).toBe(true);
  });
});

describe('the dashboard shell admits members without deciding anything', () => {
  it('lets an office user through so a page can make the decision', async () => {
    asOffice([]);
    expect(await redirectOf(() => requireDashboardShellContext())).toBe(null);
  });

  it('still applies the suspension gate', async () => {
    asOffice(['leads.read']);
    rows.accounts = { suspended_at: '2026-08-01', terms_accepted_at: '2026-01-01', terms_version: TERMS_VERSION };
    expect(await redirectOf(() => requireDashboardShellContext())).toBe('/account-suspended');
  });

  it('reports the role, so the shell can withhold owner-only chrome', async () => {
    asOffice(['leads.read']);
    const shell = await requireDashboardShellContext();
    expect(shell.role).toBe('office');
  });
});

describe('the wiring, as source', () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

  /**
   * Code with the prose taken out.
   *
   * Block comments go WHOLE rather than line by line: the note above the
   * layout's guard legitimately explains what the OTHER guard still does at
   * every unconverted page, and the first version of the assertion below caught
   * that sentence instead of the code it was checking.
   */
  const stripComments = (source: string) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

  it('the layout asks the shell guard, not the owner guard', () => {
    // The layout wraps every dashboard route. Asking requireOwnerContext there
    // would bounce an office user off a page they are allowed to open, before
    // the page's own guard ever ran.
    // Comments stripped whole: the note above the call legitimately explains
    // what the OTHER guard still does at every unconverted page, and the first
    // version of this assertion caught that sentence instead of the code.
    const layout = stripComments(read('src/app/dashboard/layout.tsx'));
    expect(layout).toContain('requireDashboardShellContext()');
    expect(layout).not.toContain('requireOwnerContext');
  });

  it('the layout withholds the Stripe banner from an office user', () => {
    // An instruction they cannot follow about money that is not theirs, whose
    // action is owner-gated anyway.
    expect(read('src/app/dashboard/layout.tsx')).toContain("role !== 'owner'");
  });

  it('NOTHING under /dashboard has been opened yet, and that is deliberate', () => {
    // This is a tripwire, and it is meant to fail the day somebody converts the
    // first page -- at which point they should update it to name that page,
    // having decided the capability deliberately rather than by copying a
    // neighbouring line.
    //
    // The mechanism ships inert on purpose: the leads BOARD was audited action
    // by action and 11 of its 18 actions turned out to be owner-only for
    // reasons that have nothing to do with capabilities -- service-role writes
    // to storage and sms_*, and outbound texts sent in the business's name.
    // Converting the page is a product decision about what is left, not a
    // mechanical edit.
    const opened = read('src/lib/auth.ts');
    expect(opened).toContain('export async function requireOfficeContext');

    const roots = ['src/app/dashboard', 'src/app/office-access'];
    const callers: string[] = [];
    const walk = (dir: string) => {
      const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
      for (const entry of readdirSync(join(process.cwd(), dir))) {
        const rel = `${dir}/${entry}`;
        if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry) && read(rel).includes('requireOfficeContext(')) callers.push(rel);
      }
    };
    for (const root of roots) walk(root);
    expect(callers).toEqual([]);
  });
});
