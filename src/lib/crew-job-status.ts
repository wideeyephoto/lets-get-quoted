import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';

// The crew's status write, as one narrow operation.
//
// WHAT WENT WRONG. The field app updated `jobs` directly with status AND
// started_at. The database carries crew_jobs_update_guard, which permits a crew
// writer to change `status` and nothing else — so on any database with that
// trigger, a crew member's first "Start work" raised
//
//     crew may only change job status
//
// and the job never started. The two requirements are both real: started_at is
// what every owner-facing surface reads to tell "on the calendar" from
// "underway", and a broad UPDATE grant on jobs is exactly what the guard exists
// to close. They cannot both be met through a table write.
//
// So the write moved into the database. crew_set_job_status() checks assignment
// itself, whitelists the two transitions the field app offers, stamps started_at
// once and never re-dates it. The broad crew UPDATE policy on jobs is dropped
// (2026-08-22-field-app-hardening.sql) — this function is the only way in.

export type CrewJobStatus = 'in_progress' | 'complete';

/** PostgREST's "that function isn't in the schema cache" answers. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function/i.test(error.message ?? '') ||
    /schema cache/i.test(error.message ?? '')
  );
}

/**
 * Set the status of a job this crew member is assigned to.
 *
 * The caller has ALREADY verified assignment (assertAssigned) — this checks it
 * again inside the database, because that is the check that survives the server
 * action being wrong.
 *
 * The admin fallback is for the window between deploying this code and running
 * the migration. It is not a second authorisation path: it runs only when the
 * function is absent, and only after both the caller's assignment check and the
 * one below have passed. Without it, deploying in the usual order would leave
 * every crew member unable to start a job until somebody opened the SQL editor.
 */
export async function setCrewJobStatus(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  status: CrewJobStatus,
): Promise<void> {
  const { error } = await supabase.rpc('crew_set_job_status', { j: jobId, new_status: status });
  if (!error) return;

  if (!isMissingFunction(error)) {
    // A real refusal from the database — not assigned, job archived, unknown
    // status. Surface it: every one of these is something the crew member needs
    // to read, and none of them is fixed by trying again another way.
    throw new Error(error.message || 'Could not update this job.');
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from('jobs')
    .select('status, started_at')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (!current) throw new Error('Job not found.');
  if (current.status === 'archived') throw new Error('That job has been archived.');

  const { error: writeError } = await admin
    .from('jobs')
    // Only ever set on the way in — started_at is a record of a thing that
    // happened, and a second press must not re-date it.
    .update({ status, ...(current.started_at ? {} : { started_at: new Date().toISOString() }) })
    .eq('account_id', accountId)
    .eq('id', jobId);
  if (writeError) throw writeError;
}
