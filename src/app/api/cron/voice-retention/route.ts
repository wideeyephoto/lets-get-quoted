import { cronRoute } from '@/lib/cron-runs';
import { runVoiceRetentionBatch } from '@/lib/voice/retention';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// No feature flag by design: once caller content has been collected, disabling
// a product rollout must not disable the promised deletion schedule.
export const GET = cronRoute('voice-retention', runVoiceRetentionBatch);
