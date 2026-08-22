import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { signingKeys } from '@/lib/auth-jwks';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { clientIpFrom } from '@/lib/rate-limit';
import { deniedMessage, parseStaffRole, staffCan, type Permission, type StaffRole } from '@/lib/staff';
import { needsFirstRun, type FirstRunAccount } from '@/lib/terms';
import { OFFICE_NO_ACCESS_PATH, officeLandingPath } from '@/lib/office-access';

/**
 * React's per-request memoization, where it exists.
 *
 * `cache` lives in the copy of React that Next vendors for the server, which is
 * what `react` resolves to in a Next build. It is NOT exported by the react
 * 18.3.1 in node_modules, which is what Vitest resolves — so under the test
 * runner this import is undefined and calling it threw at module load, taking
 * down 29 test files that only import this module in passing.
 *
 * Falling back to the identity wrapper is safe: it means no memoization, which
 * is exactly how every one of these call sites behaved before. Deduplication is
 * a performance property, never a correctness one — nothing here may depend on
 * being called once.
 */
const perRequest: typeof cache = typeof cache === 'function' ? cache : (fn) => fn;

// Service-role client bypasses RLS for trusted server-side writes.
// Never expose this client or its key to the browser.
/**
 * Every Supabase request must reach Postgres, never Next's data cache.
 *
 * Next.js patches global fetch in the server runtime and supabase-js uses it, so
 * an identical outbound request can be served from cache instead of being sent.
 * On 2026-08-18 that silently broke the billing projection worker: its claim RPC
 * returned the SAME already-processed event on all ten iterations of a batch,
 * because only the first call left the process. The worker reported
 * claimed:10 processed:10 failures:0 while the database recorded no claim at all,
 * and it would have spun on one event every five minutes forever without ever
 * draining the queue.
 *
 * It only reproduces when deployed. Under vitest global fetch is unpatched, so the
 * same code claimed distinct rows and stopped correctly — which is why the suite
 * was green and three verified-correct layers each looked innocent.
 *
 * A database read is never a cacheable fetch. This applies to all of them.
 */
export const noStoreFetch: typeof fetch = (input, init) => (
  fetch(input, { ...init, cache: 'no-store' })
);

export function createAdminClient() {
  return createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: noStoreFetch },
    }
  );
}

export type CurrentMembership = {
  accountId: string | null;
  /**
   * `office` is written by `accept_office_invitation` (20260819210000) and is
   * a real state a signed-in person can be in.
   *
   * It resolves ahead of `crew` below, and `requireOwnerContext` sends it to
   * /office-access rather than /login — which would loop, since they are
   * already signed in. What an office user may actually DO is still nothing:
   * `is_owner` deliberately still means owner, and every policy built on it is
   * unmoved. See docs/office-seat-activation.md.
   */
  role: 'owner' | 'crew' | 'office' | null;
};

export async function getCurrentMembership(userId: string): Promise<CurrentMembership> {
  // Use the admin client to bypass RLS.
  const supabase = createAdminClient();

  // A user can belong to multiple accounts (own their business + be on another's
  // crew). PREFER an 'owner' membership so a dual-role user always resolves to
  // their owner account and isn't bounced off the owner dashboard by an older
  // crew membership. Fall back to the oldest membership otherwise — crew-only
  // users have no owner row, so they keep resolving to their crew account exactly
  // as before. (Also resolves deterministically past any duplicate-membership
  // race instead of maybeSingle() erroring on multiple rows.)
  const { data, error: membershipError } = await supabase
    .from('memberships')
    .select('account_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (membershipError || !data || data.length === 0) {
    return { accountId: null, role: null };
  }

  // Owner first, then OFFICE, then the oldest of whatever is left. The middle
  // one is new and load-bearing: an office user who is also on somebody's crew
  // would otherwise resolve to the crew row purely because it is older, and land
  // in the field app instead of at the business that hired them.
  const chosen = data.find((m) => m.role === 'owner')
    ?? data.find((m) => m.role === 'office')
    ?? data[0];
  return {
    accountId: chosen.account_id ?? null,
    role: chosen.role ?? null,
  };
}

