import { NextResponse } from 'next/server';
import { runGeocodeSweep } from '@/lib/geocode-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Nightly repair pass (scheduled in vercel.json) for jobs and leads that have an
// address but never got coordinates — normally because the geocoder was down or
// out of quota when the row was written. This work used to happen inside page
// renders, billing geocode lookups on every dashboard load; here it runs once,
// off the critical path.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  // Fail closed: no secret configured, or a mismatched token, means no run.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runGeocodeSweep();
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Geocode backfill cron failed:', error);
    return NextResponse.json({ error: 'Geocode backfill failed' }, { status: 500 });
  }
}
