import { requireAdmin } from '@/lib/auth';
import { getRecentIncidents } from '@/lib/admin-alerts';
import {
  INCIDENT_KINDS,
  INCIDENT_SEVERITIES,
  KIND_HELP,
  SEVERITY_HELP,
  incidentDuration,
} from '@/lib/platform-incidents';
import styles from '../admin.module.css';
import { logIncidentAction } from './actions';
import ResolveIncidentButton from './ResolveIncidentButton';

/**
 * Releases and incidents.
 *
 * platform_incidents has existed since 2026-08-06 with a reader, an index and
 * the Command Center's first card — and no writer anywhere in the repo. Its own
 * migration instructed staff to insert rows by hand in the Supabase SQL editor,
 * so in practice the card said "No releases or incidents logged recently"
 * permanently, which reads as good news rather than as a card that cannot show
 * anything. This is the missing half.
 */

export const dynamic = 'force-dynamic';

const DONE: Record<string, string> = {
  logged: 'Logged. It is on the Command Center now.',
  resolved: 'Marked resolved.',
};
const ERRORS: Record<string, string> = {
  title: 'Give it a title — that is what everyone reads first.',
  kind: 'Pick whether this is a release or an incident.',
  already_resolved: 'That one was already resolved.',
  failed: 'Could not save that. Try again in a moment.',
};

function fmt(v: string | null): string {
  return v ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default async function AdminIncidentsPage({ searchParams }: { searchParams: { done?: string; error?: string } }) {
  const { admin } = await requireAdmin();
  const incidents = await getRecentIncidents(admin, { limit: 50 });
  const now = new Date();
  const open = incidents.filter((i) => i.kind === 'incident' && !i.resolved_at);

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Operations</p>
        <h1 className={styles.title}>Releases &amp; incidents</h1>
        <p className={styles.lead}>
          Hand-written, on purpose — there is no deploy tracker or incident system wired up yet. What is here is what
          somebody took the trouble to record, and the Command Center shows the most recent.
        </p>
      </header>

      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{DONE[searchParams.done] ?? 'Done.'}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERRORS[searchParams.error] ?? 'Something went wrong.'}</div> : null}

      {open.length > 0 ? (
        <section className={styles.panel} style={{ borderColor: 'rgba(252,165,165,0.4)' }}>
          <p className={styles.panelTitle}>Open right now</p>
          <ul className={styles.timeline}>
            {open.map((i) => (
              <li key={i.id}>
                <time>{incidentDuration(i.started_at, null, now)}</time>
                <span>
                  <span className={`${styles.pill} ${i.severity === 'critical' ? styles.bad : styles.warn}`}>{i.severity}</span>{' '}
                  <span className={styles.timelineActor}>{i.title}</span>
                  {' — '}
                  <ResolveIncidentButton incidentId={i.id} title={i.title} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <p className={styles.panelTitle}>Recent</p>
            {incidents.length === 0 ? (
              <p className={styles.emptyState}>Nothing logged yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Started</th><th>Kind</th><th>Title</th><th>Severity</th><th>Lasted</th><th>By</th></tr>
                  </thead>
                  <tbody>
                    {incidents.map((i) => (
                      <tr key={i.id}>
                        <td>{fmt(i.started_at)}</td>
                        <td>{i.kind}</td>
                        <td>
                          {i.title}
                          {i.description ? <div className={styles.muted} style={{ fontSize: '.8rem' }}>{i.description}</div> : null}
                        </td>
                        <td>
                          <span className={`${styles.pill} ${i.severity === 'critical' ? styles.bad : i.severity === 'warning' ? styles.warn : styles.neutral}`}>
                            {i.severity}
                          </span>
                        </td>
                        {/* A release is a point in time and has no duration; an
                            unresolved incident is still counting. */}
                        <td>{i.kind === 'release' ? '—' : incidentDuration(i.started_at, i.resolved_at, now)}{i.kind === 'incident' && !i.resolved_at ? ' (open)' : ''}</td>
                        <td className={styles.muted}>{i.created_by ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className={styles.panel}>
            <p className={styles.panelTitle}>Log one</p>
            <form action={logIncidentAction} className={styles.formStack}>
              <label htmlFor="kind">What is it</label>
              <select id="kind" name="kind" className={styles.input} defaultValue="incident">
                {INCIDENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <p className={styles.muted} style={{ margin: '.2rem 0 .6rem', fontSize: '.78rem' }}>
                {INCIDENT_KINDS.map((k) => `${k}: ${KIND_HELP[k]}`).join(' · ')}
              </p>

              <label htmlFor="title">Title</label>
              <input id="title" name="title" className={styles.input} maxLength={200} placeholder="Checkout failing for Connect accounts" />

              <label htmlFor="severity">Severity</label>
              <select id="severity" name="severity" className={styles.input} defaultValue="warning">
                {INCIDENT_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {/* Spelled out so two staff members grade the same outage the same
                  way. A severity scale nobody defined is a severity scale
                  nobody can compare across incidents. */}
              <p className={styles.muted} style={{ margin: '.2rem 0 .6rem', fontSize: '.78rem' }}>
                {INCIDENT_SEVERITIES.map((s) => `${s}: ${SEVERITY_HELP[s]}`).join(' · ')}
                {' '}Releases are always logged as info.
              </p>

              <label htmlFor="started_at">Started</label>
              {/* Backdating is the normal case — an incident gets written up
                  once it is understood, not while it is burning. */}
              <input id="started_at" name="started_at" type="datetime-local" className={styles.input} />

              <label htmlFor="description">What happened</label>
              <textarea id="description" name="description" className={styles.input} rows={4} maxLength={4000} placeholder="What broke, who it hit, what was done." />

              <button type="submit" className="btn primary">Log it</button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
