import 'server-only';

import { createAdminClient } from '@/lib/auth';

/**
 * DARK server-only worker: release usage credits held by reservations that
 * expired without ever being committed or released.
 *
 * WHY THIS EXISTS. `available = granted - consumed - reserved - revoked`. A
 * reservation abandoned mid-request -- a crashed process, a dropped connection,
 * a deploy in the middle of a model call -- leaves `reserved_units` raised for
 * ever, and those credits are gone from the workspace's balance with nothing to
 * show for them. `expire_usage_reservations` was built to prevent exactly that
 * (batch limit, `for update skip locked`, per-workspace advisory lock) and
 * `usage_reservations.expires_at` is `not null` because the design assumes
 * something calls it. Until this worker, nothing did.
 *
 * Reservations live 15 minutes (`RESERVATION_TTL_MS` in ai-intake-usage.ts), so
 * a quarter-hourly sweep returns a stranded credit within half an hour at worst.
 *
 * SAFETY. The function only touches rows whose `expires_at` has already passed
 * and whose state is still `reserved`, and it takes the same advisory lock the
 * reserve path takes, so it cannot race a commit into double-counting. It is
 * therefore safely re-runnable and safely concurrent, and needs no lease of its
 * own.
 */

/**
 * Rows per run. The function itself refuses anything outside 1..1000.
 *
 * 250 every fifteen minutes is 1000/hour, far above any plausible abandonment
 * rate -- these are only the requests that DIED, not the ones that completed.
 * Saturation is reported rather than chased within a single run: a sweep that
 * silently looped until empty could hold a transaction open across an unbounded
 * backlog, and a backlog that large is a signal worth seeing in cron_runs rather
 * than absorbing quietly.
 */
export const USAGE_RESERVATION_EXPIRY_BATCH_SIZE = 250;

export type UsageReservationExpiryResult =
  | Readonly<{ status: 'completed'; expired: number; saturated: boolean }>
  | Readonly<{ status: 'failed' }>;

function safeCount(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function runUsageReservationExpirySweep(): Promise<UsageReservationExpiryResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('expire_usage_reservations', {
      p_limit: USAGE_RESERVATION_EXPIRY_BATCH_SIZE,
    });
    if (error) {
      console.error('usage reservation expiry sweep failed:', error);
      return { status: 'failed' };
    }

    const expired = safeCount(data);
    if (expired === null) return { status: 'failed' };

    return {
      status: 'completed',
      expired,
      // A full batch means there may be more waiting. Reported so a backlog is
      // visible in cron_runs instead of looking like a healthy steady state.
      saturated: expired >= USAGE_RESERVATION_EXPIRY_BATCH_SIZE,
    };
  } catch (error) {
    console.error('usage reservation expiry sweep threw:', error);
    return { status: 'failed' };
  }
}
