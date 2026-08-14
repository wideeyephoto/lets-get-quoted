// Where a crew member is in the field-app invitation, as one value.
//
// THE OLD MODEL WAS TWO BOOLEANS: is user_id set, is there an email. That reads
// as three states — linked, invitable, no-email — and it hides the ones an
// owner actually needs to act on. "Not invited" and "invited three weeks ago,
// and the link died an hour later" were the same word on the roster, and the
// fix for one is not the fix for the other. Nor could the roster say that
// somebody signed in once in March and never again, or that their access was
// taken away on purpose rather than never granted.
//
// Pure and dependency-free: no client, no dates from anywhere but the caller,
// so the ranking can be tested without a database. The columns it reads arrive
// with 2026-08-22-field-app-hardening.sql; a row that predates the migration
// simply has them absent, and every state below still resolves — an un-migrated
// database reads exactly as the old three-state model did.

export type FieldAppState =
  /** Signed in. They can see their jobs and log their own hours. */
  | 'linked'
  /** Invite sent, link still live, nobody has used it yet. */
  | 'invited'
  /** Invite sent, the link has since expired. Needs sending again. */
  | 'expired'
  /** Has an email, has never been invited. One click from being set up. */
  | 'not-invited'
  /** No email on file, so there is nowhere to send an invitation. */
  | 'no-email'
  /** An owner took the app away. Still on the roster, deliberately shut out. */
  | 'revoked';

/** How long a crew magic link stays usable. Mirrors crew-auth's token expiry. */
export const INVITE_EXPIRY_MINUTES = 60;

export type InviteFields = {
  email?: string | null;
  user_id?: string | null;
  invited_at?: string | null;
  invite_expires_at?: string | null;
  invite_count?: number | null;
  last_signed_in_at?: string | null;
  access_revoked_at?: string | null;
};

/**
 * The one state this person is in.
 *
 * Order is the point. Revocation outranks everything, including a live session —
 * an owner who has just cut somebody's access should not read "Signed in" on the
 * row they cut. A linked user outranks a pending invite because the invite has
 * plainly been used. Expiry is only meaningful when nobody has signed in.
 */
export function fieldAppState(member: InviteFields, now: Date = new Date()): FieldAppState {
  if (member.access_revoked_at) return 'revoked';
  if (member.user_id) return 'linked';
  if (!member.email) return 'no-email';
  if (!member.invited_at) return 'not-invited';

  const expiresAt = member.invite_expires_at ? Date.parse(member.invite_expires_at) : NaN;
  // A row invited before the expiry column existed carries no expiry. Falling
  // back to the invited_at stamp plus the token's real lifetime is honest: the
  // link genuinely did die an hour after it was sent.
  const fallback = Date.parse(member.invited_at ?? '') + INVITE_EXPIRY_MINUTES * 60_000;
  const deadline = Number.isFinite(expiresAt) ? expiresAt : fallback;
  if (!Number.isFinite(deadline)) return 'invited';
  return deadline > now.getTime() ? 'invited' : 'expired';
}

export const FIELD_APP_LABEL: Record<FieldAppState, string> = {
  linked: 'Field app',
  invited: 'Invited',
  expired: 'Invite expired',
  'not-invited': 'Not invited',
  'no-email': 'No email',
  revoked: 'Access removed',
};

export const FIELD_APP_TITLE: Record<FieldAppState, string> = {
  linked: 'Signed in to the field app — they can see their jobs and log hours from site.',
  invited: 'An invitation is out and the link is still live. Nobody has signed in with it yet.',
  expired: 'The invitation was sent but its link has expired. Send another one.',
  'not-invited': "Has an email but hasn't been invited to the field app yet.",
  'no-email': 'Add an email address before they can be invited to the field app.',
  revoked: 'Field-app access was taken away. They stay on the roster; the app is shut to them.',
};

/** The states an owner should be sending (or re-sending) an invitation for. */
export function needsInvite(state: FieldAppState): boolean {
  return state === 'not-invited' || state === 'expired';
}

// -- the sentence under the chip ---------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now" / "40 minutes ago" / "yesterday" / "3 weeks ago". */
export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const elapsed = now.getTime() - then;
  if (elapsed < 0) return 'just now';
  if (elapsed < 2 * MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.round(elapsed / MINUTE)} minutes ago`;
  if (elapsed < DAY) {
    const hours = Math.round(elapsed / HOUR);
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }
  const days = Math.floor(elapsed / DAY);
  if (days === 1) return 'yesterday';
  if (days < 21) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'last month' : `${months} months ago`;
}

/** "in 45 minutes" — only ever used for a deadline that hasn't passed. */
function timeUntil(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const remaining = then - now.getTime();
  if (remaining <= 0) return null;
  if (remaining < HOUR) return `in ${Math.max(1, Math.round(remaining / MINUTE))} minutes`;
  if (remaining < DAY) {
    const hours = Math.round(remaining / HOUR);
    return hours === 1 ? 'in an hour' : `in ${hours} hours`;
  }
  const days = Math.round(remaining / DAY);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/**
 * The detail line beside the chip — the fact the chip alone can't carry.
 *
 * Every branch names a DATE rather than repeating the state. "Invited" plus
 * "Invited" is a wasted line; "Invited" plus "3 days ago · expires in 20
 * minutes" is the difference between resending now and waiting.
 */
export function fieldAppDetail(member: InviteFields, now: Date = new Date()): string | null {
  const state = fieldAppState(member, now);

  if (state === 'revoked') {
    const when = timeAgo(member.access_revoked_at, now);
    return when ? `Access removed ${when}` : 'Access removed';
  }

  if (state === 'linked') {
    const seen = timeAgo(member.last_signed_in_at, now);
    // A linked row with no sign-in stamp predates the column. Saying "never
    // signed in" would be a claim about a fact nobody recorded.
    return seen ? `Last signed in ${seen}` : 'Signed in — first sign-in predates this record';
  }

  if (state === 'invited') {
    const sent = timeAgo(member.invited_at, now);
    const expires = timeUntil(member.invite_expires_at, now);
    return [sent ? `Invited ${sent}` : 'Invited', expires ? `link expires ${expires}` : null]
      .filter(Boolean)
      .join(' · ');
  }

  if (state === 'expired') {
    const sent = timeAgo(member.invited_at, now);
    const count = Number(member.invite_count) || 0;
    // The count only earns its place once it says something a single date
    // can't: that this has been tried more than once and still hasn't taken.
    const attempts = count > 1 ? ` · ${count} invites sent` : '';
    return `${sent ? `Invited ${sent}` : 'Invited'} · link expired${attempts}`;
  }

  if (state === 'not-invited') return 'Never invited';
  return 'No email address on file';
}
