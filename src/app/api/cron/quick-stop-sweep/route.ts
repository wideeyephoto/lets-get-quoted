import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { sweepQuickStopOffers } from '@/lib/quick-stop-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Global sweep of expired Quick Stop offers: releases lapsed payment holds and
// closes out unanswered requests. The hard money-guard is enforced at checkout
// regardless of this cadence; this keeps calendars and statuses tidy. Same
// CRON_SECRET auth as the other crons. (The Quick Stops dashboard also runs an
// account-scoped sweep on load, so an owner's view is current between runs.)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await sweepQuickStopOffers(createAdminClient());
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Quick Stop sweep cron failed:', error);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
