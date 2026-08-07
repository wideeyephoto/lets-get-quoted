/**
 * What a staff member is allowed to do.
 *
 * Until now the answer was "everything". src/lib/auth.ts said so out loud —
 * "Role is NOT an authorization boundary — every listed email is fully trusted
 * for every /admin server action" — and the role's only effect was the order of
 * Command Center cards. So any address in ADMIN_EMAILS could refund any amount,
 * restrict payouts, suspend a business, and hard-delete an account with its
 * entire history, and the thing standing between those powers and the world was
 * a comma-separated environment variable.
 *
 * That was a defensible place to start: the console mostly read, and a
 * permission system built before there is anything to permit is a guess. It
 * stopped being defensible the moment the console grew twenty-six mutating
 * actions.
 *
 * TWO GATES, and both must permit:
 *
 *   1. ADMIN_EMAILS decides whether you can reach /admin at all. Still an env
 *      var, deliberately. A database row must never be able to grant console
 *      access — that turns any write vulnerability into a staff account — and
 *      the first staff member has to get in before there is a table to read.
 *   2. The `staff` row decides what you can DO once inside, and can revoke
 *      access that the env still grants. Deactivation has to work faster than a
 *      redeploy.
 *
 * This module is the pure half: the vocabulary, the matrix, and the one
 * function that answers the question. No database, no request, so it can be
 * exercised exhaustively — which matters more here than anywhere else in the
 * codebase, because every mistake in it is silent and points the wrong way.
 */

/**
 * The things that can be done, named after what they DO rather than after the
 * page they live on. A page can move; "issuing a refund" cannot.
 */
export const PERMISSIONS = [
  /** Day-to-day help: notes, tags, attachments, cases, resending onboarding,
      resolving a Quick Stop dispute. Nothing here moves money or access. */
  'account.support',
  /** Enforcement: suspend, lock Quick Stops, reset verification, sign every
      session out. Reversible, but the customer feels all of it immediately. */
  'account.enforce',
  /** The irreversible cascade. Its own permission because it is in its own
      category — nothing else in this console cannot be undone. */
  'account.delete',
  /** Download everything an account holds. Separate because it is the widest
      PII surface in the product, not because it is dangerous to the account. */
  'account.export',
  /** Issue or reverse account credit. */
  'money.credit',
  /** Refund a customer's payment. */
  'money.refund',
  /** Restrict or release payouts. */
  'money.payouts',
  /** Change which plan an account is billed on. */
  'money.plan',
  /** Log and resolve privacy requests. */
  'privacy.manage',
  /** Platform operations: webhook failures, releases and incidents. */
  'ops.manage',
  /** Change what other staff can do. */
  'staff.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type StaffRole = 'super_admin' | 'support' | 'finance' | 'risk' | 'ops' | 'read_only';

export const STAFF_ROLES: StaffRole[] = ['super_admin', 'support', 'finance', 'risk', 'ops', 'read_only'];

/**
 * What each role is for, in the words a person would use when granting it.
 * Shown on /admin/staff — a role list nobody can interpret gets everyone made a
 * super admin within a month.
 */
export const ROLE_HELP: Record<StaffRole, string> = {
  super_admin: 'Everything, including deleting an account and changing what other staff can do.',
  support: 'Answers customers. Notes, cases, data exports and privacy requests. Cannot move money or suspend anyone.',
  finance: 'Refunds, credits, payouts and plans. Cannot suspend or delete.',
  risk: 'Suspends, locks and verification resets. Cannot move money.',
  ops: 'Webhook failures, releases and incidents. No customer money or access.',
  read_only: 'Can look at everything and change nothing.',
};

/**
 * The matrix.
 *
 * Every role except read_only carries account.support, because anybody who can
 * see a problem should be able to write down what they saw. Everything beyond
 * that is granted on purpose.
 */
const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  support: ['account.support', 'account.export', 'privacy.manage'],
  finance: ['account.support', 'money.credit', 'money.refund', 'money.payouts', 'money.plan'],
  risk: ['account.support', 'account.enforce'],
  ops: ['account.support', 'ops.manage'],
  read_only: [],
};

/**
 * Legacy ADMIN_EMAILS role tokens.
 *
 * 'admin' was the value every bare entry and every unrecognised token resolved
 * to, and it meant full access — so it has to keep meaning full access, or this
 * change locks the team out of their own console on deploy.
 */
const LEGACY_ROLE_ALIASES: Record<string, StaffRole> = {
  admin: 'super_admin',
  superadmin: 'super_admin',
  'super-admin': 'super_admin',
  engineering: 'ops',
  operations: 'ops',
  readonly: 'read_only',
};

export function isStaffRole(value: string | null | undefined): value is StaffRole {
  return !!value && (STAFF_ROLES as string[]).includes(value);
}

/**
 * Read a role from config or from a form.
 *
 * `fallback` is the caller's decision, and the two callers want opposite
 * things: ADMIN_EMAILS parsing falls back to super_admin because that is what
 * an unlabelled entry has always meant, while a form falls back to read_only
 * because a malformed submission must never grant more than it names.
 */
export function parseStaffRole(value: string | null | undefined, fallback: StaffRole): StaffRole {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (isStaffRole(raw)) return raw;
  return LEGACY_ROLE_ALIASES[raw] ?? fallback;
}

export function permissionsFor(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * The only question this module exists to answer.
 *
 * Inactive is checked FIRST and independently of role. A deactivated super
 * admin must be able to do less than a read_only account, and ordering the
 * checks the other way is how "we removed their access" becomes "we changed
 * their label".
 */
export function staffCan(
  staff: { role: StaffRole; active: boolean } | null | undefined,
  permission: Permission,
): boolean {
  if (!staff) return false;
  if (!staff.active) return false;
  return permissionsFor(staff.role).includes(permission);
}

/** The sentence a staff member sees when they are refused. */
export function deniedMessage(role: StaffRole, permission: Permission): string {
  return `Your ${role.replace('_', ' ')} role does not include "${permission}". Ask a super admin if you need it.`;
}
