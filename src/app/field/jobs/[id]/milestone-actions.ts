'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCrewContext } from '@/lib/crew-auth';
import { isJobPhotoFile, uploadJobPhoto } from '@/lib/job-photo-storage';
import { addMilestonePhoto } from '@/lib/milestones-data';
import { assertAssigned } from './actions';

const MAX_PHOTOS = 6;

/**
 * A crew member attaches before/after proof to a stage from site.
 *
 * This was the gap that made Proof-to-Pay depend on somebody emailing pictures
 * to somebody else at the end of the day. The people holding the photographs are
 * standing in front of the work.
 *
 * They can add; they cannot remove. Taking evidence out of a payment gate is an
 * owner decision, and a crew member who took a bad photo can just take another.
 */
export async function addFieldMilestonePhotoAction(jobId: string, milestoneId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const phase = formData.get('phase') === 'after' ? 'after' : 'before';
  const caption = String(formData.get('caption') ?? '').trim().slice(0, 160) || null;

  // The milestone must be on THIS job. Without it, an assigned crew member could
  // attach proof to a stage on somebody else's job by id.
  const { data: milestone } = await supabase
    .from('job_milestones')
    .select('id, job_id')
    .eq('account_id', accountId)
    .eq('id', milestoneId)
    .maybeSingle();
  if (!milestone || milestone.job_id !== jobId) {
    redirect(`/field/jobs/${jobId}?logged=photo-invalid`);
  }

  let added = 0;
  for (const entry of formData.getAll('photos').slice(0, MAX_PHOTOS)) {
    if (!isJobPhotoFile(entry)) continue;
    try {
      const path = await uploadJobPhoto(accountId, entry);
      await addMilestonePhoto(supabase, accountId, {
        milestoneId,
        jobId,
        path,
        phase,
        // Only the first photo carries the caption — repeating it on six
        // pictures of the same wall is noise on the owner's screen.
        caption: added === 0 ? caption : null,
      });
      added += 1;
    } catch (error) {
      // One bad upload must not lose the others. A crew member on site gets a
      // partial success and can retry the rest.
      console.error('Field milestone photo failed:', error instanceof Error ? error.message : error);
    }
  }

  revalidatePath(`/field/jobs/${jobId}`);
  revalidatePath(`/dashboard/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?logged=${added > 0 ? 'photo' : 'photo-failed'}`);
}
