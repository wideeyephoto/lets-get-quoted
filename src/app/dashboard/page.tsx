import { requireOwnerContext } from '@/lib/auth';
import { expireStaleLeads, normalizeLeadLostAfterDays } from '@/lib/leads';
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
  //
  // The window is handed in rather than looked up. Without it expireStaleLeads
  // reads accounts.lead_lost_after_days itself — a second query for one column
  // of the row requireOwnerContext has already fetched, and it sat in front of
  // every other read on this page.
  await expireStaleLeads(
    supabase,
    accountId,
    normalizeLeadLostAfterDays((account as { lead_lost_after_days?: unknown } | null)?.lead_lost_after_days),
  );

  const home = await buildDashboardHome(supabase, accountId, {
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com',
  });

  return <DashboardHomeScreen home={home} />;
}
