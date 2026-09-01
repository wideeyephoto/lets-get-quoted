import { cronRoute } from '@/lib/cron-runs';
import { syncAllGoogleLsaAccounts } from '@/lib/google-lsa/reporting';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Periodic synchronization of Google Local Services Ads leads, spend facts, and attribution.
//
// Safe to re-run: overlapping windows update existing records idempotently.
export const GET = cronRoute('google-lsa-sync', syncAllGoogleLsaAccounts);
