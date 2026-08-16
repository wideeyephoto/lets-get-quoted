'use server';

import { redirect } from 'next/navigation';

import {
  buildMerchantOnboardingFeedbackPath,
  executeMerchantOnboardingStart,
} from '@/lib/billing/merchant-onboarding-entrypoint';

/**
 * No form fields are accepted. The execution boundary resolves the owner and
 * workspace from the authenticated session before it reads or creates any
 * Stripe Merchant resource.
 */
export async function startStripeMerchantOnboardingAction(): Promise<void> {
  const result = await executeMerchantOnboardingStart();
  if (result.ok) redirect(result.onboardingUrl);
  redirect(buildMerchantOnboardingFeedbackPath(result.code));
}
