import { redirect } from 'next/navigation';

import {
  buildMerchantOnboardingFeedbackPath,
  executeMerchantOnboardingReturn,
} from '@/lib/billing/merchant-onboarding-entrypoint';

export const dynamic = 'force-dynamic';

// Stripe sends no state on this return URL. The entrypoint re-authenticates the
// owner and retrieves only the Merchant account already mapped to that owner’s
// workspace before persisting fresh readiness evidence.
export default async function StripeMerchantReturnPage() {
  const result = await executeMerchantOnboardingReturn();
  redirect(buildMerchantOnboardingFeedbackPath(result.code));
}
