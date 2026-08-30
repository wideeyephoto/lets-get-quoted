import { requireOwnerContext } from '@/lib/auth';
import { expireStaleLeads } from '@/lib/leads';
import { buildDashboardHome } from '@/lib/dashboard-home-data';
import DashboardHomeScreen from './DashboardHomeScreen';

export const metadata = { title: 'Dashboard' };

/**
 * The dashboard home, for a signed-in owner.
 *
 * The read only — everything drawn from the figures lives in
 * DashboardHomeScreen, which the logged-out demo renders too.
 */
export default async function DashboardPage() {
  const { supabase, accountId, account } = await requireOwnerContext();
  // Kept here rather than in the builder: it WRITES, and the demo runs that
  // builder against fixtures with nothing to write to.
  // Passing days from the cached account row avoids querying accounts again.
  await expireStaleLeads(
    supabase,
    accountId,
    (account as { lead_lost_after_days?: number | null } | null)?.lead_lost_after_days ?? undefined,
  );

  const home = await buildDashboardHome(supabase, accountId, {
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com',
    account,
  });

  return <DashboardHomeScreen home={home} />;
}
