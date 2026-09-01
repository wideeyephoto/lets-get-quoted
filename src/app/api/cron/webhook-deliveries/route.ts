import { cronRoute } from '@/lib/cron-runs';
import { runWebhookDeliveryBatch } from '@/lib/public-api/webhook-delivery-worker';

export const GET = cronRoute('webhook-deliveries', async () => {
  return runWebhookDeliveryBatch(25);
});
