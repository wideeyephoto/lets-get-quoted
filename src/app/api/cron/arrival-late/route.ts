import { cronRoute } from '@/lib/cron-runs';
import { runLateArrivalSweep } from '@/lib/arrival-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Every 15 minutes (scheduled in vercel.json): find visits past the window they
// promised and nudge the CREW — not the customer.
export const GET = cronRoute('arrival-late', runLateArrivalSweep);
