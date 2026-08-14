import { formatDuration, getAverageRequestResponseMs } from '@/lib/leads';
import { DEMO_ACCOUNT_ID, DEMO_LEADS } from '@/lib/demo-data';
import { demoLeadDetails, demoLeadViews } from '@/lib/demo-focus';
import { getMapPins } from '@/lib/map-pins';
import { demoSupabase } from '@/lib/demo-rows';
import LeadsWorkspace from '@/app/dashboard/leads/LeadsWorkspace';
import styles from '../../dashboard/leads/leads.module.css';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

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
 *
 * A COMPONENT, NOT A PAGE, AND THAT IS THE WHOLE POINT OF THIS FILE.
 * Two routes render this — /demo/leads and /demo/leads/[leadId], the second
 * being the same screen opened on the lead the URL names. It used to live in
 * page.tsx, which the detail route imported and called with a prop:
 *
 *     export default async function DemoLeadsPage(
 *       { initialLeadId }: { initialLeadId?: string } = {},
 *     )
 *
 * A page's default export has to accept Next's PageProps — `{ params,
 * searchParams }` — and that signature does not, so Next's own generated type
 * check rejected it:
 *
 *     .next/types/app/demo/leads/page.ts(28,29): error TS2344
 *     Type '{ initialLeadId?: string | undefined; } | undefined'
 *     does not satisfy the constraint 'PageProps'
 *
 * It hid for a long time because that file is GENERATED. A clean checkout has
 * no .next, so `tsc --noEmit` passes; the error only appears once something has
 * compiled the route. CI runs tsc before the build, so the tsc step was green
 * and the failure could only ever surface later, in `next build`.
 */
export default async function DemoLeadsScreen({ initialLeadId }: { initialLeadId?: string } = {}) {
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
          <h2>Work pipeline</h2>
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
        <a href={APP_SIGNUP_URL} className="btn primary">
          Build my free site
        </a>
      </section>
    </main>
  );
}
