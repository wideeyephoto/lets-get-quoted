'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requestDifferentClientJobScheduleOptions, selectClientJobScheduleOption } from '@/lib/scheduling';

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

export async function selectClientJobScheduleOptionAction(token: string, formData: FormData) {
  const optionIndex = Number(formData.get('optionIndex'));
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 2) throw new Error('Choose a valid schedule option.');

  await selectClientJobScheduleOption(token, optionIndex, optionalText(formData.get('notes')));
  revalidatePath(`/client/jobs/${token}`);
  redirect(`/client/jobs/${token}?scheduled=1`);
}

export async function requestDifferentClientJobScheduleOptionsAction(token: string, formData: FormData) {
  await requestDifferentClientJobScheduleOptions(token, optionalText(formData.get('notes')));
  revalidatePath(`/client/jobs/${token}`);
  redirect(`/client/jobs/${token}?schedule-requested=1`);
}