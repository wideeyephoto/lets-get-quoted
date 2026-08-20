import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/auth';
import { applyDuePlanChanges, PLAN_CHANGE_APPLY_BATCH_SIZE } from '@/lib/billing/plan-change-worker';
import { cronRoute } from '@/lib/cron-runs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Applies base-plan changes whose renewal date has arrived.
 *
 * Deliberately NOT behind an `LGQ_*_ENABLED` gate, unlike its neighbours. A
 * scheduled change is written by a customer action that has already told them a
 * date; a flag that silently stopped this worker would turn every one of those
 * into a promise nothing keeps. The other workers can be dark because nothing
 * has been promised to anybody while they are off.
 *
 * `cronRoute` still enforces CRON_SECRET and records the run in `cron_runs`, so
 * this is authenticated and observable -- a run that finds nothing to do records
 * a clean pass, which is how "scheduled but never ran" stays visible.
 */
const authenticatedGET = cronRoute('plan-change-apply', async () => applyDuePlanChanges({
  admin: createAdminClient(),
  limit: PLAN_CHANGE_APPLY_BATCH_SIZE,
}));

export async function GET(request: Request): Promise<NextResponse> {
  return authenticatedGET(request);
}
