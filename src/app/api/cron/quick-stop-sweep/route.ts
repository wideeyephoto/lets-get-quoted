import { createAdminClient } from '@/lib/auth';
import { cronRoute } from '@/lib/cron-runs';
import { sweepQuickStopOffers } from '@/lib/quick-stop-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Global sweep of expired Quick Stop offers: releases lapsed payment holds and
// closes out unanswered requests. The hard money-guard is enforced at checkout
// regardless of this cadence; this keeps calendars and statuses tidy. (The Quick
// Stops dashboard also runs an account-scoped sweep on load, so an owner's view
// is current between runs.)
export const GET = cronRoute('quick-stop-sweep', () => sweepQuickStopOffers(createAdminClient()));
