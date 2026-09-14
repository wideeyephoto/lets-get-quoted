import { createAdminClient } from '@/lib/auth';
import { cronRoute } from '@/lib/cron-runs';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';
import {runMarginEvaluations} from '@/lib/margin-evaluation-queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const GET = cronRoute('owner-event-notices', async () => {
  if (process.env.LGQ_OWNER_EVENT_NOTICES_ENABLED !== 'true') return { skipped: true, reason: 'Owner notice background sending is disabled.' };
  const admin=createAdminClient();
  let margin={marginEvaluations:0,marginEvaluationFailures:0,marginEvaluationBacklog:0};
  try{margin=await runMarginEvaluations(admin);}catch{margin.marginEvaluationFailures=1;}
  const notices=await runOwnerEventNotices(admin);
  return {...notices,...margin,errors:notices.errors+margin.marginEvaluationFailures};
});
