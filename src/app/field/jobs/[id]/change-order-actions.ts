'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { requireCrewContext } from '@/lib/crew-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { isJobPhotoFile, uploadJobPhoto } from '@/lib/job-photo-storage';
import { raiseChangeOrder } from '@/lib/change-orders-data';
import { createJobFeedEvent } from '@/lib/job-feed';
import { assertAssigned } from './actions';

const MAX_PHOTOS = 3;

/**
 * A crew member raises a change order from site.
 *
 * They document; they do not price. Deciding what to charge for extra work is
 * the owner's call, and asking a crew member to put a number on it either gets
 * a guess sent to a customer or gets nothing raised at all.
 *
 * The photo is the point. "Found rot" is a claim; a photo of the rot, timestamped
 * against this job, is the thing that ends the argument six weeks later.
 */
export async function raiseFieldChangeOrderAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  // Uploads storage and will burn a paid vision call downstream — cap it.
  if (!(await checkRateLimit(createAdminClient(), `co-raise:${accountId}:${crew.id}`, 20, 3600))) {
    redirect(`/field/jobs/${jobId}?logged=change-order-busy`);
  }

  const title = String(formData.get('title') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();
  if (!note) redirect(`/field/jobs/${jobId}?logged=change-order-invalid`);

  const photoPaths: string[] = [];
  for (const entry of formData.getAll('photos').slice(0, MAX_PHOTOS)) {
    if (!isJobPhotoFile(entry)) continue;
    try {
      photoPaths.push(await uploadJobPhoto(accountId, entry));
    } catch (error) {
      // One bad photo must not lose the note. The write-up is the thing that
      // has to survive; a missing image is recoverable, a missing find is not.
      console.error('Change order photo upload failed:', error instanceof Error ? error.message : error);
    }
  }

  const order = await raiseChangeOrder(supabase, accountId, jobId, {
    crewId: crew.id,
    crewName: crew.name,
    title: title || 'Additional work found',
    fieldNote: note,
    photoPaths,
  });

  // Internal only. The homeowner hears about this when the owner has decided
  // what it costs and chosen to send it — not the moment somebody opens a wall.
  try {
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'change_order_raised',
      title: `${crew.name} found extra work: ${order.title}`,
      body: note,
      visibility: 'internal',
      sourceTable: 'change_orders',
      sourceId: order.id,
    });
  } catch (error) {
    console.error('Change order feed event failed:', error instanceof Error ? error.message : error);
  }

  revalidatePath(`/field/jobs/${jobId}`);
  revalidatePath(`/dashboard/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?logged=change-order`);
}
