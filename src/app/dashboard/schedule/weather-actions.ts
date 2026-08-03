'use server';

import { requireOwnerContext } from '@/lib/auth';
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
  const { supabase, accountId } = await requireOwnerContext();
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

export async function updateWeatherSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const profile = String(formData.get('weatherProfile') ?? '').trim();
  await supabase
    .from('accounts')
    .update({
      weather_alerts_enabled: formData.get('weatherAlerts') === 'on',
      // Blank means "work it out from my trade" — a real answer, not a missing one.
      weather_profile: profile || null,
    })
    .eq('id', accountId);
}
