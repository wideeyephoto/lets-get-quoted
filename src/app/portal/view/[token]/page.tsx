import Link from 'next/link';
import { createAdminClient } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { resolvePortalAccess } from '@/lib/client-portal';
import { loadPortal } from '@/lib/client-portal-data';
import { ContractorBrandBar, ContractorBrandFoot } from '@/components/contractor-brand';

export const dynamic = 'force-dynamic';
// Never indexed. A live portal link in a search result is somebody's home
// improvement history in a search result.
export const metadata = { title: 'Your jobs', robots: { index: false, follow: false } };

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'Being quoted',
  in_progress: 'In progress',
  complete: 'Finished',
};

function formatDay(value: string | null): string {
  if (!value) return '';
  // Date-only strings are parsed as LOCAL, never through `new Date('Y-M-D')` —
  // that is UTC, and lands a day early for everyone west of Greenwich.
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function PortalViewPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  const access = await resolvePortalAccess(admin, params.token);
  const portal = access ? await loadPortal(admin, access.accountId, access.clientId) : null;

  if (!portal) {
    return (
      <main className="wide-shell workspace-shell payment-shell">
        <section className="workspace-hero panel payment-hero workspace-hero-solo">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Your jobs</p>
            <h1 className="workspace-title">This link has expired</h1>
            {/* Says nothing about whether it was ever valid or whose it was. */}
            <p className="workspace-lead">
              Links last 90 days. Ask your contractor for a fresh one, or request a new link from their website.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const firstName = portal.clientName.trim().split(/\s+/)[0] || 'there';
  const { brand } = portal;
  // Bills still wanting money, newest first. Separated from the rest because
  // this is the reason somebody opens a portal — a page that leads with work
  // history makes them hunt for the thing they came to settle.
  const openInvoices = portal.invoices.filter((invoice) => invoice.due > 0 && invoice.status !== 'void');
  const settledInvoices = portal.invoices.filter((invoice) => !openInvoices.includes(invoice));

  return (
    <>
      <ContractorBrandBar brand={brand} context="Your account" />
      <main className="wide-shell workspace-shell payment-shell portal-home">
        <section className="workspace-hero panel payment-hero workspace-hero-solo">
          <div className="workspace-hero-copy">
            {/* The name is in the bar above and in the lead line below; a third
                copy as an eyebrow was one too many. */}
            <h1 className="workspace-title">Hello {firstName}</h1>
            <p className="workspace-lead">
              {portal.totalJobs === 0
                ? `Nothing on file with ${portal.businessName} yet.`
                : `${portal.totalJobs} job${portal.totalJobs === 1 ? '' : 's'} with ${portal.businessName}${
                    portal.firstJobAt ? `, going back to ${formatDay(portal.firstJobAt)}` : ''
                  }.`}
            </p>

            {portal.outstanding > 0 ? (
              <div className="payment-amount-block">
                <span className="payment-amount-label">
                  Balance due{openInvoices.length > 1 ? ` · ${openInvoices.length} invoices` : ''}
                </span>
                <strong className="payment-amount">{formatMoney(portal.outstanding)}</strong>
              </div>
            ) : null}

            <div className="actions workspace-actions portal-home-actions">
              {/* An APP-ORIGIN path. The booking page is /book/[subdomain]; a
                  tenant host rewrites sub-paths to /site/[subdomain]/…, where no
                  book route exists, so `${brand.siteUrl}/book` would 404. */}
              {brand.bookingPath ? (
                <Link className="btn primary" href={brand.bookingPath}>
                  Request service
                </Link>
              ) : brand.phone ? (
                <a className="btn primary" href={`tel:${brand.phone.replace(/[^\d+]/g, '')}`}>
                  Call {portal.businessName}
                </a>
              ) : null}
              {portal.outstanding > 0 && openInvoices[0] ? (
                <Link className="btn secondary" href={`/invoice/${openInvoices[0].id}`}>
                  Pay {formatMoney(openInvoices[0].due)}
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {openInvoices.length > 0 ? (
          <section className="panel workspace-section-card client-attention-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Needs paying</p>
              <h2>Open invoices</h2>
            </div>
            <div className="cost-list">
              {openInvoices.map((invoice) => (
                <Link href={`/invoice/${invoice.id}`} className="cost-item client-attention-link" key={invoice.id}>
                  <div className="cost-item-main">
                    <span className="cost-item-desc">{invoice.jobScope || invoice.ref}</span>
                    <span className="cost-item-sub">
                      {invoice.ref}
                      {invoice.paid > 0 ? ` · ${formatMoney(invoice.paid)} of ${formatMoney(invoice.total)} paid` : ''}
                      {invoice.createdAt ? ` · ${formatDay(invoice.createdAt)}` : ''}
                    </span>
                  </div>
                  <span className="client-attention-pay-block">
                    <span className="cost-item-amount">{formatMoney(invoice.due)}</span>
                    {/* The word carries the state, not just the colour: a
                        processing bank transfer must not read as "Pay now". */}
                    <span className="client-attention-action">{invoice.processing ? 'Processing' : 'Pay now'}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {portal.warranties.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Still covered</p>
              <h2>Your warranties</h2>
            </div>
            <div className="client-warranty-list">
              {portal.warranties.map((warranty) => (
                <article key={warranty.id} className={`client-warranty status-${warranty.status}`}>
                  <div className="client-warranty-head">
                    <strong>{warranty.title}</strong>
                    <span className="client-warranty-status">{warranty.statusLabel}</span>
                  </div>
                  <p className="client-warranty-dates">
                    From {warranty.startsOn}
                    {warranty.endsOn ? ` to ${warranty.endsOn}` : ''} · {warranty.remainingLabel}
                  </p>
                  {warranty.covers ? (
                    <p className="client-warranty-covers"><strong>Covered:</strong> {warranty.covers}</p>
                  ) : null}
                  {warranty.excludes ? (
                    <p className="client-warranty-excludes"><strong>Not covered:</strong> {warranty.excludes}</p>
                  ) : null}
                  {warranty.maintenanceNotes ? (
                    <p className="client-warranty-maintenance"><strong>Looking after it:</strong> {warranty.maintenanceNotes}</p>
                  ) : null}
                  {warranty.serviceDueLabel ? <p className="client-warranty-service">{warranty.serviceDueLabel}</p> : null}
                </article>
              ))}
            </div>
            {/* Claims are raised from the job's own page, where the contractor
                already knows which work it is. Duplicating the button here would
                produce claims with no job attached. */}
            <p className="portal-note">
              Something gone wrong? Open the job below and tell {portal.businessName} — it goes straight to them.
            </p>
          </section>
        ) : null}

        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Work history</p>
            <h2>Everything we&apos;ve done</h2>
          </div>
          {portal.jobs.length === 0 ? (
            <p className="empty-state">Nothing here yet.</p>
          ) : (
            <ul className="portal-job-list portal-history">
              {portal.jobs.map((job) => (
                <li key={job.id} className={`portal-job status-${job.status}`}>
                  <div className="portal-job-main">
                    <strong>{job.scope || job.ref || 'Work'}</strong>
                    <span className="portal-job-meta">
                      {STATUS_LABEL[job.status] ?? job.status}
                      {job.completedAt ? ` · finished ${formatDay(job.completedAt)}` : job.scheduledFor ? ` · ${formatDay(job.scheduledFor)}` : ''}
                      {job.address ? ` · ${job.address}` : ''}
                    </span>
                  </div>
                  {job.quotedAmount > 0 ? <span className="portal-job-amount">{formatMoney(job.quotedAmount)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {portal.payments.length > 0 || settledInvoices.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Receipts</p>
              <h2>What you&apos;ve paid</h2>
            </div>
            {/* Same list dressing, different thing: a receipt is not a job, so
                it carries no status- class and is addressable on its own.

                This comment lives ABOVE the ternary on purpose. Inside the
                branch it is a second expression in a slot that takes one, and
                SWC reports it as "Expression expected" against the `return (`
                thirty lines up — while `tsc --noEmit` passes clean. */}
            {portal.payments.length > 0 ? (
              <ul className="portal-job-list portal-receipts">
                {portal.payments.map((payment) => (
                  <li key={payment.id} className="portal-job portal-receipt">
                    <div className="portal-job-main">
                      <strong>{payment.label}</strong>
                      <span className="portal-job-meta">
                        {payment.paidAt ? `Paid ${formatDay(payment.paidAt)}` : 'Paid'}
                        {payment.refunded ? ' · partially refunded' : ''}
                      </span>
                    </div>
                    <span className="portal-job-amount">{formatMoney(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {settledInvoices.length > 0 ? (
              <div className="cost-list portal-settled">
                {settledInvoices.map((invoice) => (
                  <Link href={`/invoice/${invoice.id}`} className="cost-item" key={invoice.id}>
                    <div className="cost-item-main">
                      <span className="cost-item-desc">{invoice.jobScope || invoice.ref}</span>
                      <span className="cost-item-sub">
                        {invoice.ref} · {invoice.statusLabel}
                      </span>
                    </div>
                    <span className="cost-item-amount">{formatMoney(invoice.total)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <p className="portal-foot">
          This page only shows your own records with {portal.businessName}. Don&apos;t forward the link — anyone who has
          it can see this.
        </p>
        <ContractorBrandFoot businessName={portal.businessName} />
      </main>
    </>
  );
}
