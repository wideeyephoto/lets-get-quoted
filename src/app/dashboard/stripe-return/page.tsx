import { redirect } from 'next/navigation';
import { refreshStripeStatusAction } from '../stripe-actions';

// Landing point after the Stripe-hosted onboarding flow (both success and
// refresh URLs point here). Refreshes the connected account's capability
// status, then sends the owner back to the dashboard.
export default async function StripeReturnPage() {
  await refreshStripeStatusAction();
  redirect('/dashboard');
}
