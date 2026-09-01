import { cronRoute } from '@/lib/cron-runs';
import { syncAllGoogleLsaAccounts } from '@/lib/google-lsa/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Google exposes no Local Services webhook. A bounded overlap every fifteen
// minutes catches late credit/status changes; the sync performs a 90-day
// rescan once a day and all writes are idempotent.
export const GET = cronRoute('google-lsa-sync', syncAllGoogleLsaAccounts);
