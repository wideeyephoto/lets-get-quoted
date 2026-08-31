import { cronRoute } from '@/lib/cron-runs';
import { runContractorLifecycleSweep } from '@/lib/contractor-lifecycle-emails';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that advances newly registered trade
// contractors through the onboarding lifecycle sequence (Days 1–30, plus state-aware
// Stripe connection and quote creation nudges). Idempotent per step via account_events.
export const GET = cronRoute('contractor-lifecycle', () => runContractorLifecycleSweep());
