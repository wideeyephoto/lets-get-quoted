'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requestDifferentClientJobScheduleOptions, selectClientJobScheduleOption } from '@/lib/scheduling';
import { approveClientJobQuote } from '@/lib/job-feed';
import { startSubscriptionSignup, type SubscriptionSignupMode } from '@/lib/subscription-signup';

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

export async function startSubscriptionAction(token: string, formData: FormData) {
  const itemId = (formData.get('itemId') ?? '').toString();
  if (!itemId) throw new Error('Missing plan.');
  const mode: SubscriptionSignupMode = formData.get('mode') === 'prepay' ? 'prepay' : 'cycle';
  const { redirectUrl } = await startSubscriptionSignup(token, itemId, mode);
  revalidatePath(`/client/jobs/${token}`);
  redirect(redirectUrl);
}

export async function approveClientJobQuoteAction(token: string, formData: FormData) {
  // Checkbox values for accepted optional add-ons (name="addon"); empty on a
  // legacy single-amount quote, which approves exactly as before.
  const selectedAddonIds = formData.getAll('addon').map((value) => value.toString());
  await approveClientJobQuote(token, selectedAddonIds);
  revalidatePath(`/client/jobs/${token}`);
  redirect(`/client/jobs/${token}?approved=1`);
}