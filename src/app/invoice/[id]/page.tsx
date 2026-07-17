import { getPublicInvoice } from '@/lib/invoices';
import { signInvoiceAction } from './actions';

// Always render fresh — this page's content changes once the client signs,
// so it must never be statically cached (same reasoning as /pay/[id]).
export const dynamic = 'force-dynamic';

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

export default async function PublicInvoicePage({ params }: { params: { id: string } }) {
  const record = await getPublicInvoice(params.id);

  if (!record) {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Invoice</p>
            <h1 className="workspace-title">Invoice not found</h1>
            <p className="workspace-lead">This invoice link is invalid or has been removed.</p>
          </div>
        </section>
      </main>
    );
  }

  const { invoice, items } = record;
  const businessName = invoice.account?.business_name || 'Your contractor';
  const isSigned = Boolean(invoice.signed_at);
  const isVoid = invoice.status === 'void';
  const boundSignInvoice = signInvoiceAction.bind(null, invoice.id);

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{businessName}</p>
          <h1 className="workspace-title">Invoice {invoice.ref}</h1>
          <p className="workspace-lead">
            {invoice.job ? `Job ${invoice.job.ref} for ${invoice.job.client_name}` : 'Invoice for services rendered.'}
          </p>

          <div className="payment-amount-block">
            <span className="payment-amount-label">Total due</span>
            <strong className="payment-amount">{formatMoney(invoice.total)}</strong>
          </div>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Details</p>
          <h2>Line items</h2>
        </div>
        {items.length === 0 ? (
          <p className="empty-state">No line items on this invoice yet.</p>
        ) : (
          <div className="cost-list">
            {items.map((item) => (
              <div key={item.id} className="cost-item">
                <div className="cost-item-main">
                  <span className="cost-item-desc">{item.description}</span>
                </div>
                <span className="cost-item-amount">{formatMoney(item.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Sign-off</p>
          <h2>{isSigned ? 'Signed' : isVoid ? 'Voided' : 'Accept this invoice'}</h2>
        </div>
        {isSigned ? (
          <div className="payment-banner success">
            <p>
              Signed by <strong>{invoice.signer_name}</strong> on{' '}
              {new Date(invoice.signed_at as string).toLocaleString()}.
            </p>
          </div>
        ) : isVoid ? (
          <div className="payment-banner muted">
            <p>This invoice has been voided and can no longer be signed.</p>
          </div>
        ) : (
          <form action={boundSignInvoice} className="form-grid">
            <div className="field full">
              <label htmlFor="signerName">Full legal name</label>
              <input id="signerName" name="signerName" required placeholder="Jane Homeowner" />
            </div>
            <div className="field full">
              <label className="sms-consent-check" htmlFor="agree">
                <input id="agree" name="agree" type="checkbox" required />
                <span>
                  Typing my name above and checking this box constitutes my electronic signature, confirming I
                  accept the work and charges described in this invoice.
                </span>
              </label>
            </div>
            <div className="field full">
              <button type="submit" className="btn primary">
                Sign &amp; accept invoice
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
