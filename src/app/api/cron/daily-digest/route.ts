import { NextResponse } from 'next/server';
import { runDailyDigests } from '@/lib/daily-digest';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that emails each opted-in owner a digest
// of their business — money in, new leads, quotes approved, today's schedule,
// confirmations, reviews, rebook nudges. Idempotent per UTC day. Same CRON_SECRET
// auth as the other crons.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runDailyDigests();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Daily digest cron failed:', error);
    return NextResponse.json({ error: 'Digest run failed' }, { status: 500 });
  }
}
