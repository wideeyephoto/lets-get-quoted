import type { SupabaseClient } from '@supabase/supabase-js';
import { LONG_SHIFT_HOURS } from '@/lib/time-clock';

// "Have we already done this one?"
//
// The service worker replays anything it never got an answer to, and a reply
// lost on the way back is indistinguishable from a request lost on the way out.
// So the same clock-out can genuinely arrive twice, and the second one must
// cost nothing — otherwise offline support is a machine for double-billing
// labor.
//
// The insert IS the check. Asking "is this key present?" and then acting on the
// answer leaves a window; letting the unique index refuse the second insert
// does not.

export type SubmissionKind = 'clock-in' | 'clock-out' | 'time' | 'material' | 'note';

export type ClaimResult =
  /** First time we've seen it — go and do the work. */
  | 'claimed'
  /** Already handled. Answer success and do nothing. */
  | 'duplicate'
  /**
   * The ledger isn't there (pre-migration) or wouldn't answer. Proceed anyway:
   * an un-migrated database should still take a crew member's hours. The cost
   * is that a replay could duplicate, which is strictly better than a clock-out
   * that never lands at all.
   */
  | 'unchecked';

export async function claimSubmission(
  admin: SupabaseClient,
  accountId: string,
  crewId: string,
  key: string,
  kind: SubmissionKind,
): Promise<ClaimResult> {
  const trimmed = key.trim().slice(0, 120);
  if (!trimmed) return 'unchecked';

  const { error } = await admin.from('field_submissions').insert({
    account_id: accountId,
    crew_id: crewId,
    key: trimmed,
    kind,
  });

  if (!error) return 'claimed';
  // 23505 = the unique index fired, which is exactly what a replay looks like.
  if (error.code === '23505') return 'duplicate';
  return 'unchecked';
}

/**
 * Undo a claim whose work then failed.
 *
 * Without this a submission that was claimed and then blew up on the write
 * would be remembered as done forever, and the retry that should have fixed it
 * would be answered "already handled".
 */
export async function releaseSubmission(
  admin: SupabaseClient,
  crewId: string,
  key: string,
): Promise<void> {
  const trimmed = key.trim().slice(0, 120);
  if (!trimmed) return;
  await admin.from('field_submissions').delete().eq('crew_id', crewId).eq('key', trimmed);
}

// -- times that came from somebody's phone ------------------------------------

/**
 * How far back a queued submission may reasonably reach.
 *
 * LONG_SHIFT_HOURS, not a number of its own: it is already the point at which
 * this app stops believing a shift, so a replay that claims to have been
 * waiting longer than that is claiming something the product would flag as
 * implausible if it had watched it happen. Deliberately BELOW MAX_SHIFT_HOURS
 * (16) so no queued replay can produce a shift the app calls implausible.
 */
export const MAX_BACKDATE_HOURS = LONG_SHIFT_HOURS;

/** Below this, the phone and the server simply disagree about the second. */
const CLOCK_SKEW_MS = 5 * 60_000;

export type OfflineTime = { at: string; fromPhone: boolean };

/**
 * The time a thing happened, as reported by a phone that may have been out of
 * signal for hours. Null when the phone's answer cannot be used.
 *
 * The client's clock is TRUSTED but BOUNDED. Trusted, because the whole point
 * of queueing a clock-out is that the moment it happened is not the moment it
 * sends, and stamping the replay time would turn a 3pm finish into a 7pm one.
 *
 * BOUNDED BY REFUSAL, NOT BY CLAMPING, and that distinction is the fix rather
 * than a detail. This used to pin an out-of-range value to the edge of the
 * window — so a request saying "1999" became a clock-in exactly 12 hours ago,
 * and the most absurd input the endpoint could receive was silently turned into
 * the largest claim it was willing to grant. A timestamp outside the window is
 * evidence of a broken or hostile client, and the honest answer to it is no.
 *
 * The FUTURE still clamps, because clamping down to now can only ever shrink
 * what is being claimed — a phone five minutes ahead is an ordinary phone, not
 * an argument.
 *
 * `fromPhone` marks the entries whose times did not come from this server, so
 * the owner reading a timesheet can see which ones to take on trust.
 */
export function resolveOfflineTime(value: unknown, now: Date = new Date()): OfflineTime | null {
  const nowMs = now.getTime();
  // No timestamp at all is the ordinary online case: the server's own clock is
  // the right answer and nothing is being asserted.
  if (value === undefined || value === null || value === '') return { at: now.toISOString(), fromPhone: false };

  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  if (parsed < nowMs - MAX_BACKDATE_HOURS * 3_600_000) return null;

  const at = Math.min(parsed, nowMs);
  return { at: new Date(at).toISOString(), fromPhone: nowMs - at > CLOCK_SKEW_MS };
}

/** The suffix that says "these times are the phone's, not ours". */
export const OFFLINE_NOTE = 'Sent from offline — times from the crew member’s phone';

export function withOfflineNote(note: string | null, fromPhone: boolean): string | null {
  if (!fromPhone) return note;
  return note?.trim() ? `${note.trim()} · ${OFFLINE_NOTE}` : OFFLINE_NOTE;
}
