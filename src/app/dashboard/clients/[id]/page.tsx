import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { getClient, getClientStatement } from '@/lib/clients';
import { formatMoney, type JobStatus } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import SaveButton from '@/components/save-button';
import { updateClientAction } from '../actions';
import ConfirmActionButton from '../../jobs/[id]/ConfirmActionButton';
import { listPortalLinks } from '@/lib/client-portal-data';
import { revokeClientPortalAction } from './portal-actions';

const STATUS_LABEL: Record<JobStatus, string> = {
  new_lead: 'New',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  const client = await getClient(supabase, accountId, params.id);

  if (!client) {
    return (
      <main className="wide-shell">
        <div className="panel">
          <p className="empty-state">Client not found.</p>
          <Link href="/dashboard/clients" className="btn secondary">Back to clients</Link>
        </div>
      </main>
    );
  }

  const portalLinks = await listPortalLinks(supabase, accountId, client.id);

  const [{ data: jobRows }, { data: leadRows }] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, ref, status, quoted_amount, scheduled_for, created_at')
      .eq('account_id', accountId)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('leads')
      .select('id, project_type, status, created_at')
      .eq('account_id', accountId)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
  ]);
  const jobs = jobRows ?? [];
  const leads = leadRows ?? [];
  const totalValue = jobs.reduce((sum, job) => sum + (Number(job.quoted_amount) || 0), 0);
  const statement = await getClientStatement(supabase, accountId, client.id);
  const boundUpdate = updateClientAction.bind(null, client.id);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Client</p>
          {/* The lead and job pages both carry an edit link beside the name and
              this one never did — so the page with the MOST about a person was
              the one where changing their details meant scrolling to find the
              form. Named for the same reason the other two now are. */}
          <div className="job-title-row">
            <h1 className="workspace-title">{client.name}</h1>
            <Link href="#client-profile" className="job-title-edit-link">
              Edit client
            </Link>
          </div>
          <div className="workspace-inline-row">
            {jobs.length > 1 ? <span className="status-badge status-complete">Repeat customer</span> : null}
            <span className="workspace-inline-note">
              {[client.phone ? formatPhoneDashes(client.phone) : null, client.email].filter(Boolean).join(' · ') || 'No contact on file'}
            </span>
          </div>
          <div className="job-command-facts" aria-label="Client facts">
            <span><strong>{jobs.length}</strong> job{jobs.length === 1 ? '' : 's'}</span>
            <span><strong>{formatMoney(totalValue)}</strong> lifetime value</span>
            <span><strong>{formatMoney(statement.totalPaid)}</strong> paid</span>
            {statement.outstanding > 0 ? <span className="fact-outstanding"><strong>{formatMoney(statement.outstanding)}</strong> outstanding</span> : null}
            {client.address ? <span>{client.address}</span> : null}
          </div>
          <div className="actions workspace-actions">
            {/* Call, Text and Email exist on the detail pane in the client
                LIST, and used to disappear the moment you opened the person's
                full profile — the page with more about them than anywhere
                else, and the one you are most likely to be on when you decide
                to get in touch. The phone and email were already here; they
                were just printed as text. */}
            {client.phone ? (
              <>
                <a className="btn primary" href={`tel:${client.phone}`}>📞 Call</a>
                <a className="btn secondary" href={`sms:${client.phone}`}>💬 Text</a>
              </>
            ) : null}
            {client.email ? (
              <a className="btn secondary" href={`mailto:${client.email}`}>✉️ Email</a>
            ) : null}
            <Link href="/dashboard/clients" className="btn secondary">Back to clients</Link>
            {jobs.length > 0 ? <Link href={`/dashboard/clients/${client.id}/statement`} className="btn secondary">View statement →</Link> : null}
          </div>
        </div>
      </section>

      <section className="detail-grid workspace-grid-gap">
        <div>
          <div className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">History</p>
              <h2>Jobs</h2>
            </div>
            {jobs.length === 0 ? (
              <p className="empty-state">No jobs linked to this client yet.</p>
            ) : (
              <div className="cost-list">
                {jobs.map((job) => (
                  <Link href={`/dashboard/jobs/${job.id}`} className="cost-item" key={job.id}>
                    <div className="cost-item-main">
                      <span className="cost-item-desc">{job.ref}</span>
                      <span className="cost-item-sub">
                        {STATUS_LABEL[job.status as JobStatus] ?? job.status} · {formatDate(job.created_at)}
                      </span>
                    </div>
                    <span className="cost-item-amount">{formatMoney(Number(job.quoted_amount) || 0)}</span>
                  </Link>
                ))}
              </div>
            )}

            {leads.length > 0 ? (
              <>
                <div className="section-heading workspace-section-heading" style={{ marginTop: '1.5rem' }}>
                  <p className="eyebrow">Leads</p>
                  <h2>Requests</h2>
                </div>
                <div className="cost-list">
                  {leads.map((lead) => (
                    <Link href={`/dashboard/leads/${lead.id}`} className="cost-item" key={lead.id}>
                      <div className="cost-item-main">
                        <span className="cost-item-desc">{lead.project_type || 'Lead'}</span>
                        <span className="cost-item-sub">{formatDate(lead.created_at)}</span>
                      </div>
                      <span className="cost-item-amount" style={{ textTransform: 'capitalize' }}>{String(lead.status).replace('_', ' ')}</span>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div>
          {portalLinks.length > 0 ? (
            <div className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow">Portal access</p>
                <h2>Links this client holds</h2>
              </div>
              <ul className="portal-link-list">
                {portalLinks.map((link) => {
                  const live = !link.revoked_at && String(link.expires_at) > new Date().toISOString();
                  return (
                    <li key={link.id} className={live ? 'is-live' : 'is-dead'}>
                      <span>{link.sent_to}</span>
                      <span className="portal-link-meta">
                        {link.revoked_at
                          ? 'Revoked'
                          : String(link.expires_at) < new Date().toISOString()
                            ? 'Expired'
                            : `Works until ${String(link.expires_at).slice(0, 10)}`}
                        {link.last_used_at ? ` · last opened ${String(link.last_used_at).slice(0, 10)}` : ' · never opened'}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {/* One button, not one per link. Somebody asking for this wants the
                  door shut, not a list to work through. */}
              {portalLinks.some((link) => !link.revoked_at && String(link.expires_at) > new Date().toISOString()) ? (
                <ConfirmActionButton
                  action={revokeClientPortalAction.bind(null, client.id)}
                  confirmMessage={`Cut off ${client.name}'s access?\n\nEvery link they hold stops working immediately. They can request a new one from your website.`}
                  className="btn ghost"
                  pendingLabel="Revoking…"
                  savedLabel="Revoked ✓"
                >
                  Revoke access
                </ConfirmActionButton>
              ) : null}
            </div>
          ) : null}

          <div id="client-profile" className="panel workspace-section-card sticky-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Profile</p>
              <h2>Contact &amp; notes</h2>
            </div>
            <form action={boundUpdate} className="form-grid">
              <div className="field full">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" defaultValue={client.name} required />
              </div>
              <div className="field">
                <label htmlFor="phone">Mobile</label>
                {/* Shown the way it is shown everywhere else on the page. The
                    field used to hold the raw stored value, so a number that
                    read "248-555-0117" in the header became "+12485550117" the
                    moment you opened the form to change the address. Saving
                    re-normalizes, so this round-trips. */}
                <input id="phone" name="phone" defaultValue={formatPhoneDashes(client.phone)} />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" defaultValue={client.email ?? ''} />
              </div>
              <div className="field full">
                <label htmlFor="address">Address</label>
                <input id="address" name="address" defaultValue={client.address ?? ''} />
              </div>
              <div className="field full">
                <label htmlFor="notes">Notes</label>
                <textarea id="notes" name="notes" rows={4} defaultValue={client.notes ?? ''} placeholder="Gate code, dog on site, prefers texts…" />
              </div>
              <div className="field full">
                <SaveButton pendingLabel="Saving…" savedLabel="Saved ✓">Save profile</SaveButton>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
