import { redirect } from 'next/navigation';

import {
  buildMerchantOnboardingFeedbackPath,
  executeMerchantOnboardingStart,
} from '@/lib/billing/merchant-onboarding-entrypoint';

export const dynamic = 'force-dynamic';

// Account Links are single-use and short-lived. Stripe directs an expired or
// previously visited link here so an authenticated owner can receive a newly
// generated link for the exact same server-mapped Merchant account.
export default async function StripeMerchantRefreshPage() {
  const result = await executeMerchantOnboardingStart();
  if (result.ok) redirect(result.onboardingUrl);
  redirect(buildMerchantOnboardingFeedbackPath(result.code));
}
