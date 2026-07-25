'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireCrewContext } from '@/lib/crew-auth';
import { isJobAssignedToCrew } from '@/lib/crew';
import { createJobFeedEvent } from '@/lib/job-feed';
import { createCost } from '@/lib/jobs';

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

// Crew logs their hours on the job from the field. Amount is server-computed as
// hours × rate (createCost never trusts a client amount for labor); the rate
// defaults to the crew member's saved hourly rate but can be overridden.
export async function logFieldTimeAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const hours = Number(formData.get('hours'));
  if (!Number.isFinite(hours) || hours <= 0) redirect(`/field/jobs/${jobId}?logged=time-invalid`);
  const rawRate = Number(formData.get('rate'));
  const rate = Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : Number(crew.hourly_rate) || 0;
  const note = String(formData.get('description') ?? '').trim();
  const description = note || `${crew.name} — labor`;

  await createCost(supabase, accountId, jobId, { type: 'labor', description, crewId: crew.id, hours, rate });

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?logged=time`);
}

// Crew logs a material/expense from the field. We attribute it to the crew
// member (crew_id/crew_name) so the owner sees who bought what.
export async function logFieldMaterialAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const description = String(formData.get('description') ?? '').trim();
  const amount = Number(formData.get('amount'));
  if (!description || !Number.isFinite(amount) || amount < 0) redirect(`/field/jobs/${jobId}?logged=material-invalid`);

  const cost = await createCost(supabase, accountId, jobId, { type: 'material', description, amount });
  await supabase.from('costs').update({ crew_id: crew.id, crew_name: crew.name }).eq('account_id', accountId).eq('id', cost.id);

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?logged=material`);
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
