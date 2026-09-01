'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/auth';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';
import { requestJobFollowup, type FollowupCategory } from '@/lib/client-followup-request';
import { requestDifferentClientJobScheduleOptions, selectClientJobScheduleOption } from '@/lib/scheduling';
import { resolveJobAccess } from '@/lib/change-order-client';
import { createJobFeedEvent, approveClientJobQuote } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { loadBusinessName } from '@/lib/business-name';
import { askQuoteQuestion } from '@/lib/client-question';
import { updateClientQuoteOptions } from '@/lib/quote-options-data';
import { startSubscriptionSignup, type SubscriptionSignupMode } from '@/lib/subscription-signup';
import { authorizePlanAndGetDepositUrl, startPlanPayoff } from '@/lib/payment-plans';

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = (value ?? '').toString().trim();
  return text.length > 0 ? text : null;
}

export async function requestJobFollowupAction(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const ip = clientIpFrom(await headers());
  if (!(await checkRateLimit(admin, `job-followup:ip:${ip}`, 10, 60))) {
    return { ok: false, message: 'Too many requests — wait a minute and try again.' };
  }

  const category = (formData.get('category') ?? 'followup') as FollowupCategory;
  const description = String(formData.get('description') ?? '');
  const rawPhotos = formData.getAll('photos');
  const files: File[] = [];
  for (const item of rawPhotos) {
    if (item instanceof File && item.size > 0) {
      files.push(item);
    }
  }

  const result = await requestJobFollowup(token, { category, description, files });
  if (result.ok) {
    revalidatePath(`/client/jobs/${token}`);
  }
  return result;
}

export async function submitJobFeedbackAction(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const ip = clientIpFrom(await headers());
  if (!(await checkRateLimit(admin, `job-feedback:ip:${ip}`, 10, 60))) {
    return { ok: false, message: 'Too many requests — wait a minute and try again.' };
  }

  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Please call your contractor directly.' };

  const feedback = String(formData.get('feedback') ?? '').trim().slice(0, 2000);
  if (!feedback) return { ok: false, message: 'Please enter your feedback first.' };

  const rawRating = Number(formData.get('rating'));
  const rating = Number.isInteger(rawRating) && rawRating >= 1 && rawRating <= 5 ? rawRating : null;

  const { data: job } = await admin
    .from('jobs')
    .select('ref, client_name')
    .eq('account_id', access.accountId)
    .eq('id', access.jobId)
    .maybeSingle();

  const clientName = (job?.client_name as string) || 'A customer';

  try {
    await createJobFeedEvent(admin, access.accountId, access.jobId, {
      kind: 'review_feedback',
      title: `Private feedback${rating ? ` (${rating}★)` : ''}`,
      body: feedback,
      visibility: 'internal',
    });
  } catch (error) {
    console.error('Job feedback feed event failed:', error instanceof Error ? error.message : error);
  }

  try {
    const [ownerEmail, businessName] = await Promise.all([
      getAccountOwnerEmail(admin, access.accountId),
      loadBusinessName(admin, access.accountId),
    ]);
    if (ownerEmail) {
      const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
      await sendContractorAlertEmail({
        accountId: access.accountId,
        recipientEmail: ownerEmail,
        businessName,
        subject: `New private feedback${rating ? ` (${rating}★)` : ''} for ${job?.ref ?? 'job'}`,
        heading: `${clientName} left you private feedback`,
        bodyLines: [
          `Rating: ${rating ? `${rating} of 5 stars` : 'Not rated'}`,
          feedback,
          'Sent privately from their completed job dashboard.',
        ],
        ctaLabel: 'Open the job',
        ctaUrl: `${APP_ORIGIN}/dashboard/jobs/${access.jobId}`,
        tone: rating && rating >= 4 ? 'info' : 'warning',
      });
    }
  } catch (error) {
    console.error('Job feedback email alert failed:', error instanceof Error ? error.message : error);
  }

  revalidatePath(`/client/jobs/${token}`);
  return { ok: true };
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