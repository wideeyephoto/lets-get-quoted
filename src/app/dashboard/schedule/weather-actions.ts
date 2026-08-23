'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOfficeContext } from '@/lib/auth';
import { draftCustomerMessage, RISK_LABEL, type Assessment } from '@/lib/weather';
import { jobsAtRisk, weatherSettings } from '@/lib/weather-data';

export type WeatherRiskView = {
  jobId: string;
  ref: string | null;
  clientName: string;
  day: string;
  level: string;
  levelLabel: string;
  reasons: string[];
  summary: string;
  alternatives: { day: string; summary: string }[];
  /** Drafted for the contractor to read, edit and send. Never sent from here. */
  draftMessage: string;
};

/**
 * Which of this account's scheduled jobs the forecast is against.
 *
 * Returns a DRAFT message per job and sends nothing. The contractor reads it,
 * changes it, and decides — the whole point of this feature is that a forecast
 * never moves anybody's appointment on its own.
 */
export async function weatherRisksAction(): Promise<{ enabled: boolean; profile: string; risks: WeatherRiskView[] }> {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');
  const { enabled, sensitivity } = await weatherSettings(supabase, accountId);
  if (!enabled) return { enabled: false, profile: sensitivity.label, risks: [] };

  const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  const { data: site } = await supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle();
  const businessName = site?.company_name || account?.business_name || 'your contractor';

  const risks = await jobsAtRisk(supabase, accountId);

  return {
    enabled: true,
    profile: sensitivity.label,
    risks: risks.map(({ job, assessment, alternatives }) => ({
      jobId: job.id,
      ref: job.ref,
      clientName: job.clientName,
      day: job.scheduledFor,
      level: assessment.level,
      levelLabel: RISK_LABEL[assessment.level],
      reasons: assessment.reasons,
      summary: assessment.summary,
      alternatives: alternatives.map((a: Assessment) => ({ day: a.day, summary: a.summary })),
      draftMessage: draftCustomerMessage({
        businessName,
        customerName: job.clientName,
        day: job.scheduledFor,
        assessment,
        sensitivity,
        alternatives,
      }),
    })),
  };
}

/**
 * Turning it on.
 *
 * THE WRITE WAS LANDING AND THE PAGE WAS NOT MOVING. This action had no
 * revalidatePath — the only one in this directory without one — so pressing
 * "Turn it on" saved `weather_alerts_enabled = true` and then re-rendered the
 * route from cache, which still said false. Measured against a real account:
 * the column flipped, and twenty-five seconds later the card on screen was
 * still the off card offering to turn it on. Reported as "I turned it on, it
 * froze for ten seconds, and then it just has this manual button now" — the
 * button they ended up looking at was the enabled panel, arrived at by
 * reloading, which is the only thing that got them a fresh render.
 *
 * The redirect is what tells the panel it has just been switched on, so it can
 * run the first check itself instead of handing back another button. Checking
 * is still on demand everywhere else: two requests to a free public service per
 * location is not something to spend on every page load.
 */
export async function updateWeatherSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const profile = String(formData.get('weatherProfile') ?? '').trim();
  await supabase
    .from('accounts')
    .update({
      // This form only exists on the OFF card, and its button says "Turn it
      // on" — so submitting it is the yes. There was a checkbox here too,
      // ticked by default, which could only ever disagree with the button that
      // submitted it.
      weather_alerts_enabled: true,
      // Blank means "work it out from my trade" — a real answer, not a missing one.
      weather_profile: profile || null,
    })
    .eq('id', accountId);

  revalidatePath('/dashboard/schedule/settings');
  revalidatePath('/dashboard/schedule');
  redirect('/dashboard/schedule/settings?weather=on#weather-panel');
}
