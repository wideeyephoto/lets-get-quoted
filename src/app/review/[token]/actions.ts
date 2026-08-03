'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { recordReviewRating, submitPrivateFeedback } from '@/lib/reviews';

/**
 * Record the rating and send everyone to the same screen. This action used to
 * branch — 4-5★ to Google, 1-3★ to a private form — which is review gating.
 * It no longer knows what the rating means.
 */
export async function rateReviewAction(token: string, rating: number) {
  await recordReviewRating(createAdminClient(), token, rating);
  redirect(`/review/${token}`);
}

export async function submitFeedbackAction(token: string, formData: FormData) {
  const feedback = String(formData.get('feedback') ?? '').trim();
  if (!feedback) redirect(`/review/${token}?step=feedback`);
  await submitPrivateFeedback(createAdminClient(), token, feedback);
  redirect(`/review/${token}?done=1`);
}
