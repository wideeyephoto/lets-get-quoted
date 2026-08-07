import { cronRoute } from '@/lib/cron-runs';
import { runMorningConfirmationSweep } from '@/lib/arrival-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Morning sweep (scheduled in vercel.json): tells today's customers the window
// they can expect, before anybody sets off. Opt-in per account, skipped for any
// job whose crew has already said they are on the way.
export const GET = cronRoute('arrival-confirm', runMorningConfirmationSweep);
