import { buildDashboardHome } from '@/lib/dashboard-home-data';
import { DEMO_ACCOUNT_ID, DEMO_SITE_HOST } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import DashboardHomeScreen from '@/app/dashboard/DashboardHomeScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard — Live Demo' };

/**
 * The dashboard home, for a logged-out visitor.
 *
 * The first screen of the demo, and now the same first screen an owner gets.
 * buildDashboardHome runs unmodified, so the priority list is genuinely ranked
 * off Evergreen's own leads and jobs, the week strip is the real seven-day
 * expansion of its calendar, and the onboarding checklist ticks the steps this
 * account has actually completed. The old page asserted all of that, and the
 * numbers had drifted out of agreement with the pages they pointed at.
 *
 * `readOnly` turns the automation switches into state rather than controls —
 * AutomationLink navigates into Settings, which a visitor cannot reach.
 */
export default async function DemoHomePage() {
  const home = await buildDashboardHome(demoSupabase, DEMO_ACCOUNT_ID, {
    // The demo's site lives on its own host, so the "Visit your site" button
    // points at the real published demo site rather than a dashboard subdomain.
    rootDomain: DEMO_SITE_HOST.split('.').slice(1).join('.'),
    basePath: '/demo',
  });

  return <DashboardHomeScreen home={home} basePath="/demo" readOnly />;
}