export async function ensureAccountMembership(
  userId: string,
  options: { arrivingAtInvitation?: boolean } = {},
) {
  const admin = createAdminClient();

  // Return an existing OWNER membership if the user already owns an account.
  // Deliberately do NOT short-circuit on a crew-only membership: being on someone
  // else's crew must not lock you out of owning your own account. This runs only
  // on OWNER sign-in entry points (magic link, phone, OAuth callback) — never the
  // crew callback — so a user with only crew memberships gets a fresh owner
  // account provisioned here, exactly like any brand-new user hitting /dashboard.
  const { data: ownerMembership } = await admin
    .from('memberships')
    .select('account_id, role')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (ownerMembership) {
    return ownerMembership;
  }

  // AN OFFICE USER IS NOT A NEW SIGNUP. Somebody who accepted an invitation has
  // a membership already; provisioning them a workspace here would hand them an
  // empty business of their own and quietly orphan the one that hired them --
  // and because the new row would be an OWNER row, every later sign-in would
  // resolve to it and the employer's workspace would never be reachable again.
  //
  // This check goes AFTER the owner lookup on purpose: somebody who runs their
  // own business and also keeps the books for another keeps landing in their
  // own, exactly as before.
  const { data: officeMembership } = await admin
    .from('memberships')
    .select('account_id, role')
    .eq('user_id', userId)
    .eq('role', 'office')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (officeMembership) {
    return officeMembership;
  }

  // AN INVITATION IS ACCEPTED AFTER SIGN-IN, which is the case the check
  // above cannot catch. /office-invite/<token> bounces an anonymous visitor
  // to /login and back, so on the one sign-in every office user must pass
  // through there is no office membership to find yet. Provisioning here
  // hands them an owner row seconds before they accept, and owner outranks
  // office in getCurrentMembership -- so the workspace that hired them is
  // unreachable from then on, which is exactly what the comment above is
  // written to prevent. Crew avoids this by never calling this function at
  // all (auth/crew-callback says so in its own header); office arrives on
  // the ordinary owner login rail, so the CALLER has to say so. The three
  // callbacks can: they hold `next`, and it names the invitation.
  //
  // WHY THE CALLER AND NOT A LOOKUP HERE. The first version asked the
  // database "does this address have a pending invitation?" -- a different
  // question, and its answer PERSISTS. It suppressed provisioning on every
  // sign-in for as long as the row lived, stranding anyone who was invited
  // and wanted their own account instead: no membership, and the guards
  // below send a memberless user to /login, which is a loop because they
  // are already signed in. Worse, anybody may invite any address, so it was
  // a way to stop an arbitrary email from ever completing a signup.
  //
  // This condition lasts exactly one request and heals by itself: if the
  // accept fails for any reason, the next visit to /dashboard provisions
  // them normally.
  if (options.arrivingAtInvitation) {
    return null;
  }

  const { data: newAccount, error: createAccountError } = await admin
    .from('accounts')
    .insert({ business_name: 'My Business' })
    .select('id')
    .single();

  if (createAccountError || !newAccount) {
    throw createAccountError ?? new Error('Unable to create account');
  }

  const { error: createMembershipError } = await admin.from('memberships').insert({
    account_id: newAccount.id,
    user_id: userId,
    role: 'owner',
  });

  if (createMembershipError) {
    // We lost a provisioning race. This is not hypothetical: a brand-new user's
    // first page load fires several concurrent requests (the document plus its
    // RSC payload, plus any prefetch), each of which reaches here, sees no owner
    // membership, and creates an account. Measured on a fresh signup: TWO
    // accounts six milliseconds apart, and the duplicate memberships then made
    // .maybeSingle() fail for anything looking the user up.
    //
    // The unique index added in 2026-08-03-one-owner-account.sql is what turns
    // that silent duplication into this error. The loser deletes the account it
    // just made — nothing else can reference it yet, it is milliseconds old —
    // and adopts the winner's, so both requests agree on one account.
    await admin.from('accounts').delete().eq('id', newAccount.id);

    const { data: winner } = await admin
      .from('memberships')
      .select('account_id, role')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (winner) return winner;
    throw createMembershipError;
  }

  return { account_id: newAccount.id, role: 'owner' };
}

/**
 * The columns every dashboard guard gates on.
 *
 * No longer a select list. The guards read the account row EMBEDDED in the
 * membership query as `accounts(*)`, deliberately: naming a column the database
 * has not migrated yet fails the whole query, and here that would mean every
 * owner bounced to /login on a deploy that landed ahead of its migration. What
 * survives as a list is this type, and the gates below still treat a column that
 * is simply absent as "carry on".
 */
type AccountGateRow = {
  suspended_at?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  timezone?: string | null;
} | null | undefined;

