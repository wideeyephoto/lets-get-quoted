import { cronRoute } from '@/lib/cron-runs';
import { runServiceReminderSweep } from '@/lib/warranty-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Weekly sweep (scheduled in vercel.json): tells contractors which past jobs are
// due the servicing their warranty depends on. Goes to the CONTRACTOR, not the
// customer — see the note in warranty-sweep.ts.
export const GET = cronRoute('service-reminders', runServiceReminderSweep);
