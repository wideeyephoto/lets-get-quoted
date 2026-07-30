'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { JobStatus } from '@/lib/jobs';
import { setJobsViewAction, setMapThemeAction, setMapViewAction } from '@/app/dashboard/view-actions';
import type { JobsView, MapTheme, MapView } from '@/lib/dashboard-views';
import ViewGear from '@/components/view-gear';
import PinMap, { type MapPin } from '@/components/pin-map';
import FocusView from './FocusView';
import styles from './jobs.module.css';

// Display-ready job shape, built server-side so this client view never imports
// the server-only jobs module or the badge/payment data.
export type JobViewItem = {
  id: string;
  ref: string;
  clientName: string;
  address: string | null;
  status: JobStatus;
  badgeLabel: string;
  badgeTone: string;
  badgeTitle: string;
  scheduledLabel: string | null;
  quotedAmount: number;
  quotedLabel: string;
  estimatedHours: number | null;
  createdAt: string;
  // Money the server already had in hand. Lets the Focus pane answer "what do
  // they still owe me" with zero network on selection.
  outstandingLabel: string;
  paidLabel: string;
  invoiceRef: string | null;
  invoiceStatusLabel: string | null;
};

const VIEWS = [
  { id: 'list' as const, label: 'List', hint: 'The classic stacked list' },
  { id: 'board' as const, label: 'Board', hint: 'Kanban by stage' },
  { id: 'table' as const, label: 'Table', hint: 'Sort & scan' },
  { id: 'focus' as const, label: 'Focus', hint: 'One job open, list beside it' },
];

const STATUS_FILTERS: { value: JobStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new_lead', label: 'New request' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
];

const BOARD_COLUMNS: { status: JobStatus; label: string }[] = [
  { status: 'new_lead', label: 'New request' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'complete', label: 'Complete' },
  { status: 'archived', label: 'Archived' },
];

function StatusBadge({ job }: { job: JobViewItem }) {
  return (
    <span className={`status-badge status-${job.badgeTone}`} title={job.badgeTitle || undefined}>
      {job.badgeLabel}
    </span>
  );
}

