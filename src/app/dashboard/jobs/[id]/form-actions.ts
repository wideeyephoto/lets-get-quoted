'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import type { JobFormSubmission } from '@/lib/forms/types';
import {
  createJobFormSubmission,
  getJobFormSubmission,
  saveJobFormSubmission,
} from '@/lib/forms/forms-data';

/**
 * Attaches a new form template to a job.
 */
export async function attachJobFormAction(
  jobId: string,
  templateId: string,
): Promise<{ success: boolean; submissionId?: string; error?: string }> {
  try {
    const { supabase, accountId } = await requireOwnerContext();
    const submission = await createJobFormSubmission(supabase, accountId, jobId, templateId);

    // Add feed notice
    try {
      await supabase.from('job_feed').insert({
        account_id: accountId,
        job_id: jobId,
        kind: 'form_attached',
        author: 'Office',
        title: `Form Attached: ${submission.templateSnapshot.title}`,
        body: `Assigned ${submission.templateSnapshot.category.replace('_', ' ')} checklist for field completion.`,
        visibility: 'internal',
      });
    } catch {
      // Non-critical feed logging
    }

    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { success: true, submissionId: submission.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to attach form.' };
  }
}

/**
 * Updates a form submission (e.g. saving edits or reviewing).
 */
export async function updateJobFormAction(
  jobId: string,
  submission: JobFormSubmission,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, accountId } = await requireOwnerContext();
    await saveJobFormSubmission(supabase, accountId, submission);

    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update form.' };
  }
}

/**
 * Requests customer signature for a completed inspection / completion certificate.
 */
export async function requestCustomerSignatureAction(
  jobId: string,
  submissionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, accountId } = await requireOwnerContext();
    const submission = await getJobFormSubmission(supabase, accountId, submissionId);
    if (!submission) {
      return { success: false, error: 'Form submission not found.' };
    }

    submission.status = 'awaiting_customer_signature';
    await saveJobFormSubmission(supabase, accountId, submission);

    try {
      await supabase.from('job_feed').insert({
        account_id: accountId,
        job_id: jobId,
        kind: 'form_signature_requested',
        author: 'Office',
        title: `Completion Certificate Sent for Customer Signature`,
        body: `Homeowner requested to e-sign "${submission.templateSnapshot.title}" via client portal.`,
        visibility: 'client',
      });
    } catch {
      // Non-critical feed logging
    }

    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to request signature.' };
  }
}
