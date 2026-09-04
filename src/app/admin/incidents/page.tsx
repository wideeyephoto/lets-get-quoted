import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { staffCan } from '@/lib/staff';
import { createAdminSignalDiagnostics, getIncidentsPaged, getOpenIncidents } from '@/lib/admin-alerts';
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
export const metadata = { title: 'Incidents' };

const DONE: Record<string, string> = {
  logged: 'Logged. It is on the Command Center now.',
  resolved: 'Marked resolved.',
};
const ERRORS: Record<string, string> = {
  title: 'Give it a title — that is what everyone reads first.',
  kind: 'Pick whether this is a release or an incident.',
  already_resolved: 'That one was already resolved.',
  failed: 'Could not save that. Try again in a moment.',
  resolution: 'Add a short resolution summary before closing the incident.',
  url: 'Use a complete http or https URL for the external incident link.',
};

function fmt(v: string | null): string {
  return v ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

const PAGE_SIZE = 25;

export default async function AdminIncidentsPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ done?: string; error?: string; page?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const ctx = await requireAdmin();
  const diagnostics = createAdminSignalDiagnostics();
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const [open, { rows: incidents, total }] = await Promise.all([
    getOpenIncidents(ctx.admin, { diagnostics }),
    getIncidentsPaged(ctx.admin, { page, pageSize: PAGE_SIZE, diagnostics }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();

  function paramsFor(next: Record<string, string | undefined>): string {
    const p = new URLSearchParams();
    if (searchParams.done) p.set('done', searchParams.done);
    if (searchParams.error) p.set('error', searchParams.error);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    return qs ? `/admin/incidents?${qs}` : '/admin/incidents';
  }

  // Both write surfaces on this page call requirePermission('ops.manage'),
  // which only ops and super_admin hold — but the page is in the nav for
  // everyone and used to render the form and the resolve button regardless.
  // requirePermission throws as its first statement, and there is no error
  // boundary under /app, so a support user clicking "Log it" got Next's generic
  // crash screen and lost the write-up they had just typed.
  const mayManage = staffCan(ctx.staff, 'ops.manage');

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
      {diagnostics.failed.includes('incidents') ? <div className={`${styles.banner} ${styles.err}`}>Incident history is unavailable. A blank list is not an all-clear.</div> : null}

      {open.length > 0 ? (
        <section className={styles.panel} style={{ borderColor: 'rgba(252,165,165,0.4)' }}>
          <h2 className={styles.panelTitle}>Open right now</h2>
          <ul className={styles.timeline}>
            {open.map((i) => (
              <li key={i.id}>
                <time>{incidentDuration(i.started_at, null, now)}</time>
                <span>
                  <span className={`${styles.pill} ${i.severity === 'critical' ? styles.bad : styles.warn}`}>{i.severity}</span>{' '}
                  <span className={styles.timelineActor}>{i.title}</span>
                  {mayManage ? (
                    <>
                      {' — '}
                      <ResolveIncidentButton incidentId={i.id} title={i.title} />
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem', flexWrap: 'wrap', gap: '.5rem' }}>
              <h2 className={styles.panelTitle} style={{ margin: 0 }}>
                Recent ({total.toLocaleString('en-US')} total{pageCount > 1 ? ` · page ${page} of ${pageCount}` : ''})
              </h2>
            </div>
            {incidents.length === 0 ? (
              diagnostics.failed.includes('incidents') ? null : <p className={styles.emptyState}>Nothing logged yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Started</th><th>Kind</th><th>Title &amp; impact</th><th>Severity</th><th>Lasted</th><th>Owner</th></tr>
                  </thead>
                  <tbody>
                    {incidents.map((i) => (
                      <tr key={i.id}>
                        <td>{fmt(i.started_at)}</td>
                        <td>{i.kind}</td>
                        <td>
                          {i.title}
                          {i.description ? <div className={styles.muted} style={{ fontSize: '.8rem' }}>{i.description}</div> : null}
                          {i.impact_summary ? <div style={{ fontSize: '.78rem' }}><strong>Impact:</strong> {i.impact_summary}</div> : null}
                          {i.affected_services.length ? <div className={styles.muted} style={{ fontSize: '.72rem' }}>{i.affected_services.join(', ')}</div> : null}
                          {i.resolution_summary ? <div style={{ fontSize: '.78rem' }}><strong>Resolution:</strong> {i.resolution_summary}</div> : null}
                          {i.external_url ? <div><a className={styles.rowLink} href={i.external_url} target="_blank" rel="noreferrer">Deploy / incident link →</a></div> : null}
                        </td>
                        <td>
                          <span className={`${styles.pill} ${i.severity === 'critical' ? styles.bad : i.severity === 'warning' ? styles.warn : styles.neutral}`}>
                            {i.severity}
                          </span>
                        </td>
                        {/* A release is a point in time and has no duration; an
                            unresolved incident is still counting. */}
                        <td>{i.kind === 'release' ? '—' : incidentDuration(i.started_at, i.resolved_at, now)}{i.kind === 'incident' && !i.resolved_at ? ' (open)' : ''}</td>
                        <td className={styles.muted}>{i.owner ?? i.created_by ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pageCount > 1 ? (
              <div className={styles.pagination}>
                {page > 1 ? <Link className="btn secondary" href={paramsFor({ page: String(page - 1) })}>← Previous</Link> : <span />}
                {page < pageCount ? <Link className="btn secondary" href={paramsFor({ page: String(page + 1) })}>Next →</Link> : null}
              </div>
            ) : null}
          </section>
        </div>

        <div>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Log one</h2>
            {!mayManage ? (
              <p className={styles.muted} style={{ fontSize: '.82rem' }}>
                Logging releases and incidents needs the ops role. The log itself is readable by everyone — if something
                belongs here, ask ops to write it up.
              </p>
            ) : (
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

              <label htmlFor="impact_summary">Customer impact</label>
              <textarea id="impact_summary" name="impact_summary" className={styles.input} rows={3} maxLength={2000} placeholder="Who was affected and what could they not do?" />

              <label htmlFor="affected_services">Affected services</label>
              <input id="affected_services" name="affected_services" className={styles.input} placeholder="payments, booking, SMS (comma separated)" />

              <label htmlFor="incident_owner">Incident owner</label>
              <input id="incident_owner" name="owner" className={styles.input} defaultValue={ctx.adminEmail} />

              <label htmlFor="external_url">Deploy, status, or incident URL (optional)</label>
              <input id="external_url" name="external_url" className={styles.input} type="url" placeholder="https://…" />

              <button type="submit" className="btn primary">Log it</button>
            </form>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
