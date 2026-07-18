'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import {
  createCost,
  createJob,
  deleteCost,
  deleteJob,
  getJob,
  formatJobQuoteSummary,
  updateJob,
  updateJobSchedule,
  type CostType,
  type JobStatus,
} from '@/lib/jobs';
import {
  createClientJobAccessToken,
  createJobFeedEvent,
  getActiveClientAccessCount,
  revokeClientJobAccess,
} from '@/lib/job-feed';
import { uploadJobPhoto } from '@/lib/job-photo-storage';
import { listCrew, setJobCrewAssignments, toggleJobCrewAssignment } from '@/lib/crew';
import { normalizeUsPhone } from '@/lib/phone';
import { createAndSendScheduleRequest, formatScheduleOption, type ScheduleOption } from '@/lib/scheduling';
import { recordSmsConsent, sendCrewAssignmentSms, sendJobUpdateSms } from '@/lib/sms';

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function optionalAmount(value: FormDataEntryValue | null): number | null {
  const text = (value ?? '').toString().trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

function parseJobStatus(value: unknown): JobStatus | null {
  return value === 'new_lead' || value === 'in_progress' || value === 'complete' || value === 'archived' ? value : null;
}

export async function createJobAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const photoFiles = formData.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0);
  const photoPaths: string[] = [];
  for (const file of photoFiles) {
    photoPaths.push(await uploadJobPhoto(accountId, file));
  }

  const job = await createJob(supabase, accountId, {
    clientName: (formData.get('clientName') ?? '').toString().trim(),
    clientPhone: optionalText(formData.get('clientPhone')),
    clientEmail: optionalText(formData.get('clientEmail')),
    address: optionalText(formData.get('address')),
    scope: optionalText(formData.get('scope')),
    status: (formData.get('status') as JobStatus) || 'new_lead',
    scheduledFor: optionalText(formData.get('scheduledFor')),
    scheduledTime: optionalText(formData.get('scheduledTime')),
    estimatedHours: optionalAmount(formData.get('estimatedHours')),
    quotedAmount: parseAmount(formData.get('quotedAmount')),
    photoPaths,
  });

  await createJobFeedEvent(supabase, accountId, job.id, {
    kind: 'job_created',
    title: `${job.ref} created`,
    body: formatJobQuoteSummary(job),
    visibility: 'client',
    sourceTable: 'jobs',
    sourceId: job.id,
  });

  const token = await createClientJobAccessToken(supabase, accountId, job.id, { clientPhone: job.client_phone, clientEmail: job.client_email });

  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/jobs/${job.id}?tab=feed&clientToken=${token}`);
}

export async function updateJobAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const clientFeedAccessEnabled = formData.get('clientFeedAccess') === 'on';

  const updatedJob = await updateJob(supabase, accountId, jobId, {
    clientName: (formData.get('clientName') ?? '').toString().trim(),
    clientPhone: optionalText(formData.get('clientPhone')),
    clientEmail: optionalText(formData.get('clientEmail')),
    address: optionalText(formData.get('address')),
    scope: optionalText(formData.get('scope')),
    status: (formData.get('status') as JobStatus) || 'new_lead',
    scheduledFor: optionalText(formData.get('scheduledFor')),
    scheduledTime: optionalText(formData.get('scheduledTime')),
    estimatedHours: optionalAmount(formData.get('estimatedHours')),
    quotedAmount: parseAmount(formData.get('quotedAmount')),
  });

  const activeClientAccessCount = await getActiveClientAccessCount(supabase, accountId, jobId);
  if (!clientFeedAccessEnabled && activeClientAccessCount > 0) {
    await revokeClientJobAccess(supabase, accountId, jobId);
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'client_link_revoked',
      title: 'Client view links revoked',
      body: 'Active client view links for this job were revoked.',
      visibility: 'internal',
    });
  } else if (clientFeedAccessEnabled && activeClientAccessCount === 0) {
    await createClientJobAccessToken(supabase, accountId, jobId, { clientPhone: updatedJob.client_phone, clientEmail: updatedJob.client_email });
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'client_link_created',
      title: 'Client view link created',
      body: 'A client view link was created for this job.',
      visibility: 'internal',
    });
  }

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title: 'Job details updated',
    body: `The job record for ${updatedJob.client_name} was updated.`,
    visibility: 'internal',
    meta: { status: updatedJob.status },
  });

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function markJobCompleteAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  if (job.status !== 'complete') {
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'complete' })
      .eq('account_id', accountId)
      .eq('id', jobId);
    if (error) throw error;

    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'job_completed',
      title: 'Job marked complete',
      body: `${job.ref} was marked complete.`,
      visibility: 'client',
      meta: { status: 'complete', previousStatus: job.status },
    });
  }

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function undoJobCompleteAction(jobId: string, eventId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const { data: event, error: eventError } = await supabase
    .from('job_feed')
    .select('id, kind, meta')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', eventId)
    .eq('kind', 'job_completed')
    .maybeSingle();

  if (eventError) throw eventError;
  if (!event) throw new Error('Completion event not found for this job.');

  const previousStatus = parseJobStatus((event.meta as { previousStatus?: unknown } | null)?.previousStatus) ?? 'in_progress';
  const { error: updateError } = await supabase
    .from('jobs')
    .update({ status: previousStatus })
    .eq('account_id', accountId)
    .eq('id', jobId);
  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from('job_feed')
    .delete()
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', eventId)
    .eq('kind', 'job_completed');
  if (deleteError) throw deleteError;

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function scheduleJobAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const scheduledJob = await updateJobSchedule(supabase, accountId, jobId, optionalText(formData.get('scheduledFor')), optionalText(formData.get('scheduledTime')));

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_scheduled',
    title: 'Job schedule updated',
    body: `Scheduled for ${scheduledJob.scheduled_for || 'a date to be determined'}.`,
    visibility: 'client',
    meta: { scheduled_for: scheduledJob.scheduled_for, scheduled_time: scheduledJob.scheduled_time },
  });

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/schedule');
}

export async function sendClientScheduleOptionsAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const phoneInput = (formData.get('scheduleClientPhone') ?? '').toString();
  const clientPhone = normalizeUsPhone(phoneInput);
  if (!clientPhone) throw new Error('Enter a valid client mobile number before sending schedule options.');
  if (formData.get('scheduleSmsConsent') !== 'on') throw new Error('Confirm the client agreed to receive scheduling texts.');

  const options: ScheduleOption[] = [1, 2, 3].map((index) => ({
    date: (formData.get(`scheduleDate${index}`) ?? '').toString(),
    time: optionalText(formData.get(`scheduleTime${index}`)),
  }));

  const request = await createAndSendScheduleRequest(supabase, accountId, jobId, { clientPhone, options });
  const optionSummary = request.options.map((option, index) => `${index + 1}. ${formatScheduleOption(option)}`).join(' ');

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_scheduled',
    title: 'Schedule options sent',
    body: `Schedule options were texted to ${job.client_name}: ${optionSummary}`,
    visibility: 'client',
    meta: { schedule_request_id: request.id, options: request.options },
  });

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteJobAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteJob(supabase, accountId, jobId);

  revalidatePath('/dashboard/jobs');
  redirect('/dashboard/jobs');
}

export async function updateJobCrewAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const crewIds = formData.getAll('crewIds').map(String);
  const { added } = await setJobCrewAssignments(supabase, accountId, jobId, crewIds);

  if (added.length > 0) {
    const [job, { data: account }, crewMembers] = await Promise.all([
      getJob(supabase, accountId, jobId),
      supabase.from('accounts').select('business_name').eq('id', accountId).single(),
      listCrew(supabase, accountId),
    ]);

    if (job) {
      const businessName = account?.business_name || "Let's Get Quoted contractor";
      const newlyAssigned = crewMembers.filter((member) => added.includes(member.id));

      for (const member of newlyAssigned) {
        try {
          await sendCrewAssignmentSms({
            phone: member.phone,
            crewName: member.name,
            businessName,
            jobRef: job.ref,
            clientName: job.client_name,
            address: job.address,
            scheduledFor: job.scheduled_for,
            scheduledTime: job.scheduled_time,
          });
        } catch (error) {
          console.error(`Crew assignment SMS failed for crew ${member.id} on job ${jobId}:`, error);
        }
      }
    }
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

// Quick single add/remove toggle used by the schedule calendar's click-to-
// assign popover — unlike updateJobCrewAction, this doesn't replace the
// whole assignment set, it just flips one crew member on one job.
export async function toggleJobCrewAction(jobId: string, crewId: string): Promise<{ assigned: boolean }> {
  const { supabase, accountId } = await requireOwnerContext();

  const { assigned } = await toggleJobCrewAssignment(supabase, accountId, jobId, crewId);

  if (assigned) {
    const [job, { data: account }, crewMembers] = await Promise.all([
      getJob(supabase, accountId, jobId),
      supabase.from('accounts').select('business_name').eq('id', accountId).single(),
      listCrew(supabase, accountId),
    ]);
    const member = crewMembers.find((candidate) => candidate.id === crewId);

    if (job && member) {
      const businessName = account?.business_name || "Let's Get Quoted contractor";
      try {
        await sendCrewAssignmentSms({
          phone: member.phone,
          crewName: member.name,
          businessName,
          jobRef: job.ref,
          clientName: job.client_name,
          address: job.address,
          scheduledFor: job.scheduled_for,
          scheduledTime: job.scheduled_time,
        });
      } catch (error) {
        console.error(`Crew assignment SMS failed for crew ${crewId} on job ${jobId}:`, error);
      }
    }
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);

  return { assigned };
}

export async function createCostAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const type = (formData.get('type') as CostType) || 'material';
  const description = (formData.get('description') ?? '').toString().trim() || 'Cost item';

  if (type === 'labor') {
    const hours = parseAmount(formData.get('hours'));
    const rate = parseAmount(formData.get('rate'));

    if (hours <= 0 || rate <= 0) {
      throw new Error('Labor costs require both hours and an hourly rate greater than 0.');
    }

    const cost = await createCost(supabase, accountId, jobId, {
      type: 'labor',
      description,
      crewId: optionalText(formData.get('crewId')),
      supplier: optionalText(formData.get('supplier')),
      hours,
      rate,
    });
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'cost_added',
      title: 'Cost added',
      body: description,
      visibility: 'internal',
      amount: Number(cost.amount),
      sourceTable: 'costs',
      sourceId: cost.id,
    });
  } else {
    const amount = parseAmount(formData.get('amount'));

    if (amount <= 0) {
      throw new Error('Cost amount must be greater than 0.');
    }

    const cost = await createCost(supabase, accountId, jobId, {
      type,
      description,
      amount,
      supplier: optionalText(formData.get('supplier')),
    });
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'cost_added',
      title: 'Cost added',
      body: description,
      visibility: 'internal',
      amount: Number(cost.amount),
      sourceTable: 'costs',
      sourceId: cost.id,
    });
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function createManualJobFeedAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const title = (formData.get('title') ?? '').toString().trim() || 'Job update';
  const body = optionalText(formData.get('body'));
  const notifyClientSms = formData.get('notifyClientSms') === 'on';
  const visibility = formData.get('visibility') === 'client' || notifyClientSms ? 'client' : 'internal';

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title,
    body,
    visibility,
  });

  if (notifyClientSms) {
    const [job, { data: account }] = await Promise.all([
      getJob(supabase, accountId, jobId),
      supabase.from('accounts').select('business_name').eq('id', accountId).single(),
    ]);
    if (!job) throw new Error('Job not found for this account.');

    const clientPhone = job.client_phone ? normalizeUsPhone(job.client_phone) : null;
    if (!clientPhone) throw new Error('Add a valid client phone number before sending job update texts.');

    await recordSmsConsent(accountId, clientPhone, 'job_update');
    await sendJobUpdateSms({
      phone: clientPhone,
      businessName: account?.business_name || "Let's Get Quoted contractor",
      jobRef: job.ref,
      title,
      body,
    });
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function createClientJobLinkAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  if (!job) throw new Error('Job not found for this account.');

  const token = await createClientJobAccessToken(supabase, accountId, jobId, { clientPhone: job.client_phone });
  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'client_link_created',
    title: 'Client view link created',
    body: 'A client view link was created for this job.',
    visibility: 'internal',
  });

  redirect(`/dashboard/jobs/${jobId}?tab=feed&clientToken=${token}`);
}

export async function revokeClientJobLinkAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await revokeClientJobAccess(supabase, accountId, jobId);
  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'client_link_revoked',
    title: 'Client view links revoked',
    body: 'Active client view links for this job were revoked.',
    visibility: 'internal',
  });

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteCostAction(jobId: string, costId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteCost(supabase, accountId, jobId, costId);

  revalidatePath(`/dashboard/jobs/${jobId}`);
}
