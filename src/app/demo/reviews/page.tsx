import { loadReviewActivity } from '@/lib/reviews';
import { buildActivityView } from '@/lib/review-activity';
import { DEMO_ACCOUNT_ID } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import ReviewsScreen from '@/app/dashboard/reviews/ReviewsScreen';

export const metadata = { title: 'Reviews — Live Demo' };

/**
 * Reputation and feedback, for a logged-out visitor.
 *
 * The SAME loader and the SAME pure view builder as the signed-in page, so the
 * average, the star breakdown, the public/private split and the response rate
 * all agree with each other and with the job list — rather than being four
 * numbers somebody chose to look plausible together.
 *
 * `range: 'all'` because the demo fixture is not anchored to today: filtering
 * it to the last 30 days would show a visitor an empty command center and no
 * indication that the data exists.
 *
 * readOnly takes the write actions off the drawer and turns the automation
 * switch into a state badge. It changes no number.
 */
export default async function DemoReviewsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const rows = await loadReviewActivity(demoSupabase, DEMO_ACCOUNT_ID);
  const nowIso = new Date().toISOString();
  const view = buildActivityView(rows, { ...searchParams, range: 'all' }, nowIso);

  const openId = Array.isArray(searchParams.open) ? searchParams.open[0] : searchParams.open;
  const openRow = openId ? (rows.find((row) => row.id === openId) ?? null) : null;

  return (
    <ReviewsScreen
      view={view}
      openRow={openRow}
      reviewsOn
      publicReviewUrl={null}
      nowIso={nowIso}
      basePath="/demo"
      readOnly
    />
  );
}
