import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { getInvoiceWithItems, formatMoney, type InvoiceStatus } from '@/lib/invoices';
import {
  addInvoiceItemAction,
  deleteInvoiceAction,
  deleteInvoiceItemAction,
  updateInvoiceStatusAction,
} from '../../../invoices-actions';
import DeleteInvoiceButton from './DeleteInvoiceButton';

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  paid: 'Paid',
  void: 'Void',
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string; invoiceId: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const result = await getInvoiceWithItems(supabase, accountId, params.invoiceId);

  if (!result) {
    return (
      <main className="wide-shell">
        <div className="panel">
          <p className="empty-state">Invoice not found.</p>
          <Link href={`/dashboard/jobs/${params.id}?tab=invoices`} className="btn secondary">
            Back to invoices
          </Link>
        </div>
      </main>
    );
  }

  const { invoice, items } = result;

  const boundAddItem = addInvoiceItemAction.bind(null, params.id, invoice.id);
  const boundDeleteInvoice = deleteInvoiceAction.bind(null, params.id, invoice.id);
  const boundUpdateStatus = updateInvoiceStatusAction.bind(null, params.id, invoice.id);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="job-ref">{invoice.ref}</p>
          <h1 className="workspace-title">{formatMoney(invoice.total)}</h1>
          <div className="workspace-inline-row">
            <span className={`status-badge status-${invoice.status === 'paid' ? 'complete' : invoice.status === 'void' ? 'archived' : 'in_progress'}`}>
              {INVOICE_STATUS_LABEL[invoice.status]}
            </span>
            <span className="workspace-inline-note">{items.length} line item{items.length === 1 ? '' : 's'}</span>
          </div>
          <div className="actions workspace-actions">
            <Link href={`/dashboard/jobs/${params.id}?tab=invoices`} className="btn secondary">
              Back to invoices
            </Link>
          </div>
        </div>

        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Invoice total</span>
            <strong className="workspace-metric-value">{formatMoney(invoice.total)}</strong>
            <p className="workspace-metric-note">Server-recomputed from invoice line items.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Created</span>
            <strong className="workspace-metric-value">{new Date(invoice.created_at).toLocaleDateString()}</strong>
            <p className="workspace-metric-note">Current record creation date.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Status</span>
            <strong className="workspace-metric-value">{INVOICE_STATUS_LABEL[invoice.status]}</strong>
            <p className="workspace-metric-note">Update this as the invoice moves through the job cycle.</p>
          </article>
        </div>
      </section>

      <section className="detail-grid workspace-grid-gap">
          <div>
            <div className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Line items</p>
                <h2>Invoice breakdown</h2>
              </div>

            <form action={boundAddItem} className="cost-form">
              <div className="cost-form-row">
                <div className="field" style={{ flex: 2 }}>
                  <label htmlFor="description">Description</label>
                  <input id="description" name="description" required placeholder="Tear-off & disposal (28 sq)" />
                </div>
                <div className="field">
                  <label htmlFor="amount">Amount ($)</label>
                  <input id="amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="3200" />
                </div>
              </div>
              <div style={{ marginTop: '0.8rem' }}>
                <button type="submit" className="btn primary">
                  + Add line
                </button>
              </div>
            </form>

            {items.length === 0 ? (
              <p className="empty-state">No line items yet.</p>
            ) : (
              <div className="cost-list">
                {items.map((item) => (
                  <div key={item.id} className="cost-item">
                    <div className="cost-item-main">
                      <span className="cost-item-desc">{item.description}</span>
                    </div>
                    <div className="cost-item-actions">
                      <span className="cost-item-amount">{formatMoney(item.amount)}</span>
                      <form action={deleteInvoiceItemAction.bind(null, params.id, invoice.id, item.id)}>
                        <button type="submit" className="icon-btn">
                          ✕
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>

          <div>
            <div className="panel workspace-section-card sticky-card">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Status</p>
                <h2>Invoice controls</h2>
              </div>
            <form action={boundUpdateStatus} className="cost-form">
              <div className="field">
                <label htmlFor="status">Invoice status</label>
                <select id="status" name="status" defaultValue={invoice.status}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="signed">Signed</option>
                  <option value="paid">Paid</option>
                  <option value="void">Void</option>
                </select>
              </div>
              <div style={{ marginTop: '0.8rem' }}>
                <button type="submit" className="btn primary">
                  Update status
                </button>
              </div>
            </form>

            <div className="workspace-danger-zone">
              <p className="eyebrow danger-eyebrow">
                Danger zone
              </p>
              <p className="job-meta workspace-danger-copy">
                Deleting an invoice permanently removes it and all of its line items.
              </p>
              <DeleteInvoiceButton action={boundDeleteInvoice} />
            </div>
            </div>
          </div>
      </section>
    </main>
  );
}
