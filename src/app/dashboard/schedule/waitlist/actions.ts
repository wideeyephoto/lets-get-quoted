'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import {
  addWaitlistEntry,
  cancelWaitlistOffer,
  createAndSendWaitlistOffer,
  expireHoldsAndCascade,
  findCandidatesForOpenedWindow,
  removeWaitlistEntry,
  resolveWaitlistOfferReply,
  updateWaitlistEntry,
  type CreateWaitlistInput,
} from '@/lib/cancellation-waitlist-data';
import type {
  OpenedSlotWindow,
  RankedWaitlistCandidate,
  WaitlistOffer,
  WaitlistStatus,
} from '@/lib/cancellation-waitlist';

export async function addWaitlistEntryAction(input: CreateWaitlistInput) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const entry = await addWaitlistEntry(supabase, accountId, input);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, entry };
}

export async function updateWaitlistEntryAction(
  id: string,
  updates: Partial<CreateWaitlistInput> & { status?: WaitlistStatus },
) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const entry = await updateWaitlistEntry(supabase, accountId, id, updates);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, entry };
}

export async function removeWaitlistEntryAction(id: string) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  await removeWaitlistEntry(supabase, accountId, id);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true };
}

export async function findCandidatesAction(slot: OpenedSlotWindow): Promise<RankedWaitlistCandidate[]> {
  const { supabase, accountId } = await requireOfficeContext('schedule.read');
  return findCandidatesForOpenedWindow(supabase, accountId, slot);
}

export async function sendWaitlistOfferAction(input: {
  waitlistEntryId: string;
  slot: OpenedSlotWindow;
  rank: number;
  score: RankedWaitlistCandidate['score'];
  holdMinutes?: number;
  customBody?: string;
  autoCascade?: boolean;
}) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const offer = await createAndSendWaitlistOffer(supabase, accountId, input);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, offer };
}

export async function cancelWaitlistOfferAction(offerId: string) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  await cancelWaitlistOffer(supabase, accountId, offerId);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true };
}

export async function manualAcceptOfferAction(offerId: string) {
  const { supabase } = await requireOfficeContext('schedule.write');
  const result = await resolveWaitlistOfferReply(supabase, offerId, 'YES');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, result };
}

export async function manualDeclineOfferAction(offerId: string) {
  const { supabase } = await requireOfficeContext('schedule.write');
  const result = await resolveWaitlistOfferReply(supabase, offerId, 'NO');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, result };
}

export async function triggerWaitlistSweepAction() {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const result = await expireHoldsAndCascade(supabase, accountId);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, ...result };
}

export async function toggleWaitlistAction(enabled: boolean) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const { error } = await supabase
    .from('accounts')
    .update({ cancellation_waitlist_enabled: enabled })
    .eq('id', accountId);

  if (error) {
    throw new Error(`Failed to update waitlist setting: ${error.message}`);
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/settings');
  revalidatePath('/dashboard/schedule/waitlist');
  return { ok: true, enabled };
}
