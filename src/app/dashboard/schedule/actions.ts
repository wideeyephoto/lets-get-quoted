'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { createAvailabilityBlock, createRecurringAvailabilityBlocks, deleteAvailabilityBlock, type RepeatFrequency } from '@/lib/availability-blocks';

// Block off a day / date range as busy — it drops out of online booking and shows
// blocked on the calendar.
export async function addAvailabilityBlockAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const startDate = String(formData.get('startDate') ?? '').trim();
  const endDate = String(formData.get('endDate') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  await createAvailabilityBlock(supabase, accountId, { startDate, endDate, reason });
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

// Repeating time off — the same weekday every week, fortnight, or month. Laid
// down as individual blocks (see the lib), so nothing else has to learn a new
// shape of data.
export async function addRecurringBlockAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const startDate = String(formData.get('startDate') ?? '').trim();
  const raw = String(formData.get('frequency') ?? 'weekly');
  const frequency: RepeatFrequency = raw === 'biweekly' || raw === 'monthly' ? raw : 'weekly';
  const occurrences = Number(formData.get('occurrences') ?? 8);
  const reason = String(formData.get('reason') ?? '').trim();
  await createRecurringAvailabilityBlocks(supabase, accountId, { startDate, frequency, occurrences, reason });
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

export async function removeAvailabilityBlockAction(id: string) {
  const { supabase, accountId } = await requireOwnerContext();
  await deleteAvailabilityBlock(supabase, accountId, id);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

// Remove every block sharing a reason — how you undo a repeat in one go, since
// a repeat is laid down as one block per date.
export async function removeBlocksByReasonAction(reason: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const trimmed = reason.trim();
  // An empty reason is the default for quick blocks, so matching on it would
  // wipe every unlabelled day at once.
  if (!trimmed) return;
  await supabase.from('availability_blocks').delete().eq('account_id', accountId).eq('reason', trimmed);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}

// The master switch for the public booking page. Applied on its own rather than
// through the save bar: pausing is urgent, and it shouldn't need a second click.
export async function setBookingEnabledAction(enabled: boolean) {
  const { supabase, accountId } = await requireOwnerContext();
  const { error } = await supabase.from('accounts').update({ booking_enabled: enabled }).eq('id', accountId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/booking');
}
