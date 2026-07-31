'use client';

import { useFormStatus } from 'react-dom';

// The bar is the button. Creating the Stripe onboarding link is a round trip to
// Stripe, so it needs a pending state — without one the owner clicks, nothing
// visibly happens for a second, and they click again.
function BannerButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="stripe-alert-banner" disabled={pending} aria-busy={pending}>
      <span className="stripe-alert-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.6" y="5" width="18.8" height="14" rx="2.6" />
          <path d="M2.6 9.8h18.8M6.4 14.6h4.2" />
        </svg>
      </span>
      {/* Says which direction the money goes. Stripe here is for taking money
          FROM homeowners; it has nothing to do with paying crew, and the old
          wording ("payouts") was read as though it did. */}
      <span className="stripe-alert-copy">
        <strong>{pending ? 'Opening Stripe…' : 'Customer payments are not connected'}</strong>
        <span>
          {pending
            ? 'Taking you to Stripe to finish setting up payments.'
            : 'Connect Stripe to accept homeowner deposits and invoice payments.'}
        </span>
      </span>
      <svg className="stripe-alert-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </button>
  );
}

export default function StripeAlertBanner({ connectAction }: { connectAction: () => Promise<void> }) {
  return (
    <form action={connectAction} className="stripe-alert-wrap">
      <BannerButton />
    </form>
  );
}
