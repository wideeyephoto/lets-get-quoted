'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { convertLeadToJob, updateLeadStatus, type LeadStatus } from '@/lib/leads';

const VALID_STATUSES = new Set<LeadStatus>(['new', 'contacted', 'quoted', 'won', 'lost']);

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