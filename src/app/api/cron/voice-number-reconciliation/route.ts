import { cronRoute } from '@/lib/cron-runs';
import { runVoiceNumberReconciliation } from '@/lib/voice/number-reconciliation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = cronRoute('voice-number-reconciliation', runVoiceNumberReconciliation);
