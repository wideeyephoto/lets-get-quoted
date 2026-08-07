import { cronRoute } from '@/lib/cron-runs';
import { runGeocodeSweep } from '@/lib/geocode-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Nightly repair pass (scheduled in vercel.json) for jobs and leads that have an
// address but never got coordinates — normally because the geocoder was down or
// out of quota when the row was written. This work used to happen inside page
// renders, billing geocode lookups on every dashboard load; here it runs once,
// off the critical path.
export const GET = cronRoute('geocode-backfill', runGeocodeSweep);
