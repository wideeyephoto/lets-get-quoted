import { formatMoney } from '@/lib/jobs';
import { DEMO_JOBS, dateKeyFromNow } from '@/lib/demo-data';
import { demoJobDetails, demoJobViews } from '@/lib/demo-focus';
import { getMapPins } from '@/lib/map-pins';
import { DEMO_ACCOUNT_ID } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import { todayKeyOf } from '@/lib/job-queue';
import JobsWorkspace from '@/app/dashboard/jobs/JobsWorkspace';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

export const metadata = { title: 'Jobs — Live Demo' };

export const dynamic = 'force-dynamic';

/**
 * Current jobs, for a logged-out visitor.
 *
 * The whole workspace now, not just its Focus pane. The demo used to render one
 * of the five layouts, so a prospect never saw the view picker, the Kanban
 * board, the sortable table or the map — which is most of what makes this page
 * worth a tour.
 *
 * `details` is supplied up front, so the panes read job detail from memory
 * instead of calling /api/jobs/[id]/detail, which requires an owner. `readOnly`
 * keeps the layout pickers working locally without trying to write a cookie
 * nobody is signed in to own.
 */
export default async function DemoJobsPage() {
  const totalQuoted = DEMO_JOBS.reduce((sum, job) => sum + job.quoted_amount, 0);
  // "In progress" is the STATUS, and now that the demo books work a quarter out
  // it stopped being the answer to "how many jobs are you on". Every booked job
  // carries that status until it completes, so the old count read 30 — for a
  // four-person crew. Split it: what is open on site today, and what is sold and
  // waiting on the calendar.
  const todayKey = dateKeyFromNow(0);
  const onSiteNow = DEMO_JOBS.filter(
    (job) => job.status === 'in_progress' && job.scheduled_for && job.scheduled_for <= todayKey,
  ).length;
  const bookedAhead = DEMO_JOBS.filter(
    (job) => job.status === 'in_progress' && job.scheduled_for && job.scheduled_for > todayKey,
  ).length;

  // Real pins, from the coordinates seeded onto the demo jobs — so the map is
  // the same map the app draws rather than an empty frame.
  const mapPins = await getMapPins(demoSupabase, DEMO_ACCOUNT_ID);

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Pipeline</p>
          <h2>Current jobs</h2>
        </div>
        <JobsWorkspace
          jobs={demoJobViews()}
          details={demoJobDetails()}
          initialView="smoothie"
          mapView="large"
          mapTheme="dark"
          mapPins={mapPins}
          todayKey={todayKeyOf(new Date())}
          basePath="/demo"
          readOnly
        />
      </section>

      <div className="stat-ticker panel">
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{DEMO_JOBS.length}</span>
          <span className="stat-ticker-label">Visible jobs</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{onSiteNow}</span>
          <span className="stat-ticker-label">On site now</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{bookedAhead}</span>
          <span className="stat-ticker-label">Booked ahead</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{formatMoney(totalQuoted)}</span>
          <span className="stat-ticker-label">Quoted value</span>
        </div>
      </div>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>+ New job</h2>
        </div>
        <p className="workspace-card-copy">
          Creating jobs, logging costs, and tracking margin is instant once you&apos;re signed in — this
          demo account is read-only.
        </p>
        <a href={APP_SIGNUP_URL} className="btn primary">
          Build my free site
        </a>
      </section>
    </main>
  );
}
