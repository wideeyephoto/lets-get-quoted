'use server';

import {
  executeBasePlanSubscriptionCheckout,
  type BasePlanSubscriptionCheckoutActionState,
} from '@/lib/billing/base-plan-subscription-entrypoint';

/**
 * Internal dashboard mutation. The implementation checks its dark rollout
 * switch before auth or any stateful dependency; the previous state is only
 * part of React 18 useFormState's action signature.
 */
export async function beginBasePlanSubscriptionCheckoutAction(
  _previousState: BasePlanSubscriptionCheckoutActionState | null,
  formData: FormData,
): Promise<BasePlanSubscriptionCheckoutActionState> {
  return executeBasePlanSubscriptionCheckout(formData);
}
