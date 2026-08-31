import {
  AUDIENCE_DEFS,
  listCampaigns,
  loadListHealth,
  loadRecipients,
  matchesAudience,
  summarizeReach,
  type CampaignAudience,
  type Reach,
} from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { buildCampaignRecommendations } from '@/lib/campaign-recommendations';
import { buildCalendarView } from '@/lib/marketing-calendar-data';
import { DEMO_ACCOUNT_ID, DEMO_COMPANY_NAME } from '@/lib/demo-data';
import { DEMO_ACCOUNT_ROW, demoSupabase } from '@/lib/demo-rows';
import CampaignsScreen from '@/app/dashboard/marketing/campaigns/CampaignsScreen';

export const metadata = { title: 'Campaigns — Live Demo' };

/**
 * Campaigns, for a logged-out visitor.
 *
 * The same screen and the same recommendation engine a signed-in owner gets.
 * buildCampaignRecommendations runs unmodified over the fixture book, so the
 * three starters a prospect is shown are chosen by the real scoring rules
 * against a real (if invented) customer list — not written into a mock.
 *
 * This replaced a 235-line hand-drawn page that had no marketing nav on it at
 * all, so nobody browsing the demo could tell Marketing has four sections.
 */
export default async function DemoCampaignsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ emailSent?: string; smsQueued?: string; recipients?: string; skipped?: string; failed?: string; test?: string; draft?: string }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const [recipients, campaigns, listHealth] = await Promise.all([
    loadRecipients(demoSupabase, DEMO_ACCOUNT_ID),
    listCampaigns(demoSupabase, DEMO_ACCOUNT_ID),
    loadListHealth(demoSupabase, DEMO_ACCOUNT_ID),
  ]);

  const view = await buildCalendarView(demoSupabase, DEMO_ACCOUNT_ID, 4, {
    recipients,
  });

  const mailingAddress = resolveMarketingMailingAddress((DEMO_ACCOUNT_ROW.mailing_address as string | null) ?? null);

  const now = Date.now();
  const reach = Object.fromEntries(
    AUDIENCE_DEFS.map((audience) => {
      const matched = recipients.filter((recipient) => matchesAudience(recipient, audience.id, now));
      return [audience.id, summarizeReach(matched)];
    }),
  ) as Record<CampaignAudience, Reach>;

  const recommendations =
    recipients.length > 0
      ? await buildCampaignRecommendations(demoSupabase, DEMO_ACCOUNT_ID, {
          recipients,
          reach,
          businessName: DEMO_COMPANY_NAME,
          bookingUrl: '/demo/schedule/booking',
        })
      : null;

  return (
    <CampaignsScreen
      campaigns={campaigns}
      hasRecipients={recipients.length > 0}
      recommendations={recommendations}
      view={view}
      reach={reach}
      mailingAddress={mailingAddress}
      daysSinceLastSend={listHealth.daysSinceLastSend}
      unsubscribesSinceLastSend={listHealth.unsubscribesSinceLastSend}
      // No ?draft= handoff in the demo: the drafts it builds depend on account
      // settings a visitor has not got, and the composer opens on the
      // recommended starters instead — which is the screen's own default.
      searchParams={searchParams}
      basePath="/demo"
    />
  );
}
