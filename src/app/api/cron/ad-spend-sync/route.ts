import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { processAllAdSpendSync, processUpcomingPaymentSmsAlerts } from '@/lib/ad-billing';
import { retryPendingOfflineConversions } from '@/lib/google-ads-conversion-outbox';
import { retryPendingMetaCapiConversions } from '@/lib/meta-capi-outbox';

export const dynamic = 'force-dynamic';

export const GET = cronRoute('ad-spend-sync', async () => {
  const admin = createAdminClient();
  const res = await processAllAdSpendSync(admin);
  const smsRes = await processUpcomingPaymentSmsAlerts(admin);
  const convRes = await retryPendingOfflineConversions(admin);
  const metaConvRes = await retryPendingMetaCapiConversions(admin);

  if (res.failed > 0) {
    console.error(`[AdSpendSync] ${res.failed} active campaign(s) failed spend synchronization:`, res.failures);
  }

  return {
    processed: res.processed,
    succeeded: res.succeeded,
    failed: res.failed,
    failures: res.failures,
    totalSpendSyncedCents: res.totalSpendSyncedCents,
    totalSpendSyncedDollars: (res.totalSpendSyncedCents / 100).toFixed(2),
    upcomingPaymentAlertsSent: smsRes.alertsSent,
    offlineConversionsRetried: convRes.processed,
    offlineConversionsSucceeded: convRes.succeeded,
    metaConversionsRetried: metaConvRes.processed,
    metaConversionsSucceeded: metaConvRes.succeeded,
    summary: `Processed ${res.processed} active ad campaigns (${res.succeeded} succeeded, ${res.failed} failed), synced $${(res.totalSpendSyncedCents / 100).toFixed(2)} consumed ad spend. Dispatched ${smsRes.alertsSent} 24-hour advance billing SMS alerts. Retried ${convRes.processed} pending Google conversions (${convRes.succeeded} succeeded) and ${metaConvRes.processed} pending Meta CAPI conversions (${metaConvRes.succeeded} succeeded).`,
  };
});

