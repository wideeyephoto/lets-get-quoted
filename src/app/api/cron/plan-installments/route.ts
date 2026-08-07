import { cronRoute } from '@/lib/cron-runs';
import { runDuePlanInstallments } from '@/lib/payment-plans';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Daily sweep (scheduled in vercel.json) that charges every payment-plan
// installment due today or earlier off-session against the saved card, and
// retries due failures up to the attempt cap. "Paid" is still only ever set by
// the verified Stripe webhook — this just initiates the off-session charges.
export const GET = cronRoute('plan-installments', runDuePlanInstallments);
