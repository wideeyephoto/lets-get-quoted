/**
 * The full stylesheet, on top of the lite one the root layout already
 * loaded. This tree renders the product's own UI, which is exactly the
 * ~590KB of rules the lite sheet drops.
 *
 * Loading both is deliberate. globals.css contains every rule in
 * globals-lite.css, in the same order, and comes after it — so the last
 * matching declaration for any element is always the one from this file,
 * and the cascade here is identical to what it was when the root layout
 * imported globals.css for everybody. Importing only the DIFFERENCE would
 * be smaller and wrong: it would put rules like .priority-panel after the
 * generic .workspace-section-card that is meant to override them.
 */
import '../globals.css';
import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth';
import { unstable_cache } from 'next/cache';
import { countUnresolvedWebhookFailures } from '@/lib/admin-alerts';
import { loadPendingIrreversibleWork } from '@/lib/admin-closures';
import { listPlatformPrivacyRequestsPaged } from '@/lib/privacy-requests';
import { buildRiskQueue } from '@/lib/admin-risk';
import { getOpenIncidents } from '@/lib/admin-alerts';
import type { NavCounts } from './AdminNav';
import AdminChrome from './AdminChrome';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: { default: 'Command Center · Staff console', template: '%s · Staff console' },
  robots: { index: false, follow: false },
};

// Every /admin route inherits this guard: requireAdmin() 404s anyone who isn't
// on the ADMIN_EMAILS allowlist before a single child renders.

const getNavCounts = unstable_cache(
  async (adminEmail: string) => {
    // We use createAdminClient() or just pass the admin from auth
    // Wait, unstable_cache args must be serializable, we can't pass SupabaseClient.
    // We will initialize it inside.
    const { createAdminClient } = await import('@/lib/auth');
    const admin = createAdminClient();
    
    const [failures, closuresObj, privacyObj, riskObj, incidentsObj] = await Promise.all([
      countUnresolvedWebhookFailures(admin).catch(() => 0),
      loadPendingIrreversibleWork(admin, 1, 0).catch(() => ({ metrics: { pendingClosuresCount: 0 } })),
      listPlatformPrivacyRequestsPaged(admin, { page: 1, pageSize: 1, status: 'open' }).catch(() => ({ total: 0 })),
      buildRiskQueue(admin, new Date(), 1, 1).catch(() => ({ totalAccounts: 0 })),
      getOpenIncidents(admin).catch(() => [])
    ]);

    return {
      closures: closuresObj.metrics?.pendingClosuresCount || 0,
      privacy: privacyObj.total || 0,
      risk: riskObj.totalAccounts || 0,
      failures: failures || 0,
      incidents: incidentsObj.length || 0,
    } as NavCounts;
  },
  ['admin-nav-counts'],
  { revalidate: 60 }
);

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { adminEmail, role } = await requireAdmin();
  const counts = await getNavCounts(adminEmail);

  return (
    <div className={styles.shell}>
      const counts = await getNavCounts(adminEmail);
      <AdminChrome adminEmail={adminEmail} role={role} counts={counts} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
