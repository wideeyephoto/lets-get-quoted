import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { cronJob, cronSummaryHasFailures } from '@/lib/cron-jobs';
import { listCronRuns } from '@/lib/cron-runs';
import styles from '../../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Scheduled job history' };

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' }) : '—';
}

export default async function CronJobHistoryPage({ params: paramsPromise }: { params: Promise<{ job: string }> }) {
  const params = await paramsPromise;
  const spec = cronJob(params.job);
  if (!spec) notFound();
  const { admin } = await requireAdmin();
  const history = await listCronRuns(admin, spec.job, 50);
  const runs = history.runs;
  return <>
    <Link href="/admin/health" className={styles.backLink}>← Service health</Link>
    <header className={styles.pageHead}><p className={styles.eyebrow}>Scheduled job</p><h1 className={styles.title}>{spec.label}</h1><p className={styles.lead}>{spec.consequence}</p></header>
    {!history.available ? <div className={`${styles.banner} ${styles.err}`}>Run history is unavailable. A blank table is not being treated as no runs.</div> : null}
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Recent runs · {runs.length}</h2>
      {history.available && runs.length === 0 ? <p className={styles.emptyState}>No run history recorded.</p> : null}
      {runs.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Started</th><th>Finished</th><th>Result</th><th>Took</th><th>Error</th><th>Summary</th></tr></thead>
        <tbody>{runs.map((run) => {
          const logicalFailure = cronSummaryHasFailures(run.summary);
          const result = !run.finished_at ? 'running' : run.ok === false || logicalFailure ? 'failed' : 'completed';
          return <tr key={run.id}><td>{fmt(run.started_at)}</td><td>{fmt(run.finished_at)}</td><td><span className={`${styles.pill} ${result === 'failed' ? styles.bad : result === 'completed' ? styles.good : styles.neutral}`}>{result}</span>{logicalFailure && run.ok !== false ? <div className={styles.muted}>wrapper completed; work failed</div> : null}</td><td>{run.duration_ms === null ? '—' : `${run.duration_ms}ms`}</td><td className={styles.muted}>{run.error || '—'}</td><td className={styles.muted}><code>{run.summary ? JSON.stringify(run.summary) : '—'}</code></td></tr>;
        })}</tbody>
      </table></div> : null}
    </section>
  </>;
}
