import { NextResponse } from 'next/server';
import { runServiceReminderSweep } from '@/lib/warranty-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Weekly sweep (scheduled in vercel.json): tells contractors which past jobs are
// due the servicing their warranty depends on. Goes to the CONTRACTOR, not the
// customer — see the note in warranty-sweep.ts.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json(await runServiceReminderSweep());
  } catch (error) {
    console.error('Service reminder sweep failed:', error);
    return NextResponse.json({ error: 'Service reminder sweep failed' }, { status: 500 });
  }
}
