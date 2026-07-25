import { NextResponse } from 'next/server';
import { runDueRecurringPlans } from '@/lib/recurring';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that spawns a scheduled job for every
// active recurring plan due today, auto-charging the saved card where one is on
// file. Same CRON_SECRET auth as the other crons.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runDueRecurringPlans();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Recurring plans cron failed:', error);
    return NextResponse.json({ error: 'Recurring run failed' }, { status: 500 });
  }
}
