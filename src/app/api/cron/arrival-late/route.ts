import { NextResponse } from 'next/server';
import { runLateArrivalSweep } from '@/lib/arrival-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Every 15 minutes (scheduled in vercel.json): find visits past the window they
// promised and nudge the CREW — not the customer. Same CRON_SECRET auth as the
// other sweeps.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await runLateArrivalSweep());
  } catch (error) {
    console.error('Late arrival sweep failed:', error);
    return NextResponse.json({ error: 'Late sweep failed' }, { status: 500 });
  }
}
