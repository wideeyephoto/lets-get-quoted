import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import { DEMO_JOBS } from '@/lib/demo-data';
import { demoJobDetails, demoJobViews } from '@/lib/demo-focus';
import DemoJobsFocus from './DemoJobsFocus';

export const dynamic = 'force-dynamic';

// Focus, because that is what the live page opens as (normalizeJobsView). The
// demo used to show the stacked list behind a row of status tabs, so a prospect
// never saw the pane the product actually opens on — the one that answers "what
// is this job, what does it cost me and what do they still owe" without a page
// load per job.
export default function DemoJobsPage() {
  const totalQuoted = DEMO_JOBS.reduce((sum, job) => sum + job.quoted_amount, 0);
  const activeJobs = DEMO_JOBS.filter((job) => job.status === 'in_progress').length;

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Pipeline</p>
          <h2>Current jobs</h2>
        </div>
        <DemoJobsFocus jobs={demoJobViews()} details={demoJobDetails()} />
      </section>

      <div className="stat-ticker panel">
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{DEMO_JOBS.length}</span>
          <span className="stat-ticker-label">Visible jobs</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{activeJobs}</span>
          <span className="stat-ticker-label">In progress</span>
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
        <Link href="/login" className="btn primary">
          Create free account
        </Link>
      </section>
    </main>
  );
}
