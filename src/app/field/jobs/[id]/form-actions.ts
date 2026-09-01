'use server';

import { revalidatePath } from 'next/cache';
import { requireCrewContext } from '@/lib/crew-auth';
import type { JobFormSubmission } from '@/lib/forms/types';
import { saveJobFormSubmission } from '@/lib/forms/forms-data';

/**
 * Saves a field technician's form submission or draft.
 */
export async function saveFieldFormAction(
  submission: JobFormSubmission,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { supabase, accountId, crew } = await requireCrewContext();

    submission.submittedByCrewId = crew.id;
    submission.submittedByName = crew.name;

    const saved = await saveJobFormSubmission(supabase, accountId, submission);

    if (saved.status === 'completed' || saved.status === 'awaiting_customer_signature') {
      try {
        await supabase.from('job_feed').insert({
          account_id: accountId,
          job_id: submission.jobId,
          kind: 'form_completed',
          author: crew.name,
          title: `Field Checklist Completed: ${submission.templateSnapshot.title}`,
          body: `Inspection finished with ${saved.summary.passedItems} passed, ${saved.summary.failedItems} failed items (${saved.summary.compliancePct}% score).`,
          visibility: 'internal',
        });
      } catch {
        // Non-critical feed logging
      }
    }

    revalidatePath(`/field/jobs/${submission.jobId}`);
    revalidatePath(`/dashboard/jobs/${submission.jobId}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save form.' };
  }
}
