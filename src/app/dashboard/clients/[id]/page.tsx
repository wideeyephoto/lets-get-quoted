import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { getClient, getClientStatement } from '@/lib/clients';
import { formatMoney, type JobStatus } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import SaveButton from '@/components/save-button';
import { updateClientAction } from '../actions';

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
          <h1 className="workspace-title">{client.name}</h1>
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
          <div className="panel workspace-section-card sticky-card">
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
                <input id="phone" name="phone" defaultValue={client.phone ?? ''} />
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
