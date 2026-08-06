import { getReviewsSummary } from '@/lib/reviews';
import { DEMO_ACCOUNT_ID } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import ReviewsScreen from '@/app/dashboard/reviews/ReviewsScreen';

export const metadata = { title: 'Reviews — Live Demo' };

/**
 * Reputation and feedback, for a logged-out visitor.
 *
 * summariseReviewInvites runs unmodified over one ask per completed job, so the
 * average, the star breakdown, the public/private split and the response rate
 * all agree with each other and with the job list — rather than being four
 * numbers somebody chose to look plausible together.
 */
export default async function DemoReviewsPage() {
  const summary = await getReviewsSummary(demoSupabase, DEMO_ACCOUNT_ID);
  return <ReviewsScreen summary={summary} reviewsOn basePath="/demo" readOnly />;
}
