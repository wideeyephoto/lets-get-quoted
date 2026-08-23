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

  /**
   * EXACTLY THESE, AND THIS LIST IS THE POINT.
   *
   * The guard is a separate door, so a surface opens only by being changed to
   * ask for it. That makes the set of files naming requireOfficeContext the
   * complete inventory of what an office user can reach -- and this asserts it
   * by equality, not by containment, so opening a FIFTH surface fails here and
   * has to be added deliberately rather than noticed later.
   */
  it('names every surface that has been opened, and no others', () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
      for (const entry of readdirSync(join(process.cwd(), dir))) {
        const rel = `${dir}/${entry}`;
        if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry) && read(rel).includes('requireOfficeContext(')) callers.push(rel);
      }
    };
    walk('src/app');
    expect(callers.sort()).toEqual([
      'src/app/dashboard/automations/page.tsx',
      'src/app/dashboard/cash-flow/actions.ts',
      'src/app/dashboard/cash-flow/page.tsx',
      'src/app/dashboard/clients/[id]/page.tsx',
      'src/app/dashboard/clients/actions.ts',
      'src/app/dashboard/clients/page.tsx',
      'src/app/dashboard/crew/actions.ts',
      'src/app/dashboard/crew/page.tsx',
      'src/app/dashboard/crew/pay-actions.ts',
      'src/app/dashboard/crew/requests/[id]/page.tsx',
      'src/app/dashboard/crew/requests/new/page.tsx',
      'src/app/dashboard/crew/subcontractor-actions.ts',
      'src/app/dashboard/help/[caseId]/page.tsx',
      'src/app/dashboard/help/actions.ts',
      'src/app/dashboard/help/page.tsx',
      'src/app/dashboard/import/actions.ts',
      'src/app/dashboard/import/page.tsx',
      'src/app/dashboard/insights/page.tsx',
      'src/app/dashboard/jobs/[id]/arrival-actions.ts',
      'src/app/dashboard/jobs/[id]/change-order-actions.ts',
      'src/app/dashboard/jobs/[id]/invoices/[invoiceId]/page.tsx',
      'src/app/dashboard/jobs/[id]/milestone-actions.ts',
      'src/app/dashboard/jobs/[id]/page.tsx',
      'src/app/dashboard/jobs/[id]/quote/page.tsx',
      'src/app/dashboard/jobs/[id]/selection-actions.ts',
      'src/app/dashboard/jobs/[id]/warranty-actions.ts',
      'src/app/dashboard/jobs/actions.ts',
      'src/app/dashboard/jobs/invoices-actions.ts',
      'src/app/dashboard/jobs/page.tsx',
      'src/app/dashboard/jobs/payments-actions.ts',
      'src/app/dashboard/leads/[leadId]/page.tsx',
      'src/app/dashboard/leads/actions.ts',
      'src/app/dashboard/leads/page.tsx',
      'src/app/dashboard/marketing/actions.ts',
      'src/app/dashboard/marketing/blog/[id]/page.tsx',
      'src/app/dashboard/marketing/blog/actions.ts',
      'src/app/dashboard/marketing/blog/page.tsx',
      'src/app/dashboard/marketing/campaigns/page.tsx',
      'src/app/dashboard/marketing/email-theme/page.tsx',
      'src/app/dashboard/marketing/page.tsx',
      'src/app/dashboard/marketing/performance/page.tsx',
      'src/app/dashboard/messages/actions.ts',
      'src/app/dashboard/messages/page.tsx',
      'src/app/dashboard/quick-stops/actions.ts',
      'src/app/dashboard/quick-stops/page.tsx',
      'src/app/dashboard/rebook/actions.ts',
      'src/app/dashboard/rebook/page.tsx',
      'src/app/dashboard/recurring/actions.ts',
      'src/app/dashboard/recurring/page.tsx',
      'src/app/dashboard/reports/page.tsx',
      'src/app/dashboard/reviews/actions.ts',
      'src/app/dashboard/reviews/page.tsx',
      'src/app/dashboard/schedule/actions.ts',
      'src/app/dashboard/schedule/booking/page.tsx',
      'src/app/dashboard/schedule/page.tsx',
      'src/app/dashboard/schedule/plan/actions.ts',
      'src/app/dashboard/schedule/plan/offer-actions.ts',
      'src/app/dashboard/schedule/plan/page.tsx',
      'src/app/dashboard/schedule/plan/reschedule-actions.ts',
      'src/app/dashboard/schedule/settings/page.tsx',
      'src/app/dashboard/schedule/weather-actions.ts',
      'src/app/dashboard/services/actions.ts',
      'src/app/dashboard/services/page.tsx',
      'src/app/dashboard/settings/actions.ts',
      'src/app/dashboard/settings/office-team-actions.ts',
      'src/app/dashboard/settings/page.tsx',
      'src/app/dashboard/sites/actions.ts',
      'src/app/dashboard/sites/page.tsx',
      'src/app/dashboard/sites/preview/page.tsx',
    ]);
  });

  /**
   * WHICH leads actions are open, stated one by one.
   *
   * 11 of the 18 in this file are owner-only, and almost none of them for want
   * of a capability: they write storage or sms_* with the SERVICE ROLE, which
   * RLS does not cover, or they text the homeowner in the business's name. The
   * guard on each is the only thing standing there, so the split is asserted
   * rather than left to be re-derived.
   */
  it('opens the triage actions and nothing that leaves the building', () => {
    const actions = stripComments(read('src/app/dashboard/leads/actions.ts'));

    // patchLeadTriage is the whole body of snooze, unsnooze and archive.
    expect(actions).toContain("const { supabase, accountId } = await requireOfficeContext('leads.read', 'leads.write');");
    expect(actions).toContain("await requireOfficeContext('leads.read');");

    // The status split: `won` reaches job_feed with the service role, so it
    // alone keeps the owner guard.
    expect(actions).toContain("const { supabase, accountId } = status === 'won'");
    expect(actions).toContain('    ? await requireOwnerContext()');

    // Everything that sends, deletes or uploads stays owner-only. Asserted on
    // the guard each one actually runs, not on the absence of a symbol.
    for (const owner of [
      'createLeadAction', 'deleteLeadAction', 'declineLeadAction',
      'scheduleLeadQuoteVisitAction', 'sendLeadQuoteVisitOptionsAction',
      'sendQuoteAction', 'convertLeadAction', 'blockLeadContactAction',
      'setLeadLostAfterDaysAction', 'undoConvertLeadAction',
    ]) {
      const at = actions.indexOf(`export async function ${owner}`);
      expect(at, `${owner} is missing`).toBeGreaterThan(-1);
      const body = actions.slice(at, at + 900);
      expect(body, `${owner} must stay owner-only`).not.toContain('requireOfficeContext');
    }
  });

  it('withholds the lead detail page’s entire action panel', () => {
    // The panel holds exactly two things and an office user can run neither:
    // booking the estimate texts the homeowner, and the quote composer ends in
    // sendQuoteAction, which needs the disabled quotes.write. One gate rather
    // than several, because the whole aside is owner-only.
    const detail = stripComments(read('src/app/dashboard/leads/[leadId]/page.tsx'));
    expect(detail).toContain("const ownerControls = role === 'owner';");
    expect(detail).toContain('{ownerControls ? (');
    expect(detail).toContain('<aside className={styles.actionPanel}>');

    // The two owner-only reads are SKIPPED, not left to return null under RLS:
    // everything they feed lives in that hidden panel.
    expect(detail).toContain('ownerControls');
    expect(detail).toMatch(/ownerControls[\s\S]{0,80}from\('accounts'\)/);

    // Mark won and undo-convert are hidden in the deck; reopen, mark contacted
    // and mark LOST stay, because each is one update on the lead row.
    const deck = stripComments(read('src/app/dashboard/leads/[leadId]/LeadActionDeck.tsx'));
    expect(deck).toContain("{ownerControls && status !== 'won' ?");
    expect(deck).toContain('ownerControls ? <UndoQuoteButton');
    expect(deck).toContain('action={markContacted}');
    expect(deck).toContain('action={markLost}');
  });

  it('withholds every board control an office user cannot run', () => {
    // A control certain to fail is worse than one that is absent: the office
    // user cannot tell a permission problem from a broken product.
    const page = stripComments(read('src/app/dashboard/leads/page.tsx'));
    expect(page).toContain("ownerControls={role === 'owner'}");
    // Add, delete and the auto-close setting each reach past RLS or write
    // `accounts`, so all three are gated on the role rather than a capability.
    expect((page.match(/\{role === 'owner' \? \(/g) ?? []).length).toBeGreaterThanOrEqual(3);

    // Every view renders through the workspace, so each must receive the flag --
    // the board's Mark won, its drag into Won, and the detail links all hang off
    // it. A view added without it would not compile: the prop is required.
    // Every view that HAS an owner-only control must be handed the flag.
    // LeadTableView is deliberately absent: its bulk actions are Mark contacted,
    // Snooze and Archive, and its links go to the detail page, which admits an
    // office user -- so it has nothing to gate and takes no prop. If an
    // owner-only control is ever added there, add it here too.
    const workspace = stripComments(read('src/app/dashboard/leads/LeadsWorkspace.tsx'));
    for (const view of ['LeadBoardView', 'LeadPriorityView', 'SplitView', 'LeadFocusView']) {
      expect(workspace, `${view} was not given ownerControls`)
        .toMatch(new RegExp(`<${view}[^>]*ownerControls=`));
    }
  });
});