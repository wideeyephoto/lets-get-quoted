'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireCrewContext } from '@/lib/crew-auth';
import { isJobAssignedToCrew } from '@/lib/crew';
import { createJobFeedEvent } from '@/lib/job-feed';

async function assertAssigned(supabase: SupabaseClient, accountId: string, jobId: string, crewId: string) {
  if (!(await isJobAssignedToCrew(supabase, accountId, jobId, crewId))) {
    throw new Error('You are not assigned to this job.');
  }
}

export async function setFieldJobStatusAction(jobId: string, status: 'in_progress' | 'complete') {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const { error } = await supabase.from('jobs').update({ status }).eq('account_id', accountId).eq('id', jobId);
  if (error) throw error;

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title: status === 'complete' ? 'Marked complete by crew' : 'Work started by crew',
    body: `${crew.name} ${status === 'complete' ? 'marked this job complete' : 'started work'} from the field app.`,
    visibility: 'internal',
    author: crew.name,
  });

  revalidatePath('/field');
  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}`);
}

export async function postFieldUpdateAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const body = String(formData.get('body') ?? '').trim();
  const share = formData.get('share') === 'on';
  if (!body) redirect(`/field/jobs/${jobId}`);

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title: share ? `Update from ${crew.name}` : `Field note from ${crew.name}`,
    body,
    // Shared updates land on the customer's job dashboard; notes stay internal.
    visibility: share ? 'client' : 'internal',
    author: crew.name,
  });

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}`);
}
