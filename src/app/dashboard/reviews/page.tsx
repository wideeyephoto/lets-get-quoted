import { requireOwnerContext } from '@/lib/auth';
import { getReviewsSummary } from '@/lib/reviews';
import ReviewsScreen from './ReviewsScreen';

/**
 * Reputation and feedback, for a signed-in owner.
 *
 * The read only — the screen is in ReviewsScreen so the demo renders the same
 * one.
 */
export default async function ReviewsPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const summary = await getReviewsSummary(supabase, accountId);
  const { data: reviewAcct } = await supabase.from('accounts').select('auto_review_request').eq('id', accountId).maybeSingle();

  return <ReviewsScreen summary={summary} reviewsOn={Boolean(reviewAcct?.auto_review_request)} />;
}
