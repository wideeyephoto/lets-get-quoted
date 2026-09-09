'use server';

import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { geocodeArea } from '@/lib/geocode';
import { checkRateLimit } from '@/lib/rate-limit';

export type FirstRunPlaceResult =
  | { ok: true; place: string }
  | { ok: false; reason: 'unconfigured' | 'not-found' | 'too-large' | 'rate-limited' | 'error' };

/**
 * Resolves a 5-digit ZIP code to a verified city/state string (e.g. "Royal Oak, MI")
 * using the exact same geocode call the site generator uses.
 *
 * Runs under the owner context ({ skipFirstRunGate: true }) and applies durable
 * rate limiting. All failure modes fail silently without blocking signup.
 */
export async function resolveFirstRunPlaceAction(zip: string): Promise<FirstRunPlaceResult> {
  try {
    const { accountId } = await requireOwnerContext({ skipFirstRunGate: true });
    const admin = createAdminClient();
    const allowed = await checkRateLimit(admin, `welcome-zip:${accountId}`, 30, 300);
    if (!allowed) {
      return { ok: false, reason: 'rate-limited' };
    }

    const result = await geocodeArea(zip);
    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    return { ok: true, place: result.place };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
