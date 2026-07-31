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

  // The pay day is per ACCOUNT for the same reason the time clock is: the
  // reminder that goes out two days before it is sent by a cron with no cookie
  // to read, and "when do we pay" is a fact about the business rather than a
  // preference of whoever's browser this is.
  const delayRaw = Number(formData.get('payDelayDays'));
  const weekdayRaw = String(formData.get('payWeekday') ?? '');
  const payUpdate = {
    pay_delay_days: Number.isFinite(delayRaw) ? Math.max(0, Math.min(31, Math.round(delayRaw))) : 5,
    pay_weekday: /^[0-6]$/.test(weekdayRaw) ? Number(weekdayRaw) : null,
    // Stamped so the screen can stop saying it is assuming a pay day.
    pay_day_set_at: new Date().toISOString(),
  };
  // Pre-migration this column set does not exist; the rest of the save should
  // still land rather than the whole form failing.
  const { error: payError } = await supabase.from('accounts').update(payUpdate).eq('id', accountId);
  if (payError) console.error('Pay day save failed:', payError.message);

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
  revalidatePath('/dashboard/settings');
}
