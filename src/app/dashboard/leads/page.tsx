import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listLeads, type LeadStatus } from '@/lib/leads';
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
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Leads</p>
          <h1 className="workspace-title">Opportunity pipeline</h1>
          <p className="workspace-lead">Follow every inquiry from first contact through quote and signed work.</p>
        </div>
        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent"><span className="workspace-metric-label">Open leads</span><strong className="workspace-metric-value">{openLeads}</strong><p className="workspace-metric-note">New, contacted, or quoted opportunities.</p></article>
          <article className="workspace-metric-card"><span className="workspace-metric-label">Website inquiries</span><strong className="workspace-metric-value">{websiteLeads}</strong><p className="workspace-metric-note">Requests captured by contractor websites.</p></article>
          <article className="workspace-metric-card"><span className="workspace-metric-label">Won</span><strong className="workspace-metric-value">{leads.filter((lead) => lead.status === 'won').length}</strong><p className="workspace-metric-note">Leads moved into signed work.</p></article>
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
    </main>
  );
}