/**
 * The gates a dashboard session passes once its role is known.
 *
 * ONE COPY, TWO GUARDS. requireOwnerContext and requireOfficeContext both apply
 * these, and a rule about suspension written out twice is a rule that will
 * eventually only be true once.
 *
 * The READ is deliberately NOT shared, and the reason is a policy: `accounts`
 * has `acc_read` as `is_owner(id)`, so an office user reading its own workspace
 * row through the SESSION client gets NOTHING back. Passing that null in here
 * would read as "not suspended" and let an office user keep working inside a
 * business staff had suspended. The office guard therefore reads with the
 * service role and hands the row in; the owner guard keeps its RLS read, which
 * for an owner returns the same row either way.
 */
function applyAccountGates(
  acct: AccountGateRow,
  options: { role: 'owner' | 'office'; skipFirstRunGate?: boolean },
): void {
  // Staff-suspended accounts are blocked from the whole workspace until lifted,
  // whoever is asking. Defensive: a missing column (pre-migration) or read error
  // is treated as "not suspended" so this never breaks the dashboard before it
  // is deployed.
  if (acct && acct.suspended_at) {
    redirect('/account-suspended');
  }

  // Terms of Service gate. Lives here rather than in the dashboard layout
  // because a server action is a public endpoint: a check that only runs while
  // rendering a page is not a check. /welcome passes skipFirstRunGate so it can
  // render and so its own action can save without redirecting to itself.
  //
  // Fails OPEN, deliberately, and only on the specific shape that means "this
  // deploy is ahead of its migration": `acct` null (read failed, or the selected
  // column does not exist yet) means carry on. A successful read with the column
  // present and empty is the only thing that gates. The inverse default would
  // turn one mis-ordered deploy into every owner locked out of their dashboard,
  // and this exists to have an agreement on file — not as a security boundary.
  const hasTermsColumns = acct !== null && acct !== undefined && 'terms_accepted_at' in acct;
  if (!hasTermsColumns) return;

  if (options.role === 'office') {
    // An office user cannot agree to terms on behalf of the business, so
    // /welcome is not a page to send them to -- they would be asked to accept an
    // agreement that is not theirs, and could not proceed if they declined. The
    // business has not finished setting itself up; the holding page says exactly
    // that, and the owner is the one who can change it.
    if (needsFirstRun(acct as FirstRunAccount)) redirect(OFFICE_NO_ACCESS_PATH);
    return;
  }

  if (!options.skipFirstRunGate && needsFirstRun(acct as FirstRunAccount)) {
    redirect('/welcome');
  }
}

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

/**
 * Who is asking, verified LOCALLY.
 *
 * `getUser()` posts the access token to /auth/v1/user and waits for the Auth
 * server on every single call — on a page load, on every server action. This
 * project signs its tokens with ES256 (see the ki<d> in /auth/v1/.well-known/
 * jwks.json), so the signature can be checked here with WebCrypto against a
 * cached public key and no network at all. `getClaims` is supabase-js's own
 * supported path for that, and it still reads the session through getSession(),
 * so the near-expiry refresh is untouched.
 *
 * WHAT THIS GIVES UP, precisely: a cryptographically valid, unexpired token is
 * now accepted without asking the Auth server whether that user has since been
 * banned or deleted. That is a real change and it is bounded by the access
 * token's own lifetime.
 *
 * It is survivable here because the sharp instrument is not the ban. Staff lock
 * an account out with `suspended_at`, which is a column read on every single
 * request a few lines below and is completely unaffected. The ban path —
 * signOutAllSessionsAction — is already documented, in its own comment and in
 * the UI it drives, as blocking the next token REFRESH rather than killing a
 * live token, so it was never the instant kill switch.
 *
 * requireAdmin() deliberately keeps calling getUser(). The staff console is a
 * higher-value target on a fraction of the traffic, so it has nothing to gain
 * here and something to lose.
 */
async function verifiedUser(
  supabase: SupabaseServerClient,
): Promise<{ id: string; email: string | null } | null> {
  const read = async (keys: Awaited<ReturnType<typeof signingKeys>>) =>
    supabase.auth.getClaims(undefined, keys ? { keys } : {});

  let { data, error } = await read(await signingKeys());
  if (error) {
    // A rotated key is the one failure worth a second look: refetch the set and
    // try once more before treating it as "not signed in". Any other error is
    // still just a failed verification, and a second attempt costs one fetch.
    ({ data, error } = await read(await signingKeys({ force: true })));
  }
  if (error || !data?.claims?.sub) return null;

  const claims = data.claims as { sub: string; email?: unknown };
  return { id: String(claims.sub), email: typeof claims.email === 'string' ? claims.email : null };
}

