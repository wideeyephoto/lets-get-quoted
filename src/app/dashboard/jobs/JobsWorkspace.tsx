'use client';

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { JobStatus } from '@/lib/jobs';
import type { QueueSort, StageFilter } from '@/lib/job-queue';
import { setJobsViewAction, setMapThemeAction, setMapViewAction } from '@/app/dashboard/view-actions';
import type { JobsView, MapTheme, MapView } from '@/lib/dashboard-views';
import ViewGear from '@/components/view-gear';
import { pinRecordId, revealRow } from '@/lib/reveal-row';
import { scopePinsToFilter } from '@/lib/map-pin-scope';
import PinMap, { type MapPin } from '@/components/pin-map';
import FocusView from './FocusView';
import JobSmoothieView from './JobSmoothieView';
import FieldIntakeHint from '@/components/field-intake-hint';
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
  /** The raw start date, 'YYYY-MM-DD'. The label is for reading; this is what
      "Soonest first" sorts on — a printed "Aug 3" cannot be compared. */
  scheduledFor: string | null;
  quotedAmount: number;
  quotedLabel: string;
  /** outstandingLabel as a number, so "Most owed" can order by it. */
  outstandingAmount: number;
  estimatedHours: number | null;
  createdAt: string;
  // Money the server already had in hand. Lets the Focus pane answer "what do
  // they still owe me" with zero network on selection.
  outstandingLabel: string;
  paidLabel: string;
  invoiceRef: string | null;
  invoiceStatusLabel: string | null;
  // Enough to draw a job's cover before any detail request: what the job is
  // (picks the trade glyph) and whether a real photo is on its way.
  scope: string | null;
  photoCount: number;
};

