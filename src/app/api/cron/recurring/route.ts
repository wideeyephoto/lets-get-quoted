import { cronRoute } from '@/lib/cron-runs';
import { runDueRecurringPlans } from '@/lib/recurring';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that spawns a scheduled job for every
// active recurring plan due today, auto-charging the saved card where one is on
// file.
export const GET = cronRoute('recurring', runDueRecurringPlans);
