import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { clientIpFrom } from '@/lib/rate-limit';
import { deniedMessage, parseStaffRole, staffCan, type Permission, type StaffRole } from '@/lib/staff';
import { needsFirstRun, type FirstRunAccount } from '@/lib/terms';

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
   * `office` exists in `member_role` as of 20260819090000 and no code writes it
   * yet — the seat RPC that does is granted to no API role. It is in this type
   * anyway so the compiler forces every reader to say what it does with one,
   * rather than letting `'owner' | 'crew'` quietly imply the case cannot arise.
   *
   * Today every reader treats it as "not an owner", which is the fail-closed
   * answer: `requireOwnerContext` sends them to /login. See
   * docs/office-seat-activation.md for what has to exist before that changes,
   * including the part `ensureAccountMembership` gets wrong below.
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

  const chosen = data.find((m) => m.role === 'owner') ?? data[0];
  return {
    accountId: chosen.account_id ?? null,
    role: chosen.role ?? null,
  };
}

export async function ensureAccountMembership(userId: string) {
  const admin = createAdminClient();

  // NOT YET HANDLED, and deliberately left visible rather than papered over: a
  // user whose only membership is `office` has no owner row, so the block below
  // provisions them a brand-new empty workspace on sign-in and drops them into
  // it. Their employer's workspace is unreachable from here. Nothing creates an
  // office membership today, so this is latent — but it is the real remaining
  // scope of the team screen, because reaching the employer means CHOOSING
  // between workspaces, which this product has never had to do.
  //
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

// Shared guard for server components/actions that require a logged-in owner.
// Returns a session-scoped (RLS-respecting) Supabase client plus the resolved
// user + account context. Redirects to /login if any check fails.
export async function requireOwnerContext(options: { skipFirstRunGate?: boolean } = {}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  try {
    await ensureAccountMembership(user.id);
  } catch (error) {
    console.error('ensureAccountMembership error:', error);
    throw error;
  }

  const membership = await getCurrentMembership(user.id);

  if (!membership.accountId || membership.role !== 'owner') {
    redirect('/login');
  }

  // Staff-suspended accounts are blocked from the owner surface until lifted.
  // Defensive: a missing column (pre-migration) or read error is treated as
  // "not suspended" so this never breaks the dashboard before it's deployed.
  const { data: acct } = await supabase
    .from('accounts')
    .select('suspended_at, terms_accepted_at, terms_version, timezone')
    .eq('id', membership.accountId)
    .maybeSingle();
  if (acct && (acct as { suspended_at?: string | null }).suspended_at) {
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
  if (!options.skipFirstRunGate && hasTermsColumns && needsFirstRun(acct as FirstRunAccount)) {
    redirect('/welcome');
  }

  // userEmail is who to write into an audit trail. Anything that records a
  // decision — approving hours, marking a crew member paid — has to name a
  // person, and "the account" isn't a person.
  return {
    supabase,
    userId: user.id,
    userEmail: user.email ?? null,
    accountId: membership.accountId,
    accountTimeZone: (acct as { timezone?: string | null } | null)?.timezone || 'America/New_York',
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