/**
 * Every membership this user holds, each with its account row attached, in ONE
 * round trip.
 *
 * This was three: getUser() over the network, a memberships lookup, then an
 * accounts lookup keyed on what that returned — strictly serial, because each
 * needs the one before it. PostgREST can follow the memberships.account_id
 * foreign key itself (there is exactly one FK from memberships to accounts, so
 * the embed is unambiguous), which folds the third into the second, and
 * verifiedUser above removes the first.
 *
 * ALL memberships, not just the owner row. The choice between them belongs to
 * chooseMemberRow, which has to see the whole set to make the same decision
 * getCurrentMembership makes — and an office user, who has no owner row at all,
 * must be recognised as office rather than mistaken for a brand-new signup.
 *
 * `accounts(*)` rather than a column list, for the same reason the automations
 * page selects `*`: naming a column the database has not migrated yet fails the
 * WHOLE query, which here would mean every owner bounced to /login. Embedding
 * everything cannot fail that way, and a column that does not exist simply is
 * not on the object — which is exactly what the gates below already test for.
 *
 * Read with the SERVICE ROLE, not the session client, and that is stricter than
 * what it replaces. `accounts` has `acc_read` as `is_owner(id)`, so an office
 * user reading its own workspace row through RLS gets NOTHING back — and a null
 * row reads as "not suspended", which would let somebody keep working inside a
 * business staff had suspended.
 */
type MemberRow = { account_id: string | null; role: string | null; accounts: unknown };

