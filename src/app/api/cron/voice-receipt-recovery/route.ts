import { cronRoute } from '@/lib/cron-runs';
import { runVoiceReceiptRecovery } from '@/lib/voice/receipt-recovery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export const GET = cronRoute('voice-receipt-recovery', () => runVoiceReceiptRecovery());
