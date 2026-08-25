import { buildInsights, resolvePeriod } from '@/lib/insights';
import { buildFillScheduleCopy, TEMPLATES } from '@/lib/campaign-templates';
import type { CampaignDraft } from '@/lib/marketing-draft-data';
import type { ArrivalAnalytics } from '@/lib/arrival-analytics-data';
import { summariseArrivals } from '@/lib/arrival-analytics';
import { DEMO_ACCOUNT_ID, DEMO_COMPANY_NAME } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import InsightsScreen from '@/app/dashboard/insights/InsightsScreen';

export const metadata = {
  title: 'Insights — Live Demo',
  description: 'What a contractor earned, where work is getting stuck, and what to improve next.',
};

/**
 * Insights, for a logged-out visitor.
 *
 * The SAME screen and the SAME arithmetic a signed-in owner gets — buildInsights
 * runs unmodified, over an in-memory client backed by the demo fixtures instead
 * of Postgres. Nothing here re-implements a card, so nothing here can fall
 * behind one.
 *
 * This replaced a 347-line hand-drawn replica. When Insights was rebuilt into a
 * dashboard of cards on 2026-08-06, that replica went on rendering the previous
 * page for two days, which is the failure this arrangement exists to make
 * impossible rather than merely unlikely.
 */

// Arrival tracking is a live-operations feature: it needs trips that promised a
// window and then recorded a real arrival. The demo has no trips, so rather than
// invent an on-time percentage the cards are handed an honestly empty analytic
// and render their own "needs data" state — which is also what a new account
// sees, and therefore the more useful thing to show a prospect.
// Built by the real summariser over no trips, rather than hand-written: a
// literal here would be a second definition of the shape, and would need
// editing every time the real one gained a field.
const DEMO_ARRIVALS: ArrivalAnalytics = {
  windowDays: 90,
  summary: summariseArrivals([]),
  byCrew: [],
  advice: null,
  // False hides the breakdown panel outright, which is the same thing an
  // account that has never sent an "on my way" sees. The Arrival reliability
  // card above it still renders, and says what it would need to measure.
  available: false,
};

export default async function DemoInsightsPage({
  searchParams,
}: {
  searchParams: { window?: string; from?: string; to?: string; compare?: string };
}) {
  const period = resolvePeriod(searchParams);
  const showDelta = searchParams.compare === 'prev';

  const insights = await buildInsights(demoSupabase, DEMO_ACCOUNT_ID, period, {
    arrivalUpdatesOn: true,
    hasArrivalData: false,
  });

  // Drafted exactly as the real page drafts it, so the words a prospect would
  // send are the words an owner would.
  const fillMeta = TEMPLATES.find((template) => template.id === 'fill-next-week')!;
  const fillCopy = buildFillScheduleCopy({
    businessName: DEMO_COMPANY_NAME,
    openSlotCount: insights.scheduleUtilization.openDays,
    bookingUrl: '/demo/schedule/booking',
  });
  const fillDraft: CampaignDraft = {
    channel: fillMeta.defaultChannel,
    audience: fillMeta.defaultAudience,
    subject: fillCopy.subject,
    subjectOptions: [],
    body: fillCopy.body,
    beatId: '',
    templateName: fillMeta.title,
    templateExplanation: fillMeta.oneLiner,
    sendTimeHint: fillMeta.sendTimeHint ?? undefined,
  };

  return (
    <InsightsScreen
      insights={insights}
      arrivals={DEMO_ARRIVALS}
      fillDraft={fillDraft}
      showDelta={showDelta}
      exportQuery=""
      searchParams={searchParams}
      basePath="/demo"
      readOnly
    />
  );
}