async function readMemberRows(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<MemberRow[]> {
  const { data } = await admin
    .from('memberships')
    .select('account_id, role, accounts(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (data ?? []) as MemberRow[];
}

/**
 * Which membership this request is acting under.
 *
 * The same preference getCurrentMembership applies, and it has to stay the same:
 * owner first so a dual-role user always lands in their own business, then
 * OFFICE so somebody who keeps another company's books is not dropped into the
 * field app by an older crew row, then the oldest of whatever is left.
 */
function chooseMemberRow(rows: MemberRow[]): MemberRow | null {
  return rows.find((row) => row.role === 'owner')
    ?? rows.find((row) => row.role === 'office')
    ?? rows[0]
    ?? null;
}

/** A to-one embed comes back as an object; tolerate an array in case it does not. */
function embeddedAccount(row: MemberRow | null): Record<string, unknown> | null {
  const raw = row?.accounts;
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value as Record<string, unknown>) ?? null;
}

/**
 * The session, its membership and its account row — resolved once per request.
 *
 * Every dashboard page is rendered under a layout that needs the same three
 * things, so this ran TWICE per page load: the layout through
 * requireDashboardShellContext and the page through requireOwnerContext, each
 * paying its own getUser() over the network plus a memberships read plus an
 * accounts read. React's `cache()` is keyed per request, so the layout pays for
 * it and the page gets it free.
 *
 * Takes no arguments on purpose. The gates differ between the two callers — an
 * office user is redirected by one and admitted by the other — so the GATES stay
 * in the callers and only the reads are shared. Nothing here redirects; a caller
 * decides what a missing session or the wrong role means for it.
 *
 * Outside a render — a Route Handler, say — React has no cache dispatcher and
 * `cache()` documents that it simply calls through, so those callers behave
 * exactly as they did before.
 */
const loadSessionMember = perRequest(async () => {
  const supabase = createSupabaseServerClient();
  const user = await verifiedUser(supabase);
  if (!user) return null;

  const admin = createAdminClient();
  let rows = await readMemberRows(admin, user.id);

  // ensureAccountMembership is skipped where it would return early anyway. Its
  // own first two lookups ask "is there an owner row" and "is there an office
  // row", and both answers are already in `rows` — so calling it in those cases
  // is a round trip that provisions nothing and changes nothing.
  //
  // What is left is exactly the set it was written to serve: somebody with no
  // membership at all, and somebody who is ONLY on another business's crew, who
  // is deliberately given an owner account of their own here rather than being
  // locked out of owning a business because they once worked for one.
  //
  // The office case is the one that must not slip. An office user has no owner
  // row, so a bare check for "no owner row" would send them through provisioning
  // and hand them an empty workspace of their own — and because that row would
  // be an OWNER row, every later sign-in would resolve to it and the business
  // that hired them would never be reachable again. That is the bug the office
  // short-circuit inside ensureAccountMembership exists to prevent, and this
  // condition is written to agree with it rather than to route around it.
  if (!rows.some((row) => row.role === 'owner' || row.role === 'office')) {
    try {
      await ensureAccountMembership(user.id);
    } catch (error) {
      console.error('ensureAccountMembership error:', error);
      throw error;
    }
    rows = await readMemberRows(admin, user.id);
  }

  return { supabase, user, member: chooseMemberRow(rows) };
});

// Shared guard for server components/actions that require a logged-in owner.
// Returns a session-scoped (RLS-respecting) Supabase client plus the resolved
// user + account context. Redirects to /login if any check fails.
export async function requireOwnerContext(options: { skipFirstRunGate?: boolean } = {}) {
  const session = await loadSessionMember();

  if (!session) {
    redirect('/login');
  }

  const { supabase, user, member } = session;

  // An office user has a real membership and no owner surface to be given yet.
  // Sending them to /login would loop -- they are already signed in, so logging
  // in returns them straight here -- and it would read as a broken account
  // rather than as access that has not been switched on.
  if (member?.account_id && member.role === 'office') {
    redirect('/office-access');
  }

  if (!member?.account_id || member.role !== 'owner') {
    redirect('/login');
  }

  // Staff-suspended accounts are blocked from the owner surface until lifted.
  // Defensive: a missing column (pre-migration) or read error is treated as
  // "not suspended" so this never breaks the dashboard before it's deployed.
  // The row arrived embedded in the membership read above, so the gates cost
  // nothing extra here.
  const acct = embeddedAccount(member);
  applyAccountGates(acct as AccountGateRow, { role: 'owner', skipFirstRunGate: options.skipFirstRunGate });

  // userEmail is who to write into an audit trail. Anything that records a
  // decision — approving hours, marking a crew member paid — has to name a
  // person, and "the account" isn't a person.
  return {
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    accountId: member.account_id,
    accountTimeZone: (acct as { timezone?: string | null } | null)?.timezone || 'America/New_York',
    /**
     * The whole account row, already in hand.
     *
     * It is fetched here regardless — the suspension and terms gates need it —
     * and it is fetched as `accounts(*)`, so it holds every column. Callers that
     * want one more setting off this row should read it from here rather than
     * issuing a second query for it; that second query was the single most
     * repeated round trip in the dashboard.
     *
     * Null only when the read failed, which the gates above already treat as
     * "carry on" — so consumers must keep their own defaults rather than
     * assuming a row.
     */
    account: acct,
  };
}

// --- Internal staff console (/admin) -----------------------------------------
// Bootstrap allowlist plus a database-managed directory.
//
//   1. ADMIN_EMAILS bootstraps the first staff rows and remains a break-glass
//      route. It is not the day-to-day provisioning interface.
//   2. The service-role-only `staff` row decides who can enter and what they can
//      do. Role is a real
//      authorization boundary (src/lib/staff.ts holds the matrix), and an
//      inactive row denies everything even while the env still allows entry,
//      because revoking access has to work faster than a redeploy.
//
// An ADMIN_EMAILS entry is a bare email or "email:role". An unlabelled entry
// resolves to super_admin, which is exactly what it has always meant — anything
// else would lock the team out of their own console on the deploy that ships
// this.
export type { StaffRole } from './staff';

function adminAllowlist(): Map<string, StaffRole> {
  const map = new Map<string, StaffRole>();
  for (const entry of (process.env.ADMIN_EMAILS ?? '').split(',')) {
    const [emailPart, rolePart] = entry.trim().split(':');
    const email = emailPart?.trim().toLowerCase();
    if (!email) continue;
    // Bare and unrecognised tokens both fall back to super_admin: that is the
    // access every entry already had, and a security change that silently
    // demotes the person deploying it will be reverted rather than fixed.
    map.set(email, parseStaffRole(rolePart, 'super_admin'));
  }
  return map;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminAllowlist().has(email.trim().toLowerCase());
}

/** The role ADMIN_EMAILS declares. Only ever a SEED — the staff row wins. */
export function staffRoleFor(email: string | null | undefined): StaffRole {
  if (!email) return 'super_admin';
  return adminAllowlist().get(email.trim().toLowerCase()) ?? 'super_admin';
}

export type StaffRecord = {
  id: string;
  email: string;
  role: StaffRole;
  active: boolean;
  display_name: string | null;
};

export type AdminContext = {
  admin: ReturnType<typeof createAdminClient>;
  adminEmail: string;
  userId: string;
  role: StaffRole;
  staff: StaffRecord;
  /** Where the request came from, for the audit trail. */
  ip: string | null;
  /**
   * One id for everything written while handling this request, so the refund,
   * the credit and the note that came with it stop being three unrelated rows
   * a second apart.
   */
  requestId: string;
  /**
   * Which permission authorised this request, stamped by requirePermission.
   * It rides into the audit row, which makes an access review answerable from
   * the log ("who used money.refund last quarter") rather than from the code.
   *
   * A plain string rather than Permission, because an action that crosses two
   * boundaries records both — "money.refund + account.enforce". It is an audit
   * label, never read back as a check: staffCan() is the only thing that
   * decides authority, and it takes a Permission.
   */
  permission?: string;
};

/**
 * Find the staff row for an allowlisted email, creating it on first sight.
 *
 * Auto-provisioning is what makes this deployable: without it, shipping the
 * permission check would lock out everybody at once, and the first person in
 * would have no way to grant themselves the access needed to grant access. The
 * seed is the role ADMIN_EMAILS already declares, so nothing changes on the
 * deploy — an unlabelled entry was full access before and stays full access.
 *
 * Once the row exists the DATABASE wins. Editing ADMIN_EMAILS afterwards
 * changes who can get in, never what they can do; that is /admin/staff's job,
 * and it is the half that leaves a history.
 */
async function resolveStaff(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  allowProvision = true,
): Promise<StaffRecord> {
  const columns = 'id, email, role, active, display_name';
  const { data: existing } = await admin.from('staff').select(columns).ilike('email', email).maybeSingle();
  if (existing) {
    const row = existing as StaffRecord;
    // Best-effort presence, for access reviews ("nobody has used this in a
    // year"). Never allowed to fail the request.
    void admin.from('staff').update({ last_seen_at: new Date().toISOString() }).eq('id', row.id).then(
      () => undefined,
      (err: unknown) => console.error('staff last_seen_at update failed:', err),
    );
    return { ...row, role: parseStaffRole(row.role, 'read_only') };
  }

  if (!allowProvision) return { id: '', email, role: 'read_only', active: false, display_name: null };

  const seeded = staffRoleFor(email);
  const { data: created, error } = await admin
    .from('staff')
    .insert({ email, role: seeded, active: true, last_seen_at: new Date().toISOString() })
    .select(columns)
    .single();
  if (created) return { ...(created as StaffRecord), role: parseStaffRole((created as StaffRecord).role, 'read_only') };

  // Lost a race against a concurrent first sign-in: the unique index rejected
  // the insert and the row now exists. Read it rather than failing.
  console.error('staff auto-provision insert failed, re-reading:', error);
  const { data: raced } = await admin.from('staff').select(columns).ilike('email', email).maybeSingle();
  if (raced) return { ...(raced as StaffRecord), role: parseStaffRole((raced as StaffRecord).role, 'read_only') };

  // The table is unreachable. Fail CLOSED with a role that can do nothing
  // rather than open with the env's seed — a broken database read must not be
  // a route to full access.
  return { id: '', email, role: 'read_only', active: false, display_name: null };
}

// Guard for every /admin route. Requires a logged-in user whose email has an
// active staff row or is allowed to bootstrap one; everyone else gets a 404
// so the console never reveals it exists. Returns the service-role client (the
// console works across all accounts) plus who is acting, for the audit trail.
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    notFound();
  }

  const adminEmail = user.email!.toLowerCase();
  const admin = createAdminClient();
  const staff = await resolveStaff(admin, adminEmail, isAdminEmail(adminEmail));

  // A deactivated staff member gets the same 404 as a stranger. Letting them in
  // to a read-only console would confirm the console exists and tell them their
  // access was removed rather than expired, which is information a leaver does
  // not need.
  if (!staff.active) notFound();

  const h = await headers();
  return {
    admin,
    adminEmail,
    userId: user.id,
    role: staff.role,
    staff,
    ip: clientIpFrom(h),
    requestId: randomUUID(),
  };
}

