import { requireOwnerContext } from '@/lib/auth';
import { listUploadedSiteImages } from '@/lib/site-image-storage';
import { getOrCreateSite } from '@/lib/sites';
import { normalizeEstimatePosture } from '@/lib/estimate-posture';
import IntakeAiSettingsSection from '../settings/IntakeAiSettingsSection';
import WebsiteBuilder from './WebsiteBuilder';

export const metadata = {
  title: 'Website Settings',
  description: 'Customize your contractor website',
};

// `?built=1` is set by first run when it generated the whole site from the
// business name, trade and ZIP. Without a word of explanation the owner arrives
// at a finished website they never asked anyone to write, which reads as
// somebody else's site rather than a head start on their own.
export default async function SitesPage({ searchParams }: { searchParams?: { built?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  const justBuilt = searchParams?.built === '1';

  // Get or create site
  const site = await getOrCreateSite(supabase, accountId);
  const uploadedImages = await listUploadedSiteImages(accountId);

  // Account-level Intake AI tuning (mirrors Settings → Automations → Intake AI).
  // Rendered server-side and passed into the client builder as a slot.
  const { data: intake } = await supabase
    .from('accounts')
    .select('estimate_posture, high_value_lead_amount, mute_low_quality_leads, high_value_sms_enabled, alert_phone')
    .eq('id', accountId)
    .maybeSingle();
  const intakeSlot = (
    <IntakeAiSettingsSection
      estimatePosture={normalizeEstimatePosture(intake?.estimate_posture)}
      highValueLeadAmount={intake?.high_value_lead_amount ? Number(intake.high_value_lead_amount) : null}
      muteLowQualityLeads={intake?.mute_low_quality_leads !== false}
      highValueSmsEnabled={Boolean(intake?.high_value_sms_enabled)}
      alertPhone={(intake?.alert_phone as string | null) || ''}
    />
  );

  return <WebsiteBuilder site={site} uploadedImages={uploadedImages} intakeSlot={intakeSlot} justBuilt={justBuilt} />;
}
