'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import {
  getCasesNearSla,
  getUnresolvedWebhookFailures,
  getFailedSmsEvents,
  getFailedEmailEvents,
} from '@/lib/admin-alerts';
import { getCronTrouble } from '@/lib/cron-runs';

export async function getNavBadges() {
  await requireAdmin();
  const supabase = createAdminClient();
  
  const [cases, webhooks, sms, email, crons] = await Promise.all([
    getCasesNearSla(supabase),
    getUnresolvedWebhookFailures(supabase),
    getFailedSmsEvents(supabase),
    getFailedEmailEvents(supabase),
    getCronTrouble(supabase)
  ]);
  
  const failuresCount = webhooks.length + sms.length + email.length;
  const casesCount = cases.length;
  const cronsCount = crons.length;
  
  return {
    failures: failuresCount > 0 ? failuresCount : 0,
    casesNearSla: casesCount > 0 ? casesCount : 0,
    crons: cronsCount > 0 ? cronsCount : 0,
  };
}
