'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { convertLeadToJob, createLead, updateLeadStatus, type LeadStatus } from '@/lib/leads';
import { uploadLeadPhoto } from '@/lib/lead-photo-storage';

const VALID_STATUSES = new Set<LeadStatus>(['new', 'contacted', 'quoted', 'won', 'lost']);

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

export async function createLeadAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const photoFiles = formData.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0);
  const photoPaths: string[] = [];
  for (const file of photoFiles) {
    photoPaths.push(await uploadLeadPhoto(accountId, file));
  }

  await createLead(supabase, accountId, {
    source: 'manual',
    name: (formData.get('name') ?? '').toString().trim(),
    phone: optionalText(formData.get('phone')),
    email: optionalText(formData.get('email')),
    address: optionalText(formData.get('address')),
    projectType: optionalText(formData.get('projectType')),
    message: optionalText(formData.get('message')),
    photoPaths,
  });

  revalidatePath('/dashboard/leads');
}

export async function updateLeadStatusAction(leadId: string, formData: FormData) {
  const status = String(formData.get('status') ?? '') as LeadStatus;
  if (!VALID_STATUSES.has(status)) throw new Error('Choose a valid lead status.');
  const { supabase, accountId } = await requireOwnerContext();
  await updateLeadStatus(supabase, accountId, leadId, status);
  revalidatePath('/dashboard/leads');
  revalidatePath(`/dashboard/leads/${leadId}`);
}

export async function convertLeadAction(leadId: string, formData: FormData) {
  const amount = Number(formData.get('quotedAmount'));
  const quotedAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  const { supabase, accountId } = await requireOwnerContext();
  const job = await convertLeadToJob(supabase, accountId, leadId, quotedAmount);
  revalidatePath('/dashboard/leads');
  revalidatePath('/dashboard/jobs');
  redirect(`/dashboard/jobs/${job.id}`);
}