'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { LABOR_SETTINGS_COOKIE, normalizeLaborSettings, serializeLaborSettings } from '@/lib/labor-settings';
import { normalizeTimeClockMode } from '@/lib/time-clock';
import { getTimeClockMode, setTimeClockMode } from '@/lib/time-clock-data';

// Labor settings live in a cookie, like the dashboard's other view preferences.
// Still owner-gated: it's an owner-only screen, and there's no reason for a
// crew session to be able to write it.
export async function saveLaborSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  // The time clock is per ACCOUNT, not per browser — the crew have to see the
  // same rule the owner set, and they're on different devices. So it goes to
  // the database while the display rules below stay in the cookie.
  const mode = normalizeTimeClockMode(formData.get('timeClockMode'));
  const current = await getTimeClockMode(supabase, accountId);
  if (mode !== current) await setTimeClockMode(supabase, accountId, mode);

  // Round-tripped through the normalizer so a hand-posted form can't put an
  // overtime threshold of 0 (every hour becomes overtime) into the cookie.
  const settings = normalizeLaborSettings(
    JSON.stringify({
      periodMode: formData.get('periodMode'),
      overtimeThreshold: Number(formData.get('overtimeThreshold')),
      rounding: formData.get('rounding'),
      exportFormat: formData.get('exportFormat'),
    }),
  );

  cookies().set(LABOR_SETTINGS_COOKIE, serializeLaborSettings(settings), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  revalidatePath('/dashboard/crew');
}
