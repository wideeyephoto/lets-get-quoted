import type { SupabaseClient } from '@supabase/supabase-js';

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

/** Anything older than this is not a queued shift, it's a mistake or a claim. */
export const MAX_BACKDATE_HOURS = 18;

/** Below this, the phone and the server simply disagree about the second. */
const CLOCK_SKEW_MS = 5 * 60_000;

export type OfflineTime = { at: string; fromPhone: boolean };

/**
 * The time a thing happened, as reported by a phone that may have been out of
 * signal for hours.
 *
 * The client's clock is TRUSTED but BOUNDED. Trusted, because the whole point
 * of queueing a clock-out is that the moment it happened is not the moment it
 * sends, and stamping the replay time would turn a 3pm finish into a 7pm one.
 * Bounded, because "when did you stop work" is also the answer to "what am I
 * paying you for": the future is refused outright and the past is clamped to a
 * window no real shift outlives.
 *
 * `fromPhone` marks the entries whose times did not come from this server, so
 * the owner reading a timesheet can see which ones to take on trust.
 */
export function resolveOfflineTime(value: unknown, now: Date = new Date()): OfflineTime {
  const nowMs = now.getTime();
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed)) return { at: now.toISOString(), fromPhone: false };

  const floor = nowMs - MAX_BACKDATE_HOURS * 3_600_000;
  const clamped = Math.min(Math.max(parsed, floor), nowMs);
  return { at: new Date(clamped).toISOString(), fromPhone: nowMs - clamped > CLOCK_SKEW_MS };
}

/** The suffix that says "these times are the phone's, not ours". */
export const OFFLINE_NOTE = 'Sent from offline — times from the crew member’s phone';

export function withOfflineNote(note: string | null, fromPhone: boolean): string | null {
  if (!fromPhone) return note;
  return note?.trim() ? `${note.trim()} · ${OFFLINE_NOTE}` : OFFLINE_NOTE;
}
