import { cronRoute } from '@/lib/cron-runs';
import { runSelectionChaseSweep } from '@/lib/selection-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that chases homeowners sitting on a
// decision: once as the decide-by date approaches, once after it passes, and
// never for a selection with no date on it — a contractor who left the date
// blank said this one does not matter yet.
//
// Batched per job, so a kitchen with six choices due the same day is one text.
export const GET = cronRoute('selection-chase', runSelectionChaseSweep);
