import Link from 'next/link';
import { formatDuration, getAverageRequestResponseMs } from '@/lib/leads';
import { DEMO_ACCOUNT_ID, DEMO_LEADS } from '@/lib/demo-data';
import { demoLeadDetails, demoLeadViews } from '@/lib/demo-focus';
import { getMapPins } from '@/lib/map-pins';
import { demoSupabase } from '@/lib/demo-rows';
import LeadsWorkspace from '@/app/dashboard/leads/LeadsWorkspace';
import styles from '../../dashboard/leads/leads.module.css';

export const dynamic = 'force-dynamic';

/**
 * Current leads, for a logged-out visitor.
 *
 * The whole workspace, not just its Focus pane. The demo used to render one of
 * the six layouts, so a prospect never saw the view picker, the Kanban board,
 * the Priority inbox that orders by who has been waiting longest, or the map.
 *
 * `details` is supplied up front so the panes never call the owner-only detail
 * API, and `readOnly` short-circuits the single `run` every lead action goes
 * through. The triage buttons stay visible on purpose — the demo is showing
 * what those controls ARE, and a card with its actions cut out reads as a
 * narrower product than it is.
 */
export default async function DemoLeadsPage({ initialLeadId }: { initialLeadId?: string } = {}) {
  const leads = DEMO_LEADS;
  const websiteRequests = leads.filter((lead) => lead.source === 'website_form').length;
  const openRequests = leads.filter((lead) => !['won', 'lost'].includes(lead.status)).length;
  const needsResponse = leads.filter((lead) => lead.status === 'new' && lead.source === 'website_form').length;
  const averageResponse = formatDuration(getAverageRequestResponseMs(leads));

  const mapPins = await getMapPins(demoSupabase, DEMO_ACCOUNT_ID);

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Pipeline</p>
          <h2>Current leads</h2>
        </div>
        <LeadsWorkspace
          leads={demoLeadViews()}
          details={demoLeadDetails()}
          initialView="smoothie"
          mapView="large"
          mapTheme="dark"
          mapPins={mapPins}
          initialLeadId={initialLeadId}
          basePath="/demo"
          readOnly
        />
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
