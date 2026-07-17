import Link from 'next/link';
import DemoNav from '@/components/demo-nav';
import type { LeadStatus } from '@/lib/leads';
import { DEMO_LEADS } from '@/lib/demo-data';
import styles from '../../dashboard/leads/leads.module.css';

export const dynamic = 'force-dynamic';

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'contacted', label: 'Contacted' },
  { status: 'quoted', label: 'Quoted' },
  { status: 'won', label: 'Won' },
  { status: 'lost', label: 'Lost' },
];

export default function DemoLeadsPage() {
  const leads = DEMO_LEADS;
  const websiteLeads = leads.filter((lead) => lead.source === 'website_form').length;
  const openLeads = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;

  return (
    <>
      <DemoNav active="/demo/leads" />
      <main className="wide-shell workspace-shell">
        <section className="workspace-hero workspace-hero-solo panel">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Leads</p>
            <h1 className="workspace-title">Opportunity pipeline</h1>
            <p className="workspace-lead">Follow every inquiry from first contact through quote and signed work.</p>
          </div>
        </section>

        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Pipeline</p>
            <h2>Current opportunities</h2>
          </div>
          <div className={styles.board}>
            {COLUMNS.map((column) => {
              const columnLeads = leads.filter((lead) => lead.status === column.status);
              return (
                <section className={styles.column} key={column.status}>
                  <header className={styles.columnHeader}>
                    <h2>{column.label}</h2>
                    <span>{columnLeads.length}</span>
                  </header>
                  <div className={styles.cards}>
                    {columnLeads.map((lead) => (
                      <Link className={styles.leadCard} href="/login" key={lead.id}>
                        <strong>{lead.name || 'Unnamed lead'}</strong>
                        <p>{lead.project_type || lead.message || 'Project details not provided'}</p>
                        <div className={styles.meta}>
                          <span>{lead.source.replace('_', ' ')}</span>
                          <time>{new Date(lead.created_at).toLocaleDateString()}</time>
                        </div>
                      </Link>
                    ))}
                    {columnLeads.length === 0 && <p className={styles.empty}>No leads here.</p>}
                  </div>
                </section>
              );
            })}
          </div>
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

        <section className="panel workspace-section-card demo-locked-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Try it yourself</p>
            <h2>+ New lead</h2>
          </div>
          <p className="workspace-card-copy">
            Every website inquiry lands here automatically, and you can log phone or referral leads by
            hand too. This demo account is read-only.
          </p>
          <Link href="/login" className="btn primary">
            Create free account
          </Link>
        </section>
      </main>
    </>
  );
}
