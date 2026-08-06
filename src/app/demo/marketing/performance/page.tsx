import { listCampaigns } from '@/lib/campaigns';
import { countStates, todayKeyOf } from '@/lib/marketing-status';
import { DEMO_ACCOUNT_ID } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import PerformanceScreen from '@/app/dashboard/marketing/performance/PerformanceScreen';

export const metadata = { title: 'Marketing performance — Live Demo' };

/**
 * Performance, for a logged-out visitor: the same screen, over the fixture
 * sends. The post counts come back as zeroes because the demo site has no blog
 * posts seeded — which the tiles state plainly rather than hiding.
 */
export default async function DemoMarketingPerformancePage() {
  const campaigns = await listCampaigns(demoSupabase, DEMO_ACCOUNT_ID);
  return (
    <PerformanceScreen
      campaigns={campaigns}
      counts={countStates([], todayKeyOf())}
      basePath="/demo"
    />
  );
}
