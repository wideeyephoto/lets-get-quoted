import { cronRoute } from '@/lib/cron-runs';
import { createAdminClient } from '@/lib/auth';
import { processAllWalletAutoRefills } from '@/lib/ad-billing';

export const dynamic = 'force-dynamic';

export const GET = cronRoute('ad-wallet-refill', async () => {
  const admin = createAdminClient();
  const res = await processAllWalletAutoRefills(admin);
  return {
    processed: res.processed,
    refilled: res.refilled,
    summary: `Processed ${res.processed} wallet accounts, refilled ${res.refilled}.`,
  };
});
