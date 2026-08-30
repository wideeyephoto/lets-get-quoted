import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { processAllAdSpendSync } from '@/lib/ad-billing';

export const dynamic = 'force-dynamic';

export const GET = cronRoute('ad-spend-sync', async () => {
  const admin = createAdminClient();
  const res = await processAllAdSpendSync(admin);
  return {
    processed: res.processed,
    totalSpendSyncedCents: res.totalSpendSyncedCents,
    totalSpendSyncedDollars: (res.totalSpendSyncedCents / 100).toFixed(2),
    summary: `Processed ${res.processed} active ad campaigns, synced $${(res.totalSpendSyncedCents / 100).toFixed(2)} consumed ad spend.`,
  };
});
