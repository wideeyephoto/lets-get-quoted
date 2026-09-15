import { cronRoute } from '@/lib/cron-runs';
import { runVoiceReceiptRecovery } from '@/lib/voice/receipt-recovery';
import { recordVoiceOperationalHealth } from '@/lib/voice/operational-health';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export const GET = cronRoute('voice-receipt-recovery', async () => {
  const recovery = await runVoiceReceiptRecovery();
  // Check after recovery so repaired receipts do not raise stale alerts.
  const health = await recordVoiceOperationalHealth();
  return { ...recovery, health, failed: recovery.failed + health.failed };
});