/**
 * requireAdmin, plus the authority to do one specific thing.
 *
 * Every mutating action calls this rather than requireAdmin, and names the
 * permission it needs. Hiding a button is presentation; a server action is a
 * public HTTP endpoint, and this is the only place the answer is enforced.
 *
 * Refusal throws rather than 404s. By this point the caller is a known, active
 * staff member — they should be told the console exists and that this
 * particular thing is not theirs, which is a different fact from "no such page".
 */
export async function requirePermission(permission: Permission): Promise<AdminContext> {
  return requirePermissions(permission);
}

/**
 * The same, for an action that crosses more than one boundary at once.
 *
 * Resolving a Quick Stop as a no-show issues a refund AND locks the account,
 * which are money.refund and account.enforce respectively — two permissions no
 * single role but super_admin holds together, deliberately. Calling
 * requirePermission twice would work but costs a second full requireAdmin()
 * round trip and mints a second requestId, so the two audit rows an action
 * writes would no longer share one.
 *
 * ALL are required, never any. An action that needs two authorities is not
 * satisfied by holding one of them.
 */
export async function requirePermissions(...permissions: Permission[]): Promise<AdminContext> {
  const context = await requireAdmin();
  for (const permission of permissions) {
    if (!staffCan(context.staff, permission)) {
      console.warn(`[admin] ${context.adminEmail} (${context.role}) denied ${permission} req=${context.requestId}`);
      throw new Error(deniedMessage(context.role, permission));
    }
  }
  // Recorded as the full set. An audit row stamped with only the first of two
  // permissions understates what was authorised, which is the thing the column
  // exists to make reviewable.
  return { ...context, permission: permissions.join(' + ') };
}

