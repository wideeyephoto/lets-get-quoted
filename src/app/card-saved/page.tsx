export const dynamic = 'force-dynamic';

// Public landing after a client finishes (or cancels) the hosted card-setup
// flow for a recurring plan. No session, no charge — a plain confirmation.
export default function CardSavedPage({ searchParams }: { searchParams: { status?: string } }) {
  const cancelled = searchParams.status === 'cancelled';

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          {cancelled ? (
            <>
              <p className="eyebrow">Automatic billing</p>
              <h1 className="workspace-title">Card setup cancelled</h1>
              <p className="workspace-lead">
                No card was saved and nothing was charged. If you meant to set up automatic billing, just open the
                link your contractor sent you again.
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">Automatic billing</p>
              <h1 className="workspace-title">You&apos;re all set ✓</h1>
              <p className="workspace-lead">
                Your card is saved securely with Stripe. Each scheduled visit will be billed automatically — you&apos;ll
                get a receipt every time. You can ask your contractor to stop automatic billing at any point.
              </p>
            </>
          )}
          <div className="actions workspace-actions">
            <a className="btn secondary" href="/privacy">Privacy Policy</a>
            <a className="btn secondary" href="/sms-terms">SMS Terms</a>
          </div>
        </div>
      </section>
    </main>
  );
}
