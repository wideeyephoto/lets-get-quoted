import { buildDashboardHome } from '@/lib/dashboard-home-data';
import { DEMO_ACCOUNT_ID, DEMO_SITE_HOST } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import DashboardHomeScreen from '@/app/dashboard/DashboardHomeScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard — Live Demo' };

/**
 * The dashboard home, for a logged-out visitor.
 *
 * Provides unstructured free exploration of an established contractor account.
 */
export default async function DemoHomePage() {
  const home = await buildDashboardHome(demoSupabase, DEMO_ACCOUNT_ID, {
    rootDomain: DEMO_SITE_HOST.split('.').slice(1).join('.'),
    basePath: '/demo',
  });

  return (
    <div style={{ maxWidth: '1420px', margin: '0 auto', padding: '0 clamp(16px, 3vw, 32px)' }}>
      <DashboardHomeScreen home={home} basePath="/demo" readOnly />
    </div>
  );
}
