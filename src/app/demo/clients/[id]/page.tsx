import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClient, getClientStatement } from '@/lib/clients';
import { formatMoney, type JobStatus } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import { DEMO_ACCOUNT_ID } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

export const metadata = { title: 'Client — Live Demo' };

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<JobStatus, string> = {
  new_lead: 'New',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function DemoClientDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const client = await getClient(demoSupabase, DEMO_ACCOUNT_ID, params.id);

  if (!client) {
    notFound();
  }

  const [{ data: jobRows }, { data: leadRows }] = await Promise.all([
    demoSupabase
      .from('jobs')
      .select('id, ref, status, quoted_amount, scheduled_for, created_at')
      .eq('account_id', DEMO_ACCOUNT_ID)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
    demoSupabase
      .from('leads')
      .select('id, project_type, status, created_at')
      .eq('account_id', DEMO_ACCOUNT_ID)
      .eq('client_id', client.id)
      .order('created_at', { ascending: false }),
  ]);
  const jobs = jobRows ?? [];
  const leads = leadRows ?? [];
  const totalValue = jobs.reduce((sum, job) => sum + (Number(job.quoted_amount) || 0), 0);
  const statement = await getClientStatement(demoSupabase, DEMO_ACCOUNT_ID, client.id);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Client · Live Demo</p>
          <div className="job-title-row">
            <h1 className="workspace-title">{client.name}</h1>
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
            {statement ? (
              <>
                <span><strong>{formatMoney(statement.totalPaid)}</strong> paid</span>
                {statement.outstanding > 0 ? <span className="fact-outstanding"><strong>{formatMoney(statement.outstanding)}</strong> outstanding</span> : null}
              </>
            ) : null}
            {client.address ? <span>{client.address}</span> : null}
          </div>
          <div className="actions workspace-actions">
            {client.phone ? (
              <>
                <a className="btn primary" href={`tel:${client.phone}`}>📞 Call</a>
                <a className="btn secondary" href={`sms:${client.phone}`}>💬 Text</a>
              </>
            ) : null}
            {client.email ? (
              <a className="btn secondary" href={`mailto:${client.email}`}>✉️ Email</a>
            ) : null}
            <Link href="/demo/clients" className="btn secondary">← Back to clients</Link>
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
                  <Link href={`/demo/jobs/${job.id}`} className="cost-item" key={job.id}>
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
                    <Link href="/demo/leads" className="cost-item" key={lead.id}>
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
          <div id="client-profile" className="panel workspace-section-card sticky-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Profile</p>
              <h2>Contact &amp; notes</h2>
            </div>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="name">Name</label>
                <input id="name" name="name" defaultValue={client.name} readOnly />
              </div>
              <div className="field">
                <label htmlFor="phone">Mobile</label>
                <input id="phone" name="phone" defaultValue={formatPhoneDashes(client.phone)} readOnly />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" defaultValue={client.email ?? ''} readOnly />
              </div>
              <div className="field full">
                <label htmlFor="address">Address</label>
                <input id="address" name="address" defaultValue={client.address ?? ''} readOnly />
              </div>
              <div className="field full">
                <label htmlFor="notes">Notes</label>
                <textarea id="notes" name="notes" rows={4} defaultValue={client.notes ?? ''} readOnly />
              </div>
            </div>
          </div>

          <div className="panel workspace-section-card demo-locked-card" style={{ marginTop: '1rem' }}>
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Demo Account</p>
              <h2>Create your own customer book</h2>
            </div>
            <p className="workspace-card-copy">
              In your real account you can edit contact notes, dispatch jobs, and send automated review requests.
            </p>
            <div className="actions" style={{ marginTop: '1rem' }}>
              <a href={APP_SIGNUP_URL} className="btn primary">Start Free Platform Trial</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