// Smoothie leads, because it's the default — the list in the menu should open
// on the layout you are already looking at rather than making you find it.
const VIEWS = [
  { id: 'smoothie' as const, label: 'Smoothie', hint: 'The queue first, one job beside it' },
  { id: 'focus' as const, label: 'Focus', hint: 'One job open, list beside it' },
  { id: 'list' as const, label: 'List', hint: 'The classic stacked list' },
  { id: 'board' as const, label: 'Board', hint: 'Kanban by stage' },
  { id: 'table' as const, label: 'Table', hint: 'Sort & scan' },
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

export default function JobsWorkspace({
  headingTitle,
  headingTag = 'h1',
  eyebrow,
  jobs,
  initialView,
  mapView,
  mapTheme,
  mapPins,
  todayKey,
  toolbarAccessory,
  basePath = '/dashboard',
  readOnly = false,
  details,
  initialStatus = 'all',
  initialSort = 'soonest',
}: {
  headingTitle?: string;
  headingTag?: 'h1' | 'h2';
  eyebrow?: string;
  jobs: JobViewItem[];
  /**
   * Pre-loaded job detail, keyed by id. Supplying it makes the Focus and
   * Smoothie panes read from memory instead of calling /api/jobs/[id]/detail —
   * which is what lets the logged-out demo render the real workspace.
   */
  details?: Record<string, import('@/lib/job-detail').JobDetailDto>;
  initialView: JobsView;
  mapView: MapView;
  mapTheme: MapTheme;
  mapPins: MapPin[];
  todayKey: string;
  toolbarAccessory?: ReactNode;
  basePath?: string;
  /**
   * Where a deep link wants the workspace to open — ?status= for the stage,
   * ?owing=1 for "Most owed". Seeds only: once here you can filter and sort
   * freely, and the URL is not rewritten as you do. Both layouts get them,
   * because Smoothie is the default and keeps its own chips and sort.
   */
  initialStatus?: StageFilter;
  initialSort?: QueueSort;
  /**
   * The logged-out demo. Nothing on this workspace writes customer data — the
   * only three actions here REMEMBER a layout choice in a cookie, and each one
   * starts with requireOwnerContext. Left alone, picking a view on the public
   * demo navigates a prospect to /login mid-browse. So under readOnly the view
   * still changes; it just is not persisted, which is exactly right for
   * somebody with no account to persist it to.
   */
  readOnly?: boolean;
}) {
  const [view, setView] = useState<JobsView>(initialView);
  /* Seeded only into the layouts whose toolbar actually drives it. Smoothie
     keeps its own chips — it gets initialStage below and scopes its own pins
     off them — and board deliberately lists everything and hides the toolbar.
     In either one a seeded `status` would narrow scopedPins with no control on
     screen to widen it again, so a deep link like ?status=complete would leave
     the map empty and unrecoverable under a list showing every job. */
  const [status, setStatus] = useState<JobStatus | 'all'>(
    initialView === 'smoothie' || initialView === 'board' ? 'all' : initialStatus,
  );
  // Which job the Focus pane has open, so the map can center on it.
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  // Stable identity: FocusView calls this from an effect, so a new function
  // every render would re-fire it on every render.
  const onFocusSelect = useCallback((id: string | null) => setFocusJobId(id), []);
  // A pin click asks the Focus pane to open that job. The nonce makes clicking
  // the same pin twice count twice — otherwise re-clicking a job you're already
  // on wouldn't bring the pane back into view.
  const [pinRequest, setPinRequest] = useState<{ id: string; nonce: number } | null>(null);

  const onPinClick = useCallback((pin: MapPin) => {
    const jobId = pinRecordId(pin.id, 'job');
    if (!jobId) return; // lead pins live on the leads page
    // Focus shows one job at a time, so "go to it" means open it. The other
    // layouts are lists, so it means scroll to its row.
    setPinRequest((prev) => ({ id: jobId, nonce: (prev?.nonce ?? 0) + 1 }));
    revealRow(`job-row-${jobId}`);
  }, []);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Global 'J' shortcut to open new job drawer / form
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'j' || e.key === 'J') {
        const target = e.target as HTMLElement | null;
        const isFormInput =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target?.isContentEditable;
        if (!isFormInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const newJobEl = document.getElementById('new-job');
          if (newJobEl instanceof HTMLDetailsElement) {
            e.preventDefault();
            newJobEl.open = true;
            newJobEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            newJobEl.querySelector<HTMLInputElement>('input[name="clientName"], input[name="clientPhone"]')?.focus({ preventScroll: true });
          }
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  // Real-time job status updates via Supabase Realtime channel
  useEffect(() => {
    if (readOnly) return;
    try {
      const channel = supabase
        .channel('jobs-realtime-feed')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'jobs' },
          () => {
            router.refresh();
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Jobs realtime subscription error:', err);
    }
  }, [router, readOnly]);

  // Local layout state, so the demo's pickers work without a cookie to write.
  const [localMapView, setLocalMapView] = useState<MapView>(mapView);
  const [localMapTheme, setLocalMapTheme] = useState<MapTheme>(mapTheme);
  const effectiveMapView = readOnly ? localMapView : mapView;
  const effectiveMapTheme = readOnly ? localMapTheme : mapTheme;

  function pickView(next: JobsView) {
    setView(next);
    if (readOnly) return;
    startTransition(() => setJobsViewAction(next).catch(() => {}));
  }
  function setMap(next: MapView) {
    if (readOnly) {
      setLocalMapView(next);
      return;
    }
    startTransition(async () => {
      await setMapViewAction(next, 'jobs');
      router.refresh();
    });
  }
  function setTheme(next: MapTheme) {
    if (readOnly) {
      setLocalMapTheme(next);
      return;
    }
    startTransition(async () => {
      await setMapThemeAction(next);
      router.refresh();
    });
  }

  const filtered = useMemo(() => (status === 'all' ? jobs : jobs.filter((j) => j.status === status)), [jobs, status]);

  /* THE MAP FOLLOWS THE FILTER. It used to be handed the global pin set while
     the list beside it was filtered, so choosing Complete left "5 of 39" above
     a map still drawing 33 pins and a legend counting 37 places — three numbers
     on one screen, none of them wrong alone. See lib/map-pin-scope. */
  const visibleJobIds = useMemo(() => new Set(filtered.map((job) => job.id)), [filtered]);
  const scopedPins = useMemo(
    () => scopePinsToFilter(mapPins, 'job', visibleJobIds, status !== 'all'),
    [mapPins, visibleJobIds, status],
  );

  // The view/map gear sits on the map's legend row, matching the leads page. Down
  // in the filter bar its popover opened downwards into the panels below it and
  // was overlapped by them; on the legend row it opens over the map instead.
  // Anything the page wants beside the gear travels with it, so the two never
  // drift onto separate lines whichever branch renders the gear.
  const gear = (
    <div className={styles.gearRow}>
      {toolbarAccessory}
      <ViewGear
        views={VIEWS}
        activeView={view}
        onPickView={pickView}
        mapView={effectiveMapView}
        onSetMapView={setMap}
        mapTheme={effectiveMapTheme}
        onSetMapTheme={setTheme}
        label="View"
        // Mirrors normalizeJobsView / normalizeMapView / normalizeMapTheme.
        defaults={{ view: 'smoothie', mapView: 'large', mapTheme: 'dark' }}
      />
    </div>
  );

  const smoothieGear = (
    <ViewGear
      views={VIEWS}
      activeView={view}
      onPickView={pickView}
      mapView={effectiveMapView}
      onSetMapView={setMap}
      mapTheme={effectiveMapTheme}
      onSetMapTheme={setTheme}
      label="View"
      defaults={{ view: 'smoothie', mapView: 'large', mapTheme: 'dark' }}
    />
  );

  const HeadingTag = headingTag;
  const header = headingTitle ? (
    <div className={`section-heading workspace-section-heading ${styles.workspaceHeading}`}>
      <div className={styles.headingCopy}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <div className={styles.headingTitleRow}>
          <HeadingTag>{headingTitle}</HeadingTag>
          <a
            className={styles.newJobBtn}
            href="#new-job"
            onClick={(event) => {
              const target = document.getElementById('new-job');
              if (!(target instanceof HTMLDetailsElement)) return;
              event.preventDefault();
              target.open = true;
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              target.querySelector<HTMLInputElement>('input[name="clientName"], input[name="clientPhone"]')?.focus({ preventScroll: true });
            }}
          >
            + New job
          </a>
        </div>
      </div>
      <div className={styles.headerActions}>
        <FieldIntakeHint page="jobs" />
      </div>
    </div>
  ) : null;

  if (view === 'smoothie') {
    // Smoothie carries the gear in its own toolbar and the map in its own pane,
    // so the band above every other view is not drawn at all. Rendering it as
    // well would put a second map on the page and a second copy of the gear.
    return (
      <div className={pending ? styles.busy : undefined}>
        {header}
        <JobSmoothieView
          jobs={jobs}
          initialStage={initialStatus}
          initialSort={initialSort}
          todayKey={todayKey}
          mapPins={scopedPins}
          mapTheme={effectiveMapTheme}
          gear={smoothieGear}
          followupButton={toolbarAccessory}
          onSelect={onFocusSelect}
          openRequest={pinRequest}
          details={details}
          basePath={basePath}
        />
      </div>
    );
  }

  return (
    <div className={pending ? styles.busy : undefined}>
      {header}
      {/* The map shows in every view, Focus included. It was suppressed here on
          the grounds that getMapPins re-runs listJobs — but that cost is paid
          whenever the map is on in ANY view, so Focus was the wrong place to
          special-case it, and the gear went on showing Map as ticked while
          nothing rendered. A control that lies about its own state is worse
          than the query. */}
      {effectiveMapView === 'large' ? (
        <div className="workspace-embedded-map">
          <PinMap pins={scopedPins} theme={mapTheme} legendAccessory={gear} focusPinId={view === 'focus' && focusJobId ? `job-${focusJobId}` : null} onPinClick={onPinClick} />
        </div>
      ) : (
        // Map off: keep the gear reachable, or there'd be no way to turn it back on.
        <div className={styles.viewBar}>{gear}</div>
      )}

      {jobs.length === 0 ? (
        <p className="empty-state">No jobs yet. Create your first job below.</p>
      ) : (
        <>
          {view === 'list' && <ListView jobs={filtered} basePath={basePath} />}
          {view === 'board' && <BoardView jobs={jobs} basePath={basePath} />}
          {view === 'table' && <TableView jobs={filtered} basePath={basePath} />}
          {view === 'focus' && <FocusView jobs={filtered} onSelect={onFocusSelect} openRequest={pinRequest} details={details} basePath={basePath} />}

          {view !== 'board' ? (
            <div className={styles.bar}>
              {/* A FILTER, WHICH IS WHAT ITS OWN LABEL SAYS. It was a tablist
                  of tabs, and a tab is a promise: press me and a panel of
                  content appears in place of another. These narrow the list
                  that is already on screen — nothing is swapped, and there was
                  no aria-controls on any of them because there is no panel to
                  point at. On the Focus layout the page ended up announcing ten
                  tabs, five of them these.

                  Toggle buttons in a group, matching the stage chips in
                  LeadSmoothieView, which have always been the right shape for
                  the same job. aria-pressed also says the thing aria-selected
                  could not: a filter is on or off, not chosen out of a set. */}
              <div className={styles.tabs} role="group" aria-label="Filter jobs by status">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={status === f.value}
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

function ListView({ jobs, basePath }: { jobs: JobViewItem[]; basePath: string }) {
  if (jobs.length === 0) return <p className="empty-state">No jobs here.</p>;
  return (
    <div className="job-list">
      {jobs.map((job) => (
        <Link id={`job-row-${job.id}`} key={job.id} href={`${basePath}/jobs/${job.id}`} className="job-row">
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

function BoardView({ jobs, basePath }: { jobs: JobViewItem[]; basePath: string }) {
  return (
    <div className={styles.board}>
      {BOARD_COLUMNS.map((col) => {
        const items = jobs.filter((j) => j.status === col.status);
        return (
          <section key={col.status} className={`${styles.column} ${styles[`col_${col.status}`]}`}>
            <header className={styles.columnHeader}><h3>{col.label}</h3><span>{items.length}</span></header>
            <div className={styles.cards}>
              {items.map((job) => (
                <Link id={`job-row-${job.id}`} key={job.id} href={`${basePath}/jobs/${job.id}`} className={styles.jobCard}>
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
function TableView({ jobs, basePath }: { jobs: JobViewItem[]; basePath: string }) {
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
            <tr id={`job-row-${job.id}`} key={job.id}>
              <td className={styles.tMono}>{job.ref}</td>
              <td><Link href={`${basePath}/jobs/${job.id}`} className={styles.tName}>{job.clientName}</Link></td>
              <td><StatusBadge job={job} /></td>
              <td className={styles.tMuted}>{job.scheduledLabel || '—'}</td>
              <td className={styles.numCol}>{job.quotedAmount > 0 ? job.quotedLabel : '—'}</td>
              <td><Link href={`${basePath}/jobs/${job.id}`} className={styles.tOpen}>Open →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
