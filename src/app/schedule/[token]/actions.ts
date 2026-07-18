'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requestDifferentScheduleOptions, selectScheduleOption } from '@/lib/scheduling';

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

export async function selectScheduleOptionAction(token: string, formData: FormData) {
  const optionIndex = Number(formData.get('optionIndex'));
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 2) throw new Error('Choose a valid schedule option.');

  await selectScheduleOption(token, optionIndex, optionalText(formData.get('notes')));
  revalidatePath(`/schedule/${token}`);
  redirect(`/schedule/${token}?submitted=1`);
}

export async function requestDifferentScheduleOptionsAction(token: string, formData: FormData) {
  await requestDifferentScheduleOptions(token, optionalText(formData.get('notes')));
  revalidatePath(`/schedule/${token}`);
  redirect(`/schedule/${token}?submitted=1`);
}
