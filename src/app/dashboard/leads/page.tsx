import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import AddressAutocomplete from '@/components/address-autocomplete';
import { listLeads, type LeadStatus } from '@/lib/leads';
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

export default async function LeadsPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const leads = await listLeads(supabase, accountId);
  const websiteLeads = leads.filter((lead) => lead.source === 'website_form').length;
  const openLeads = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero workspace-hero-solo panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Leads</p>
          <h1 className="workspace-title">Opportunity pipeline</h1>
          <p className="workspace-lead">Follow every inquiry from first contact through quote and signed work.</p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading"><p className="eyebrow">Pipeline</p><h2>Current opportunities</h2></div>
        {leads.length === 0 ? <p className="empty-state">No leads yet. Published website requests will appear here.</p> : (
          <div className={styles.board}>
            {COLUMNS.map((column) => {
              const columnLeads = leads.filter((lead) => lead.status === column.status);
              return <section className={styles.column} key={column.status}><header className={styles.columnHeader}><h2>{column.label}</h2><span>{columnLeads.length}</span></header><div className={styles.cards}>{columnLeads.map((lead) => <Link className={styles.leadCard} href={`/dashboard/leads/${lead.id}`} key={lead.id}><strong>{lead.name || 'Unnamed lead'}</strong><p>{lead.project_type || lead.message || 'Project details not provided'}</p><div className={styles.meta}><span>{lead.source.replace('_', ' ')}</span><time>{new Date(lead.created_at).toLocaleDateString()}</time></div></Link>)}{columnLeads.length === 0 && <p className={styles.empty}>No leads here.</p>}</div></section>;
            })}
          </div>
        )}
      </section>

      <div className="stat-ticker panel">
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{openLeads}</span>
          <span className="stat-ticker-label">Open leads</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{websiteLeads}</span>
          <span className="stat-ticker-label">Website inquiries</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{leads.filter((lead) => lead.status === 'won').length}</span>
          <span className="stat-ticker-label">Won</span>
        </div>
      </div>

      <section className="panel workspace-section-card">
        <details className="workspace-details" open={leads.length === 0}>
          <summary className="workspace-details-summary">
            <span className="btn primary">+ New lead</span>
            <span className="workspace-details-copy">Log an inquiry that came in by phone, in person, or referral.</span>
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
            <div className="field full">
              <label htmlFor="message">Notes</label>
              <textarea id="message" name="message" placeholder="Details from the call or conversation…" />
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