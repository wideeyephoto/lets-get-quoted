'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';

function parseScheduleDayHours(value: FormDataEntryValue | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.min(24, Math.max(1, n));
}

export async function updateScheduleDayHoursAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const scheduleDayHours = parseScheduleDayHours(formData.get('scheduleDayHours'));

  const { error } = await supabase
    .from('accounts')
    .update({ schedule_day_hours: scheduleDayHours })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/schedule');
}
