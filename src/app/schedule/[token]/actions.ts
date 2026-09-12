'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requestDifferentScheduleOptions, selectScheduleOption } from '@/lib/scheduling';

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

export async function selectScheduleOptionAction(token: string, formData: FormData) {
  // The field is read before it is coerced, because Number(null) and Number('')
  // are both 0 — an absent optionIndex would otherwise book the first slot and
  // report it to the contractor as a choice the customer made. The page posts a
  // hidden input, but a server action is reachable by anyone holding the link,
  // so what the page posts is not the check.
  const rawOptionIndex = optionalText(formData.get('optionIndex'));
  const optionIndex = Number(rawOptionIndex);
  if (rawOptionIndex === null || !Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 2) {
    throw new Error('Choose a valid schedule option.');
  }

  await selectScheduleOption(token, optionIndex, optionalText(formData.get('notes')));
  revalidatePath(`/schedule/${token}`);
  redirect(`/schedule/${token}?submitted=1`);
}

export async function requestDifferentScheduleOptionsAction(token: string, formData: FormData) {
  await requestDifferentScheduleOptions(token, optionalText(formData.get('notes')));
  revalidatePath(`/schedule/${token}`);
  redirect(`/schedule/${token}?submitted=1`);
}
