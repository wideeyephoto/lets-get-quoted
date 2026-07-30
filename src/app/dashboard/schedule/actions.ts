'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { createAvailabilityBlock, deleteAvailabilityBlock } from '@/lib/availability-blocks';

// Block off a day / date range as busy — it drops out of online booking and shows
// blocked on the calendar.
export async function addAvailabilityBlockAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const startDate = String(formData.get('startDate') ?? '').trim();
  const endDate = String(formData.get('endDate') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  await createAvailabilityBlock(supabase, accountId, { startDate, endDate, reason });
  revalidatePath('/dashboard/schedule');
}

export async function removeAvailabilityBlockAction(id: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await deleteAvailabilityBlock(supabase, accountId, id);
  revalidatePath('/dashboard/schedule');
}
