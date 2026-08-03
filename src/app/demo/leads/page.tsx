import Link from 'next/link';
import { formatDuration, getAverageRequestResponseMs } from '@/lib/leads';
import { DEMO_LEADS } from '@/lib/demo-data';
import { demoLeadDetails, demoLeadViews } from '@/lib/demo-focus';
import DemoLeadsFocus from './DemoLeadsFocus';
import styles from '../../dashboard/leads/leads.module.css';

export const dynamic = 'force-dynamic';

// Focus, because that is what the live page opens as (normalizeLeadsView). The
// demo used to show a Kanban board — a view a real owner has to go and choose —
// so the first thing a prospect saw was not the product's own answer to "who do
// I call next and what did they ask for".
export default function DemoLeadsPage({ initialLeadId }: { initialLeadId?: string } = {}) {
  const leads = DEMO_LEADS;
  const websiteRequests = leads.filter((lead) => lead.source === 'website_form').length;
  const openRequests = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;
  const needsResponse = leads.filter((lead) => lead.status === 'new' && lead.source === 'website_form').length;
  const averageResponse = formatDuration(getAverageRequestResponseMs(leads));

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Pipeline</p>
          <h2>Current leads</h2>
        </div>
        <DemoLeadsFocus leads={demoLeadViews()} details={demoLeadDetails()} initialLeadId={initialLeadId} />
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
  );
}