export default function JobsWorkspace({ jobs, initialView, mapView, mapTheme, mapPins }: { jobs: JobViewItem[]; initialView: JobsView; mapView: MapView; mapTheme: MapTheme; mapPins: MapPin[] }) {
  const [view, setView] = useState<JobsView>(initialView);
  const [status, setStatus] = useState<JobStatus | 'all'>('all');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function pickView(next: JobsView) {
    setView(next);
    startTransition(() => setJobsViewAction(next).catch(() => {}));
  }
  function setMap(next: MapView) {
    startTransition(async () => {
      await setMapViewAction(next, 'jobs');
      router.refresh();
    });
  }
  function setTheme(next: MapTheme) {
    startTransition(async () => {
      await setMapThemeAction(next);
      router.refresh();
    });
  }

  const filtered = useMemo(() => (status === 'all' ? jobs : jobs.filter((j) => j.status === status)), [jobs, status]);

  // The view/map gear sits on the map's legend row, matching the leads page. Down
  // in the filter bar its popover opened downwards into the panels below it and
  // was overlapped by them; on the legend row it opens over the map instead.
  const gear = (
    <ViewGear views={VIEWS} activeView={view} onPickView={pickView} mapView={mapView} onSetMapView={setMap} mapTheme={mapTheme} onSetMapTheme={setTheme} label="View" />
  );

  return (
    <div className={pending ? styles.busy : undefined}>
      {/* Focus needs the width, and the map costs a SECOND full jobs+leads
          fetch on every load (getMapPins re-runs listJobs). Keep the gear
          reachable so the map can be turned back on from any view. */}
      {mapView === 'large' && view !== 'focus' ? (
        <div className="workspace-embedded-map">
          <PinMap pins={mapPins} theme={mapTheme} legendAccessory={gear} />
        </div>
      ) : (
        // Map off: keep the gear reachable, or there'd be no way to turn it back on.
        <div className={styles.viewBar}>{gear}</div>
      )}

      {jobs.length === 0 ? (
        <p className="empty-state">No jobs yet. Create your first job below.</p>
      ) : (
        <>
          {view === 'list' && <ListView jobs={filtered} />}
          {view === 'board' && <BoardView jobs={jobs} />}
          {view === 'table' && <TableView jobs={filtered} />}
          {view === 'focus' && <FocusView jobs={filtered} />}

          {view !== 'board' ? (
            <div className={styles.bar}>
              <div className={styles.tabs} role="tablist" aria-label="Filter jobs by status">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    role="tab"
                    aria-selected={status === f.value}
                    className={`${styles.tab}${status === f.value ? ` ${styles.tabOn}` : ''}`}
                    onClick={() => setStatus(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ListView({ jobs }: { jobs: JobViewItem[] }) {
  if (jobs.length === 0) return <p className="empty-state">No jobs here.</p>;
  return (
    <div className="job-list">
      {jobs.map((job) => (
        <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className="job-row">
          <div className="job-row-header">
            <span className="job-ref">{job.ref}</span>
            <StatusBadge job={job} />
          </div>
          <div className="job-client">{job.clientName}</div>
          <div className="job-row-header" style={{ marginTop: '0.4rem' }}>
            <span className="job-meta">
              {job.address || 'No address on file'}
              {' · '}Estimated hours: {job.estimatedHours ? `${job.estimatedHours} hrs` : 'Not set'}
            </span>
            {job.quotedAmount > 0 ? <span className="job-quoted">{job.quotedLabel}</span> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}

function BoardView({ jobs }: { jobs: JobViewItem[] }) {
  return (
    <div className={styles.board}>
      {BOARD_COLUMNS.map((col) => {
        const items = jobs.filter((j) => j.status === col.status);
        return (
          <section key={col.status} className={`${styles.column} ${styles[`col_${col.status}`]}`}>
            <header className={styles.columnHeader}><h3>{col.label}</h3><span>{items.length}</span></header>
            <div className={styles.cards}>
              {items.map((job) => (
                <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className={styles.jobCard}>
                  <div className={styles.cardTop}><strong>{job.clientName}</strong><StatusBadge job={job} /></div>
                  <span className={styles.cardRef}>{job.ref}</span>
                  <p className={styles.cardAddr}>{job.address || 'No address on file'}</p>
                  <div className={styles.cardFoot}>
                    <span>{job.scheduledLabel || 'No date set'}</span>
                    {job.quotedAmount > 0 ? <span className={styles.cardMoney}>{job.quotedLabel}</span> : null}
                  </div>
                </Link>
              ))}
              {items.length === 0 && <p className={styles.empty}>None</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

type SortKey = 'ref' | 'client' | 'status' | 'scheduled' | 'value';
function TableView({ jobs }: { jobs: JobViewItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('ref');
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const rows = [...jobs];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'ref') cmp = a.ref.localeCompare(b.ref);
      else if (sortKey === 'client') cmp = a.clientName.localeCompare(b.clientName);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortKey === 'scheduled') cmp = (a.scheduledLabel ? 1 : 0) - (b.scheduledLabel ? 1 : 0) || a.createdAt.localeCompare(b.createdAt);
      else if (sortKey === 'value') cmp = a.quotedAmount - b.quotedAmount;
      return asc ? cmp : -cmp;
    });
    return rows;
  }, [jobs, sortKey, asc]);

  function sortBy(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(true); }
  }
  const arrow = (key: SortKey) => (sortKey === key ? (asc ? ' ▲' : ' ▼') : '');

  if (jobs.length === 0) return <p className="empty-state">No jobs here.</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.jobTable}>
        <thead>
          <tr>
            <th><button type="button" onClick={() => sortBy('ref')}>Ref{arrow('ref')}</button></th>
            <th><button type="button" onClick={() => sortBy('client')}>Client{arrow('client')}</button></th>
            <th><button type="button" onClick={() => sortBy('status')}>Stage{arrow('status')}</button></th>
            <th><button type="button" onClick={() => sortBy('scheduled')}>Scheduled{arrow('scheduled')}</button></th>
            <th className={styles.numCol}><button type="button" onClick={() => sortBy('value')}>Quoted{arrow('value')}</button></th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((job) => (
            <tr key={job.id}>
              <td className={styles.tMono}>{job.ref}</td>
              <td><Link href={`/dashboard/jobs/${job.id}`} className={styles.tName}>{job.clientName}</Link></td>
              <td><StatusBadge job={job} /></td>
              <td className={styles.tMuted}>{job.scheduledLabel || '—'}</td>
              <td className={styles.numCol}>{job.quotedAmount > 0 ? job.quotedLabel : '—'}</td>
              <td><Link href={`/dashboard/jobs/${job.id}`} className={styles.tOpen}>Open →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
