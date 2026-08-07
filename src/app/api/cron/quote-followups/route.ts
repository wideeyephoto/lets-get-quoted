import { cronRoute } from '@/lib/cron-runs';
import { runStalledQuoteFollowups } from '@/lib/followups';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// HOURLY sweep (scheduled in vercel.json) that nudges clients who were sent a
// quote but have not approved it, on the schedule the account chose, texting
// when they have SMS consent and emailing otherwise. Opt-in per account.
//
// Hourly rather than daily because the send hour is a setting now. Most runs do
// nothing: runStalledQuoteFollowups returns immediately for every account whose
// own local clock has not reached its chosen hour — so a summary of all zeroes
// is the expected result, not a sign of trouble.
export const GET = cronRoute('quote-followups', runStalledQuoteFollowups);
