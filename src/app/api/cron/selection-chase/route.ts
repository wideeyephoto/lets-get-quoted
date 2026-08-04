import { NextResponse } from 'next/server';
import { runSelectionChaseSweep } from '@/lib/selection-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that chases homeowners sitting on a
// decision: once as the decide-by date approaches, once after it passes, and
// never for a selection with no date on it — a contractor who left the date
// blank said this one doesn't matter yet.
//
// Batched per job, so a kitchen with six choices due the same day is one text.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  // Fail closed: no secret configured, or a mismatched token, means no run.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runSelectionChaseSweep();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Selection chase cron failed:', error);
    return NextResponse.json({ error: 'Selection chase run failed' }, { status: 500 });
  }
}