async function requireMfa(context: AdminContext): Promise<AdminContext> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data.currentLevel !== 'aal2') {
    redirect(`/admin/security?step_up=1&permission=${encodeURIComponent(context.permission ?? '')}`);
  }
  return context;
}

/** High-impact staff mutations require an authenticator-verified session. */
export async function requireMfaPermission(permission: Permission): Promise<AdminContext> {
  return requireMfa(await requirePermission(permission));
}

export async function requireMfaPermissions(...permissions: Permission[]): Promise<AdminContext> {
  return requireMfa(await requirePermissions(...permissions));
}

// --- Office users -------------------------------------------------------------

/**
 * The capabilities a session actually holds, as the database would answer.
 *
 * OWNERS HOLD EVERYTHING, unconditionally, including capabilities nobody has
 * defined. That is not a convenience here -- it is `office_can()`'s own first
 * clause, restated so that a page reading this and a policy reading the
 * database cannot disagree about an owner. If they ever did, opening a surface
 * for an employee would close it for the person who owns the business.
 *
 * OFFICE USERS HOLD THE ENABLED SET. Capabilities are global today: which ones
 * an office user may EVER hold is a product decision (20260820220000), and
 * which of those a particular contractor grants is a later, narrower one that
 * does not exist yet. When it does, this is the function that changes, and
 * nothing that calls it has to.
 *
 * Read with the service role because `office_capabilities` is readable by any
 * authenticated session anyway -- the list of what an office user COULD hold is
 * not a secret, and a team screen has to render it.
 */
export async function loadHeldCapabilities(
  role: 'owner' | 'crew' | 'office' | null,
): Promise<ReadonlySet<string>> {
  if (role === 'owner') return ALL_CAPABILITIES_SENTINEL;
  if (role !== 'office') return new Set<string>();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('office_capabilities')
    .select('capability')
    .eq('enabled', true);

  // Fails CLOSED. A read error means we cannot say what this person holds, and
  // the safe answer to that is "nothing" -- unlike the terms gate above, which
  // fails open because locking every owner out is worse than a missing
  // agreement. Here the two failures are not symmetric: showing an employee a
  // screen they should not see cannot be undone by a later deploy.
  if (error || !data) return new Set<string>();
  return new Set(data.map((row) => row.capability as string));
}

/**
 * Everything the two office-capable guards agree on, resolved once.
 *
 * Not exported: entering the dashboard is either the SHELL's question or a
 * PAGE's, and both are below.
 */
