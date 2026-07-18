import Link from 'next/link';
import DemoNav from '@/components/demo-nav';
import { formatDuration, formatElapsedTime, formatLeadSource, getAverageRequestResponseMs, type Lead, type LeadStatus } from '@/lib/leads';
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

function responseLabel(lead: Lead) {
  if (lead.status === 'new' && lead.source === 'website_form') return 'Needs response';
  if (lead.status === 'new') return 'New request';
  if (lead.status === 'contacted') return 'Contacted';
  if (lead.status === 'quoted') return 'Quote sent';
  if (lead.status === 'won') return 'Won';
  return 'Lost';
}

export default function DemoLeadsPage() {
  const leads = DEMO_LEADS;
  const websiteRequests = leads.filter((lead) => lead.source === 'website_form').length;
  const openRequests = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;
  const needsResponse = leads.filter((lead) => lead.status === 'new' && lead.source === 'website_form').length;
  const averageResponse = formatDuration(getAverageRequestResponseMs(leads));

  return (
    <>
      <DemoNav active="/demo/leads" />
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Pipeline</p>
            <h2>Current leads</h2>
          </div>
          <div className={styles.board}>
            {COLUMNS.map((column) => {
              const columnLeads = leads.filter((lead) => lead.status === column.status);
              return (
                <section className={`${styles.column}${column.status === 'new' ? ` ${styles.newColumn}` : ''}`} key={column.status}>
                  <header className={styles.columnHeader}>
                    <h2>{column.status === 'new' ? 'Needs response' : column.label}</h2>
                    <span>{columnLeads.length}</span>
                  </header>
                  <div className={styles.cards}>
                    {columnLeads.map((lead) => {
                      const isUrgent = lead.status === 'new' && lead.source === 'website_form';
                      return (
                        <Link className={`${styles.leadCard}${isUrgent ? ` ${styles.urgentCard}` : ''}`} href="/login" key={lead.id}>
                          <div className={styles.cardTopline}><strong>{lead.name || 'Unnamed request'}</strong><span className={isUrgent ? styles.needsBadge : styles.statusBadge}>{responseLabel(lead)}</span></div>
                          <p>{lead.project_type || lead.message || 'Project details not provided'}</p>
                          <div className={styles.cardMetaGrid}>
                            <span>{formatLeadSource(lead.source)}</span>
                            <time dateTime={lead.created_at}>Received {formatElapsedTime(lead.created_at)} ago</time>
                          </div>
                          {(lead.phone || lead.email) && <div className={styles.contactHint}>{lead.phone || lead.email}</div>}
                        </Link>
                      );
                    })}
                    {columnLeads.length === 0 && <p className={styles.empty}>No leads here.</p>}
                  </div>
                </section>
              );
            })}
          </div>
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

        <section className="panel workspace-section-card demo-locked-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Try it yourself</p>
            <h2>+ Add manual request</h2>
          </div>
          <p className="workspace-card-copy">
            Every website lead lands here automatically, and you can log phone or referral leads by
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
