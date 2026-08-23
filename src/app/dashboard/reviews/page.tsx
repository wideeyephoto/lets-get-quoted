import { requireOfficeContext } from '@/lib/auth';
import { getReviewActivityRow, loadReviewActivity } from '@/lib/reviews';
import { buildActivityView } from '@/lib/review-activity';
import { googleReviewUrl } from '@/lib/review-routing';
import { getSiteContent } from '@/lib/site-content';
import ReviewsScreen from './ReviewsScreen';

export const metadata = { title: 'Reviews' };

/**
 * Reputation and feedback, for a signed-in owner.
 *
 * Reads only — every write on this page goes through a server action in
 * ./actions.ts, each of which re-derives the account from the session rather
 * than trusting anything the browser posted.
 *
 * `searchParams` drives the whole view: filters, tab and the open drawer all
 * live in the URL, so a filtered view is bookmarkable and survives the
 * revalidate that follows an action.
 */
export const dynamic = 'force-dynamic';

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { supabase, accountId } = await requireOfficeContext('jobs.read');

  const [rows, { data: account }, { data: site }] = await Promise.all([
    loadReviewActivity(supabase, accountId),
    supabase.from('accounts').select('auto_review_request').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('content').eq('account_id', accountId).maybeSingle(),
  ]);

  // The link an owner can hand out directly. Null when no Google Business
  // Profile is linked — then "Copy review link" is disabled and says why,
  // rather than copying an empty string.
  const { testimonials } = getSiteContent((site?.content ?? {}) as Record<string, unknown>);
  const publicReviewUrl = googleReviewUrl({
    placeId: testimonials.googlePlaceId,
    listingUrl: testimonials.googleUrl,
  });

  // One timestamp for the whole render. Calling new Date() inside the view
  // would let the window boundary move between the KPI cards and the table.
  const nowIso = new Date().toISOString();
  const view = buildActivityView(rows, searchParams, nowIso);

  const openId = Array.isArray(searchParams.open) ? searchParams.open[0] : searchParams.open;
  // Looked up against the account's own rows, so an id typed into the address
  // bar cannot open somebody else's customer.
  const openRow = openId ? await getReviewActivityRow(supabase, accountId, openId) : null;

  return (
    <ReviewsScreen
      view={view}
      openRow={openRow}
      reviewsOn={Boolean(account?.auto_review_request)}
      publicReviewUrl={publicReviewUrl}
      nowIso={nowIso}
    />
  );
}
