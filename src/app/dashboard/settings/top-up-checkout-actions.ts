'use server';

import {
  executeTopUpPurchaseCheckout,
  type TopUpPurchaseCheckoutActionState,
} from '@/lib/billing/top-up-purchase-entrypoint';

/**
 * Internal dashboard mutation. The implementation checks its dark rollout
 * switch before auth or any stateful dependency; the previous state is only
 * part of React 18 useFormState's action signature.
 */
export async function beginTopUpPurchaseCheckoutAction(
  _previousState: TopUpPurchaseCheckoutActionState | null,
  formData: FormData,
): Promise<TopUpPurchaseCheckoutActionState> {
  return executeTopUpPurchaseCheckout(formData);
}
