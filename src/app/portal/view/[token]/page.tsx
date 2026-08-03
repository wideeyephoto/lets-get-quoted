import Link from 'next/link';
import { createAdminClient } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { resolvePortalAccess } from '@/lib/client-portal';
import { loadPortal } from '@/lib/client-portal-data';

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
  const date = new Date(`${value}T00:00:00`);
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

  return (
    <main className="wide-shell workspace-shell payment-shell">
      <section className="workspace-hero panel payment-hero workspace-hero-solo">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{portal.businessName}</p>
          <h1 className="workspace-title">Hello {firstName}</h1>
          <p className="workspace-lead">
            {portal.totalJobs === 0
              ? `Nothing on file with ${portal.businessName} yet.`
              : `${portal.totalJobs} job${portal.totalJobs === 1 ? '' : 's'} with ${portal.businessName}${
                  portal.firstJobAt ? `, going back to ${formatDay(portal.firstJobAt)}` : ''
                }.`}
          </p>
        </div>
      </section>

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
          <ul className="portal-job-list">
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

      <p className="portal-foot">
        This page only shows your own records with {portal.businessName}. Don&apos;t forward the link — anyone who has
        it can see this. <Link href="/">What is Let&apos;s Get Quoted?</Link>
      </p>
    </main>
  );
}
