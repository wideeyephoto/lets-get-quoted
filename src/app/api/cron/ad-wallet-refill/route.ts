import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { processAllWalletAutoRefills } from '@/lib/ad-billing';
import { isManagedAdsCheckoutAllowed } from '@/lib/ad-billing-shared';

export const dynamic = 'force-dynamic';

export const GET = cronRoute('ad-wallet-refill', async () => {
  if (!isManagedAdsCheckoutAllowed()) {
    return {
      processed: 0,
      refilled: 0,
      summary: 'Auto-refills paused: managed ads checkout and billing gate is disabled (FEATURE_MANAGED_ADS_CHECKOUT_ENABLED=false).',
    };
  }

  const admin = createAdminClient();
  const res = await processAllWalletAutoRefills(admin);
  return {
    processed: res.processed,
    refilled: res.refilled,
    summary: `Processed ${res.processed} wallet accounts, refilled ${res.refilled}.`,
  };
});
