import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Invitation tokens: minted here, hashed here, and never stored in one piece.
 *
 * The database holds only `sha256(token)`. That is not decoration — the
 * invitations table is readable by a workspace owner, so a plaintext column
 * would make it a readable list of live ways into workspaces, and a leaked
 * backup or an over-broad SELECT would hand out access rather than metadata.
 *
 * The token is therefore shown exactly once, at the moment it is created, and
 * cannot be recovered afterwards. A lost link is resent, which mints a new
 * token and invalidates the old one — which is also the behaviour you want when
 * somebody forwards an invitation to the wrong person.
 */

/** 32 bytes of CSPRNG, base64url. Long enough that guessing is not a strategy. */
export function mintInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Compare two hex digests without leaking where they diverge.
 *
 * Nothing in the current flow compares digests in application code — the
 * database looks the hash up by primary key — but this exists so that the first
 * caller who needs to does not reach for `===` and time the answer.
 */
export function invitationTokenMatches(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** How long an invitation stays usable. Long enough to be seen, short enough to expire. */
export const INVITATION_TTL_DAYS = 7;

export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function invitationLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/office-invite/${encodeURIComponent(token)}`;
}

export type OfficeInvitationRow = Readonly<{
  id: string;
  email: string;
  expiresAt: string;
  sendCount: number;
  lastSentAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}>;

export type OfficeInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/**
 * Expiry is derived, never stored.
 *
 * A status column would need a job to keep it true, and between the expiry
 * instant and that job running the row would claim to be pending while the
 * database refused it — two answers to one question, which is how a support
 * conversation becomes unwinnable.
 */
export function invitationStatus(
  invitation: OfficeInvitationRow,
  now: Date = new Date(),
): OfficeInvitationStatus {
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.revokedAt) return 'revoked';
  return new Date(invitation.expiresAt).getTime() <= now.getTime() ? 'expired' : 'pending';
}
