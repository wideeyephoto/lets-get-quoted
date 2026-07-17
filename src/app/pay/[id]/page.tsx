import { getPublicPayment, getQuotedFee, type PaymentStatus } from '@/lib/payments';
import { startCheckoutAction } from './actions';

// Always render fresh from the database — this page's content changes based
// on live payment status (requested -> processing -> paid), so it must never
// be statically cached or it could show a stale "Pay" button after payment.
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  deposit: 'Deposit',
  stage: 'Stage payment',
  final: 'Final payment',
  plan_installment: 'Installment',
};

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

export default async function PublicPaymentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string };
}) {
  if (params.id === 'example') {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Let&apos;s Get Quoted contractor</p>
            <h1 className="workspace-title">Sample payment link</h1>
            <p className="workspace-lead">This non-payable preview shows the secure page homeowners open from a transactional payment text.</p>
            <div className="payment-amount-block"><span className="payment-amount-label">Requested payment</span><strong className="payment-amount">$2,500</strong></div>
            <div className="payment-banner muted"><p>Campaign review example only. No payment can be submitted from this page.</p></div>
            <div className="actions workspace-actions">
              <button type="button" className="btn primary" disabled aria-disabled="true" title="Disabled for this review preview" style={{ opacity: 0.5, cursor: 'not-allowed' }}>Pay $2,500</button>
              <a className="btn secondary" href="/privacy">Privacy Policy</a>
              <a className="btn secondary" href="/sms-terms">SMS Terms</a>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const payment = await getPublicPayment(params.id);

  if (!payment) {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Payment</p>
            <h1 className="workspace-title">Payment link not found</h1>
            <p className="workspace-lead">This payment link is invalid or has been removed.</p>
          </div>
        </section>
      </main>
    );
  }

  const statusMessage: Record<PaymentStatus, string> = {
    requested: '',
    processing: '',
    paid: 'This payment has already been completed. Thank you!',
    failed: 'The last payment attempt failed. You can try again below.',
    refunded: 'This payment has been refunded.',
  };

  const alreadyPaid = payment.status === 'paid';
  const cancelledJustNow = searchParams.status === 'cancelled';
  const canPay =
    (payment.status === 'requested' || payment.status === 'failed' || payment.status === 'processing') &&
    !alreadyPaid;

  // Once checkout has started, fee_rate/platform_fee are locked in on the row
  // (the actual rate used for that Stripe session) — use those. Otherwise,
  // quote the CURRENT rate live so the fee is visible before checkout ever
  // starts, closing the "fee only shown after checkout" trust gap.
  const feeIsLocked = payment.fee_rate != null;
  const quotedFee = canPay && !feeIsLocked ? await getQuotedFee(payment.account_id, payment.amount) : null;
  const displayFeeRate = payment.fee_rate ?? quotedFee?.feeRate ?? null;
  const displayFeeAmount = payment.platform_fee ?? quotedFee?.platformFee ?? null;

  const statusTone =
    payment.status === 'paid'
      ? 'payment-banner success'
      : payment.status === 'failed' || cancelledJustNow
        ? 'payment-banner warning'
        : payment.status === 'refunded'
          ? 'payment-banner muted'
          : 'payment-banner';

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{payment.account?.business_name || 'Payment request'}</p>
          <h1 className="workspace-title">{KIND_LABEL[payment.kind] || 'Payment'}</h1>
          <p className="workspace-lead">
            {payment.job
              ? `Job ${payment.job.ref} for ${payment.job.client_name}`
              : 'Secure online payment for this contractor request.'}
          </p>

          <div className="payment-amount-block">
            <span className="payment-amount-label">Amount due</span>
            <strong className="payment-amount">{formatMoney(payment.amount)}</strong>
          </div>

          {canPay && displayFeeRate != null ? (
            <div className="payment-fee-info">
              <p className="payment-fee-label">
                {feeIsLocked ? 'Processing fee:' : 'Estimated processing fee:'}{' '}
                <strong>
                  {displayFeeAmount != null ? formatMoney(displayFeeAmount) : `${displayFeeRate * 100}%`}
                </strong>
              </p>
              <p className="payment-fee-note" style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.25rem' }}>
                This fee is included in the amount above and paid to Let&apos;s Get Quoted for payment processing.
              </p>
            </div>
          ) : null}

          {statusMessage[payment.status] || cancelledJustNow ? (
            <div className={statusTone}>
              {statusMessage[payment.status] ? <p>{statusMessage[payment.status]}</p> : null}
              {cancelledJustNow ? <p>Checkout was cancelled. You have not been charged.</p> : null}
            </div>
          ) : null}

          {canPay ? (
            !payment.account?.connect_onboarded ? (
              <div className="payment-banner muted">
                <p>This contractor hasn&apos;t finished setting up payments yet. Please check back soon.</p>
              </div>
            ) : (
              <form action={startCheckoutAction.bind(null, payment.id)} className="actions workspace-actions">
                <button type="submit" className="btn primary">
                  Pay {formatMoney(payment.amount)}
                </button>
              </form>
            )
          ) : null}
        </div>

        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Payment status</span>
            <strong className="workspace-metric-value">{payment.status}</strong>
            <p className="workspace-metric-note">Live status rendered fresh from the database.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Payment type</span>
            <strong className="workspace-metric-value">{KIND_LABEL[payment.kind] || 'Payment'}</strong>
            <p className="workspace-metric-note">This request is tied to the contractor workflow.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Requested by</span>
            <strong className="workspace-metric-value payment-metric-name">
              {payment.account?.business_name || 'Let\'s Get Quoted contractor'}
            </strong>
            <p className="workspace-metric-note">Payments route through Stripe checkout for secure processing.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
