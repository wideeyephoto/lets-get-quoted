'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requestDifferentClientJobScheduleOptions, selectClientJobScheduleOption } from '@/lib/scheduling';
import { approveClientJobQuote } from '@/lib/job-feed';
import { askQuoteQuestion } from '@/lib/client-question';
import { updateClientQuoteOptions } from '@/lib/quote-options-data';
import { startSubscriptionSignup, type SubscriptionSignupMode } from '@/lib/subscription-signup';
import { authorizePlanAndGetDepositUrl, startPlanPayoff } from '@/lib/payment-plans';

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
  // The client picks when the plan starts. It used to begin the day they
  // clicked, which silently anchored every future visit to that date.
  const startDate = (formData.get('startDate') ?? '').toString().trim();
  const { redirectUrl } = await startSubscriptionSignup(token, itemId, mode, startDate);
  revalidatePath(`/client/jobs/${token}`);
  redirect(redirectUrl);
}

export async function authorizePaymentPlanAction(token: string, formData: FormData) {
  const planId = (formData.get('planId') ?? '').toString();
  if (!planId) throw new Error('Missing plan.');
  const signerName = (formData.get('signerName') ?? '').toString().trim();
  if (!signerName) throw new Error('Type your full name to authorize the plan.');
  const { redirectUrl } = await authorizePlanAndGetDepositUrl(token, planId, signerName);
  revalidatePath(`/client/jobs/${token}`);
  redirect(redirectUrl);
}

export async function payPlanBalanceAction(token: string, formData: FormData) {
  const planId = (formData.get('planId') ?? '').toString();
  if (!planId) throw new Error('Missing plan.');
  const { redirectUrl } = await startPlanPayoff(token, planId);
  revalidatePath(`/client/jobs/${token}`);
  redirect(redirectUrl);
}

export async function approveClientJobQuoteAction(token: string, formData: FormData) {
  // Checkbox values for accepted optional add-ons (name="addon"); empty on a
  // legacy single-amount quote, which approves exactly as before.
  const selectedAddonIds = formData.getAll('addon').map((value) => value.toString());
  // Their name, typed against the QUOTE — not against a card authorization.
  const signerName = optionalText(formData.get('signerName'));
  // The mark, when they signed with a finger rather than only typing. Passed
  // through raw: what may be stored is decided by safeSignaturePath, in one
  // place, rather than by whichever endpoint happened to receive it.
  const path = optionalText(formData.get('signaturePath'));
  await approveClientJobQuote(token, selectedAddonIds, signerName, path ? { path } : null);
  revalidatePath(`/client/jobs/${token}`);
  redirect(`/client/jobs/${token}?approved=1`);
}

/**
 * Changing your mind about the extras, after you already said yes.
 *
 * The window, the floor and which ids may move are all re-derived inside
 * updateClientQuoteOptions from what the database says. Nothing about what this
 * page chose to render reaches it: a server action is a public endpoint
 * reachable by anybody holding the link, so "the form was hidden" is not a
 * check. See lib/quote-options.
 */
export async function updateQuoteOptionsAction(token: string, formData: FormData) {
  const addonIds = formData.getAll('addon').map((value) => value.toString());
  const result = await updateClientQuoteOptions(token, addonIds);
  revalidatePath(`/client/jobs/${token}`);
  redirect(`/client/jobs/${token}?${result.ok ? 'options-updated=1' : 'options-failed=1'}`);
}

// The other thing a person can want to do with a quote. See lib/client-question.
export async function askQuoteQuestionAction(token: string, formData: FormData) {
  const result = await askQuoteQuestion(token, (formData.get('question') ?? '').toString());
  revalidatePath(`/client/jobs/${token}`);
  redirect(`/client/jobs/${token}?${result.ok ? 'asked=1' : 'ask-failed=1'}`);
}