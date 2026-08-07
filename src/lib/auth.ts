import { createClient } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { needsFirstRun, type FirstRunAccount } from '@/lib/terms';

// Service-role client bypasses RLS for trusted server-side writes.
// Never expose this client or its key to the browser.
export function createAdminClient() {
  return createClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type CurrentMembership = {
  accountId: string | null;
  role: 'owner' | 'crew' | null;
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
    .select('suspended_at, terms_accepted_at, terms_version')
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
  return { supabase, userId: user.id, userEmail: user.email ?? null, accountId: membership.accountId };
}

// --- Internal staff console (/admin) -----------------------------------------
// Staff identity lives in env, NOT in customer data: there is no DB admin role.
// ADMIN_EMAILS is a comma-separated allowlist of letsgetquoted.com staff emails
// allowed into the console. This keeps "who works here" out of the accounts a
// contractor could ever see, and makes granting/revoking access a config change.
//
// Each entry is either a bare email (role defaults to 'admin') or "email:role".
// Role is NOT an authorization boundary — every listed email is fully trusted
// for every /admin server action, same as before this existed. It only drives
// which Command Center cards a staff member sees by default and which nav
// sections are shown. A real permissions system is a bigger, separate change.
export type StaffRole = 'admin' | 'support' | 'finance';
const STAFF_ROLES: StaffRole[] = ['admin', 'support', 'finance'];

function adminAllowlist(): Map<string, StaffRole> {
  const map = new Map<string, StaffRole>();
  for (const entry of (process.env.ADMIN_EMAILS ?? '').split(',')) {
    const [emailPart, rolePart] = entry.trim().split(':');
    const email = emailPart?.trim().toLowerCase();
    if (!email) continue;
    const role = rolePart?.trim().toLowerCase() as StaffRole;
    map.set(email, STAFF_ROLES.includes(role) ? role : 'admin');
  }
  return map;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminAllowlist().has(email.trim().toLowerCase());
}

// Bare emails and unrecognized role tokens both resolve to 'admin' — the same
// full-access default every ADMIN_EMAILS entry had before roles existed.
export function staffRoleFor(email: string | null | undefined): StaffRole {
  if (!email) return 'admin';
  return adminAllowlist().get(email.trim().toLowerCase()) ?? 'admin';
}

export type AdminContext = {
  admin: ReturnType<typeof createAdminClient>;
  adminEmail: string;
  userId: string;
  role: StaffRole;
};

// Guard for every /admin route. Requires a logged-in user whose email is on the
// staff allowlist; ANYONE else — logged out or a normal contractor — gets a 404
// so the console never reveals it exists. Returns the service-role client (the
// console works across all accounts) plus who is acting, for the audit trail.
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    notFound();
  }

  const adminEmail = user.email!.toLowerCase();
  return { admin: createAdminClient(), adminEmail, userId: user.id, role: staffRoleFor(adminEmail) };
}
