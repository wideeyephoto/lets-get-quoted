'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

function ConnectStripeSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn secondary" disabled={pending} aria-busy={pending}>
      {pending ? 'Connecting…' : 'Connect Stripe'}
    </button>
  );
}

const STRIPE_ICON = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#635bff" aria-hidden="true">
    <path d="M13.6 9.1c-1.4-.5-2.2-.9-2.2-1.5 0-.5.5-.8 1.3-.8 1.5 0 3.1.6 4.2 1.1l.6-3.8C16.7 3.3 15 2.8 13 2.8c-1.7 0-3.1.4-4.1 1.3-1 .8-1.6 2-1.6 3.4 0 2.6 1.6 3.7 4.1 4.6 1.6.6 2.2 1 2.2 1.6 0 .6-.5.9-1.4.9-1.2 0-3.1-.6-4.5-1.4l-.6 3.8c1.2.7 3 1.2 4.9 1.2 1.8 0 3.3-.4 4.3-1.3 1.1-.9 1.7-2.2 1.7-3.7 0-2.6-1.6-3.7-4.5-4.8z" />
  </svg>
);

type Props = {
  stripeOnboarded: boolean;
  payoutsPaused?: boolean;
  connectStripeAction: () => Promise<void>;
  disconnectStripeAction: () => Promise<void>;
  pendingPaymentsCount: number;
};

// The Stripe payout account — split out of SignInMethods so it can live under
// the Payments tab (where owners look for it) instead of alongside sign-in.
export default function PayoutAccount({ stripeOnboarded, payoutsPaused = false, connectStripeAction, disconnectStripeAction, pendingPaymentsCount }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [disconnectingStripe, setDisconnectingStripe] = useState(false);

  async function handleDisconnectStripe() {
    const pendingWarning =
      pendingPaymentsCount > 0
        ? ` You have ${pendingPaymentsCount} pending payment${pendingPaymentsCount === 1 ? '' : 's'} awaiting completion — disconnecting won't cancel ${pendingPaymentsCount === 1 ? 'it' : 'them'}, but the homeowner won't be able to pay until you reconnect.`
        : '';
    if (
      !window.confirm(
        `Disconnect Stripe? Homeowners won't be able to pay you until you reconnect, and any in-progress payment links will stop working.${pendingWarning}`
      )
    ) {
      return;
    }
    setMessage(null);
    setDisconnectingStripe(true);
    try {
      await disconnectStripeAction();
      setMessage({ type: 'success', text: 'Stripe disconnected.' });
      router.refresh();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to disconnect Stripe.' });
    } finally {
      setDisconnectingStripe(false);
    }
  }

  return (
    <div className="settings-sections">
      <div className="settings-section">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Payments</p>
          <h2>Payout account</h2>
        </div>
        <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
          Connect Stripe so homeowners can pay you online — invoices, deposits, and secure pay links all
          run through it, and payouts land in your bank account.
        </p>
        <div className="sign-in-methods-list">
          <div className="sign-in-method-row">
            <div className="method-info">
              <span className="method-icon method-icon-stripe">{STRIPE_ICON}</span>
              <div>
                <span className="method-name">Stripe</span>
                <span className="method-detail">{payoutsPaused ? 'Payouts paused — action needed' : stripeOnboarded ? 'Payouts active' : 'Not connected'}</span>
              </div>
            </div>
            <div className="actions">
              {payoutsPaused ? (
                <span className="sign-in-method-badge" style={{ color: 'var(--ink-orange-8)', borderColor: 'rgba(255,122,33,.45)' }}>Paused</span>
              ) : stripeOnboarded ? (
                <span className="sign-in-method-badge linked">Connected</span>
              ) : null}
              {stripeOnboarded || payoutsPaused ? (
                <>
                  <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="btn secondary">Manage on Stripe</a>
                  <button type="button" className="btn danger" disabled={disconnectingStripe} onClick={handleDisconnectStripe}>
                    {disconnectingStripe ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </>
              ) : (
                <form action={connectStripeAction}>
                  <ConnectStripeSubmitButton />
                </form>
              )}
            </div>
          </div>
          {payoutsPaused ? (
            <p className="workspace-card-copy" style={{ color: 'var(--gold-ink)', marginTop: '-0.4rem' }} role="alert">
              ⚠️ Stripe paused your payouts — homeowners can&apos;t pay you until it&apos;s resolved. Open <strong>Manage on Stripe</strong>, finish any verification Stripe is asking for, and payouts reactivate automatically.
            </p>
          ) : null}
          {stripeOnboarded && !payoutsPaused && pendingPaymentsCount > 0 ? (
            <p className="workspace-card-copy" style={{ color: 'var(--gold-ink)', marginTop: '-0.4rem' }} role="status">
              ⚠️ {pendingPaymentsCount} pending payment{pendingPaymentsCount === 1 ? '' : 's'} awaiting completion. Disconnecting won&apos;t cancel {pendingPaymentsCount === 1 ? 'it' : 'them'}, but homeowners won&apos;t be able to pay until you reconnect.
            </p>
          ) : null}
        </div>
      </div>

      {/* --gold-ink, not the #ffd166 literal — see the note in SignInMethods. */}
      {message ? (
        <p className="workspace-card-copy" style={{ color: message.type === 'error' ? 'var(--gold-ink)' : undefined, marginTop: '1rem' }} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
