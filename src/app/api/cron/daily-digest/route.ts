import { cronRoute } from '@/lib/cron-runs';
import { runDailyDigests } from '@/lib/daily-digest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that emails each opted-in owner a digest
// of their business — money in, new leads, quotes approved, today's schedule,
// confirmations, reviews, rebook nudges. Idempotent per UTC day.
export const GET = cronRoute('daily-digest', runDailyDigests);