async function resolveOfficeCapableMember() {
  const session = await loadSessionMember();

  if (!session) {
    redirect('/login');
  }

  const { supabase, user, member } = session;

  if (!member?.account_id || (member.role !== 'owner' && member.role !== 'office')) {
    redirect('/login');
  }

  const role = member.role as 'owner' | 'office';
  const held = await loadHeldCapabilities(role);

  // The account row came back on the SERVICE-ROLE membership read, not through
  // the session client, and that is load-bearing here rather than incidental.
  // `accounts` has `acc_read` as `is_owner(id)`, so an office user's own read
  // returns nothing and every gate below would silently pass -- letting somebody
  // keep working inside a business staff had suspended. An owner sees the same
  // row either way, so the two guards agree wherever they overlap.
  const acct = embeddedAccount(member);

  applyAccountGates(acct as AccountGateRow, { role });

  return {
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    accountId: member.account_id,
    accountTimeZone: (acct as { timezone?: string | null } | null)?.timezone || 'America/New_York',
    role,
    capabilities: held,
  };
}

/**
 * The dashboard SHELL's own context. Chrome only -- never a page's guard.
 *
 * The layout wraps every dashboard route, so it cannot ask requireOwnerContext
 * without bouncing office users off pages they are allowed to open. It also
 * cannot decide anything on its own behalf: a layout does not receive the
 * pathname, and a capability does not belong there anyway.
 *
 * So it admits any member of the workspace and the PAGE decides. That is not a
 * hole, because nothing renders from the shell alone: every page under
 * /dashboard still runs its own guard, and all but the deliberately converted
 * ones still run requireOwnerContext -- which sends an office user straight back
 * out. Reachability is opt-in per page; this only stops the shell pre-empting
 * the decision.
 */
export async function requireDashboardShellContext() {
  const { supabase, accountId, role, capabilities } = await resolveOfficeCapableMember();
  return { supabase, accountId, role, capabilities };
}

/**
 * A page or action an office user may reach, given the capabilities it names.
 *
 * THIS IS NOT A WIDER requireOwnerContext, and the difference is the whole
 * design. requireOwnerContext still means "owner, nobody else" at all ~490 of
 * its call sites, and it still sends an office user to /office-access. Nothing
 * becomes reachable by being left alone: a page or action opens to an office
 * user only by being changed, deliberately, to call THIS and to name the
 * capability it needs. Everything nobody has thought about stays owner-only by
 * omission, which is the direction this has to fail.
 *
 * NAME THE CAPABILITY THE WORK ACTUALLY NEEDS. Reading is not writing, and a
 * page that lists leads and an action that deletes one are not the same
 * question. Passing several means ALL of them are required.
 *
 * THIS IS ALSO NOT THE SECURITY BOUNDARY. Row-level security is:
 * `office_can(account_id, capability)` decides which rows exist for the session
 * client returned here, and would refuse an office user reading a table they
 * hold no capability for even if this let them past. Two independent checks that
 * have to agree, not one check trusted twice -- and RLS is the one that cannot
 * be forgotten at a call site.
 */
export async function requireOfficeContext(...capabilities: readonly string[]) {
  if (capabilities.length === 0) {
    // A guard asked for nothing would admit every office user to whatever it is
    // guarding. That is a mistake at the call site, not a permissive default.
    throw new Error('requireOfficeContext requires at least one capability');
  }

  const context = await resolveOfficeCapableMember();

  if (!capabilities.every((capability) => context.capabilities.has(capability))) {
    // Their own first permitted page rather than an error. They are an employee
    // who followed a link, not somebody probing paths, and the honest answer to
    // "you cannot open this" is to show them what they can. officeLandingPath
    // falls back to the holding page when they hold nothing, so this cannot
    // bounce between two pages neither of which admits them.
    //
    // An owner can never reach this branch -- their capability set answers true
    // to everything -- but the fallback names /dashboard rather than relying on
    // that, because a redirect computed from an office allowlist is the wrong
    // answer for the person who owns the business.
    redirect(context.role === 'owner' ? '/dashboard' : officeLandingPath(context.capabilities));
  }

  return context;
}

/**
 * An owner's capability set: everything, including keys that do not exist.
 *
 * A plain Set could not express that, and enumerating the catalog here would
 * put a second copy of it in the codebase -- which is the drift the migration's
 * own test exists to prevent.
 */
const ALL_CAPABILITIES_SENTINEL: ReadonlySet<string> = Object.freeze({
  has: () => true,
  get size() { return Number.POSITIVE_INFINITY; },
  keys: function* () {},
  values: function* () {},
  entries: function* () {},
  forEach: () => {},
  [Symbol.iterator]: function* () {},
}) as unknown as ReadonlySet<string>;
