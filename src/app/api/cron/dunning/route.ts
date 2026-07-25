import { NextResponse } from 'next/server';
import { runDunningRetries } from '@/lib/dunning';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that retries failed recurring saved-card
// charges whose backoff is due, marking recovered/exhausted and notifying as it
// goes. Idempotency keys make a re-run safe. Same CRON_SECRET auth as the others.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runDunningRetries();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Dunning cron failed:', error);
    return NextResponse.json({ error: 'Dunning run failed' }, { status: 500 });
  }
}
