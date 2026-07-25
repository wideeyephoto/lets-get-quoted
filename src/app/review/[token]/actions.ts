'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { recordReviewRating, submitPrivateFeedback } from '@/lib/reviews';

export async function rateReviewAction(token: string, rating: number) {
  const admin = createAdminClient();
  const { routeToGoogle, googleUrl } = await recordReviewRating(admin, token, rating);

  // 4-5★ → straight to the public Google review page (if configured).
  if (routeToGoogle && googleUrl) redirect(googleUrl);
  if (routeToGoogle) redirect(`/review/${token}?done=1`);
  // 1-3★ → capture private feedback for the owner instead.
  redirect(`/review/${token}?step=feedback`);
}

export async function submitFeedbackAction(token: string, formData: FormData) {
  const feedback = String(formData.get('feedback') ?? '').trim();
  if (!feedback) redirect(`/review/${token}?step=feedback`);
  await submitPrivateFeedback(createAdminClient(), token, feedback);
  redirect(`/review/${token}?done=1`);
}
