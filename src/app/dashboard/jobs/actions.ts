'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import {
  createCost,
  createJob,
  deleteCost,
  deleteJob,
  updateJob,
  updateJobSchedule,
  type CostType,
  type JobStatus,
} from '@/lib/jobs';
import { uploadJobPhoto } from '@/lib/job-photo-storage';

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
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
    address: optionalText(formData.get('address')),
    scope: optionalText(formData.get('scope')),
    status: (formData.get('status') as JobStatus) || 'new_lead',
    scheduledFor: optionalText(formData.get('scheduledFor')),
    quotedAmount: parseAmount(formData.get('quotedAmount')),
    photoPaths,
  });

  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/jobs/${job.id}`);
}

export async function updateJobAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  await updateJob(supabase, accountId, jobId, {
    clientName: (formData.get('clientName') ?? '').toString().trim(),
    clientPhone: optionalText(formData.get('clientPhone')),
    address: optionalText(formData.get('address')),
    scope: optionalText(formData.get('scope')),
    status: (formData.get('status') as JobStatus) || 'new_lead',
    scheduledFor: optionalText(formData.get('scheduledFor')),
    quotedAmount: parseAmount(formData.get('quotedAmount')),
  });

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function scheduleJobAction(jobId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  await updateJobSchedule(supabase, accountId, jobId, optionalText(formData.get('scheduledFor')));

  revalidatePath('/dashboard/jobs');
  revalidatePath(`/dashboard/jobs/${jobId}`);
  revalidatePath('/dashboard/schedule');
}

export async function deleteJobAction(jobId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteJob(supabase, accountId, jobId);

  revalidatePath('/dashboard/jobs');
  redirect('/dashboard/jobs');
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

    await createCost(supabase, accountId, jobId, {
      type: 'labor',
      description,
      crewId: optionalText(formData.get('crewId')),
      hours,
      rate,
    });
  } else {
    const amount = parseAmount(formData.get('amount'));

    if (amount <= 0) {
      throw new Error('Cost amount must be greater than 0.');
    }

    await createCost(supabase, accountId, jobId, {
      type,
      description,
      amount,
      supplier: optionalText(formData.get('supplier')),
    });
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
}

export async function deleteCostAction(jobId: string, costId: string) {
  const { supabase, accountId } = await requireOwnerContext();

  await deleteCost(supabase, accountId, jobId, costId);

  revalidatePath(`/dashboard/jobs/${jobId}`);
}
