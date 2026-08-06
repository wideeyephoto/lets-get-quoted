import { requireOwnerContext } from '@/lib/auth';
import { listCampaigns } from '@/lib/campaigns';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { countStates, todayKeyOf } from '@/lib/marketing-status';
import PerformanceScreen from './PerformanceScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing performance' };

/**
 * What marketing actually did.
 *
 * A deliberately narrow page, because the data behind it is narrow. `campaigns`
 * records how many messages went out, how many were skipped and how many failed
 * — and nothing else. There are no opens and no clicks anywhere in this app, by
 * an earlier decision: tracking opens needs a tracking pixel in every email and
 * a vendor to count them, and nobody has bought one.
 *
 * The screen itself is in PerformanceScreen so the demo renders the same one.
 */
export default async function MarketingPerformancePage() {
  const { supabase, accountId } = await requireOwnerContext();
  const today = todayKeyOf();

  const [campaigns, blogData] = await Promise.all([
    listCampaigns(supabase, accountId),
    loadBlogWorkspace(supabase, accountId, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'),
  ]);

  return <PerformanceScreen campaigns={campaigns} counts={countStates(blogData?.posts ?? [], today)} />;
}
