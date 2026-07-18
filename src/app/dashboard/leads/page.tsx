import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import AddressAutocomplete from '@/components/address-autocomplete';
import { formatDuration, formatElapsedTime, formatLeadSource, getAverageRequestResponseMs, listLeads, type Lead, type LeadStatus } from '@/lib/leads';
import { createLeadAction } from './actions';
import SaveButton from '@/components/save-button';
import styles from './leads.module.css';

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'contacted', label: 'Contacted' },
  { status: 'quoted', label: 'Quoted' },
  { status: 'won', label: 'Won' },
  { status: 'lost', label: 'Lost' },
];

function responseLabel(lead: Lead) {
  if (lead.status === 'new' && lead.source === 'website_form') return 'Needs response';
  if (lead.status === 'new') return 'New request';
  if (lead.status === 'contacted') return 'Contacted';
  if (lead.status === 'quoted') return 'Quote sent';
  if (lead.status === 'won') return 'Won';
  return 'Lost';
}

export default async function LeadsPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const leads = await listLeads(supabase, accountId);
  const websiteRequests = leads.filter((lead) => lead.source === 'website_form').length;
  const openRequests = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;
  const needsResponse = leads.filter((lead) => lead.status === 'new' && lead.source === 'website_form').length;
  const averageResponse = formatDuration(getAverageRequestResponseMs(leads));

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading"><p className="eyebrow">Pipeline</p><h2>Current leads</h2></div>
        {leads.length === 0 ? <p className="empty-state">No leads yet. Published website requests will appear here.</p> : (
          <div className={styles.board}>
            {COLUMNS.map((column) => {
              const columnLeads = leads.filter((lead) => lead.status === column.status);
              return <section className={`${styles.column}${column.status === 'new' ? ` ${styles.newColumn}` : ''}`} key={column.status}><header className={styles.columnHeader}><h2>{column.status === 'new' ? 'Needs response' : column.label}</h2><span>{columnLeads.length}</span></header><div className={styles.cards}>{columnLeads.map((lead) => {
                const isUrgent = lead.status === 'new' && lead.source === 'website_form';
                return (
                  <Link className={`${styles.leadCard}${isUrgent ? ` ${styles.urgentCard}` : ''}`} href={`/dashboard/leads/${lead.id}`} key={lead.id}>
                    <div className={styles.cardTopline}><strong>{lead.name || 'Unnamed request'}</strong><span className={isUrgent ? styles.needsBadge : styles.statusBadge}>{responseLabel(lead)}</span></div>
                    <p>{lead.project_type || lead.message || 'Project details not provided'}</p>
                    <div className={styles.cardMetaGrid}>
                      <span>{formatLeadSource(lead.source)}</span>
                      <span>Estimated hours: {lead.estimated_hours ? `${lead.estimated_hours} hrs` : 'Not set'}</span>
                      <time dateTime={lead.created_at}>Received {formatElapsedTime(lead.created_at)} ago</time>
                    </div>
                    {(lead.phone || lead.email) && <div className={styles.contactHint}>{lead.phone || lead.email}</div>}
                  </Link>
                );
              })}{columnLeads.length === 0 && <p className={styles.empty}>No leads here.</p>}</div></section>;
            })}
          </div>
        )}
      </section>

      <div className={`stat-ticker panel ${styles.requestStats}`}>
        <div className={styles.urgentStat}>
          <span className="stat-ticker-value">{needsResponse}</span>
          <span className="stat-ticker-label">Needs response</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{websiteRequests}</span>
          <span className="stat-ticker-label">Website requests</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{openRequests}</span>
          <span className="stat-ticker-label">Open requests</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{averageResponse}</span>
          <span className="stat-ticker-label">Avg response time</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{leads.filter((lead) => lead.status === 'won').length}</span>
          <span className="stat-ticker-label">Won</span>
        </div>
      </div>

      <section className="panel workspace-section-card">
        <details className="workspace-details" open={leads.length === 0}>
          <summary className="workspace-details-summary">
            <span className="btn primary">+ Add manual lead</span>
            <span className="workspace-details-copy">Log a lead that came in by phone, in person, or referral.</span>
          </summary>
          <form action={createLeadAction} className="form-grid">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required placeholder="Sarah Whitfield" />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" placeholder="(248) 555-0117" />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" placeholder="sarah@example.com" />
            </div>
            <div className="field">
              <label htmlFor="address">Address</label>
              <AddressAutocomplete id="address" name="address" placeholder="1418 Maplewood Ave, Royal Oak, MI" />
            </div>
            <div className="field full">
              <label htmlFor="projectType">Project type</label>
              <input id="projectType" name="projectType" placeholder="Roof replacement" />
            </div>
            <div className="field">
              <label htmlFor="estimatedHours">Estimated hours</label>
              <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" placeholder="16" />
            </div>
            <div className="field full">
              <label htmlFor="message">Notes</label>
              <textarea id="message" name="message" placeholder="Details from the call or conversation..." />
            </div>
            <div className="field full">
              <label htmlFor="photos">Photos</label>
              <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple />
            </div>
            <div className="field full">
              <SaveButton>Add lead</SaveButton>
            </div>
          </form>
        </details>
      </section>
    </main>
  );
}