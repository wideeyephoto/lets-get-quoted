import { createAdminClient } from '@/lib/auth';
import { computeInvoiceTotals, getPublicInvoice } from '@/lib/invoices';
import { invoicePayState, type InvoicePayment } from '@/lib/invoice-pay';
import { loadContractorBrand } from '@/lib/contractor-brand';
import { ContractorBrandBar, ContractorBrandFoot } from '@/components/contractor-brand';
import { payInvoiceAction, signInvoiceAction } from './actions';

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
  const totals = computeInvoiceTotals(items, Number(invoice.discount_percent) || 0, Number(invoice.tax_rate) || 0);
  const hasBreakdown = totals.discountAmount > 0 || totals.taxAmount > 0;
  const isSigned = Boolean(invoice.signed_at);
  const isVoid = invoice.status === 'void';
  const boundSignInvoice = signInvoiceAction.bind(null, invoice.id);

  const admin = createAdminClient();
  const brand = await loadContractorBrand(admin, invoice.account_id);
  const businessName = brand.businessName;

  // What is actually left to pay, and whether there is already a request open
  // for it. Scoped to THIS invoice — a job routinely carries a deposit and a
  // final bill, and counting every payment on the job would show this one as
  // settled by money that was never against it.
  const { data: paymentRows } = await admin
    .from('payments')
    .select('id, amount, status, invoice_id, refunded_amount')
    .eq('account_id', invoice.account_id)
    .eq('invoice_id', invoice.id);
  const pay = invoicePayState(invoice, totals.total, (paymentRows ?? []) as InvoicePayment[]);
  const boundPayInvoice = payInvoiceAction.bind(null, invoice.id);

  return (
    <>
      <ContractorBrandBar brand={brand} context={`Invoice ${invoice.ref}`} />
      <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero">
        <div className="workspace-hero-copy">
          {/* No business-name eyebrow. The brand bar 150px above says it, and
              said it again here the hero read "BROKEPIPES / Invoice INV-1008"
              directly under "BrokePipes / Invoice INV-1008". */}
          <h1 className="workspace-title">Invoice {invoice.ref}</h1>
          <p className="workspace-lead">
            {invoice.job ? `Job ${invoice.job.ref} for ${invoice.job.client_name}` : 'Invoice for services rendered.'}
          </p>

          <div className="payment-amount-block">
            {/* The figure that matters is what is LEFT, not what the invoice was
                raised for. A customer who part-paid a deposit and reads "Total
                due $4,200" on the page with the Pay button is being asked for
                money they already sent. */}
            <span className="payment-amount-label">{pay.paid > 0 ? 'Still due' : 'Total due'}</span>
            <strong className="payment-amount">
              {formatMoney(pay.state === 'settled' ? 0 : pay.due || totals.total)}
            </strong>
            {pay.paid > 0 ? (
              <span className="payment-amount-sub">
                {formatMoney(pay.paid)} of {formatMoney(totals.total)} already paid
              </span>
            ) : null}
          </div>

          {pay.state === 'payable' ? (
            <form action={boundPayInvoice} className="actions workspace-actions">
              <button type="submit" className="btn primary">Pay {formatMoney(pay.due)}</button>
            </form>
          ) : pay.state === 'processing' ? (
            <div className="payment-banner">
              <p>
                A payment for this invoice is processing. Bank transfers take a few business days to clear — you&apos;ll
                be confirmed once it settles.
              </p>
            </div>
          ) : pay.state === 'settled' ? (
            <div className="payment-banner success">
              <p>This invoice is paid in full. Thank you!</p>
            </div>
          ) : pay.reason === 'void' ? (
            <div className="payment-banner muted">
              <p>This invoice has been voided and can no longer be paid.</p>
            </div>
          ) : null}
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

        <div className="invoice-summary">
          {hasBreakdown ? (
            <>
              <div className="invoice-summary-row"><span>Subtotal</span><span>{formatMoney(totals.subtotal)}</span></div>
              {totals.discountAmount > 0 ? (
                <div className="invoice-summary-row"><span>Discount ({totals.discountPercent}%)</span><span>-{formatMoney(totals.discountAmount)}</span></div>
              ) : null}
              {totals.taxAmount > 0 ? (
                <div className="invoice-summary-row"><span>Tax ({totals.taxRate}%)</span><span>{formatMoney(totals.taxAmount)}</span></div>
              ) : null}
            </>
          ) : null}
          <div className="invoice-summary-row invoice-summary-total"><span>Total</span><span>{formatMoney(totals.total)}</span></div>
        </div>

        <p className="job-meta" style={{ marginTop: '0.9rem' }}>
          <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">Download PDF</a>
        </p>
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
      <ContractorBrandFoot businessName={businessName} />
      </main>
    </>
  );
}
