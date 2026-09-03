'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { JobDetailDto } from '@/lib/job-detail';
import type { MapPin } from '@/components/pin-map';
import PinMap from '@/components/pin-map';
import { pinRecordId } from '@/lib/reveal-row';
import { mapEmptyNote, scopePinsToFilter } from '@/lib/map-pin-scope';
import { nextTabIndex } from '@/lib/tab-strip';
import ActionIcon from '@/components/action-icon';
import RecordPhotos from '../RecordPhotos';
import {
  JOB_SORTS,
  JOB_STAGES,
  jobStageLabel,
  matchesQuery,
  scheduleNote,
  sortQueue,
  stageCounts,
  type QueueSort,
  type StageFilter,
} from '@/lib/job-queue';
import type { JobViewItem } from './JobsWorkspace';
import { focusQueueRow, useQueueWindow } from '../use-queue-window';
import { useJobDetail } from './use-job-detail';
import JobDetailTabs, { JOB_TABS, JobDetailSkeleton, marginClass, type JobTabId } from './JobDetailTabs';
import { updateJobAddressAction, updateJobClientNameAction } from './actions';
import { QuickEditAddressModal, QuickEditNameModal, quickEditStyles } from '@/components/quick-edit';
import { useRouter } from 'next/navigation';
import focusStyles from '../focus.module.css';
import styles from '../smoothie.module.css';

/**
 * Smoothie on Jobs — Focus, led by the queue instead of by one job.
 *
 * Same data, same panels, same look as the Leads version, because it is the
 * same view: it shares ../smoothie.module.css, it renders the same
 * JobDetailTabs that Focus does, and it loads them through the same
 * useJobDetail hook. What it changes is the order you meet things in. Focus
 * opens with a full-width map and one job below it; the first question on this
 * page is "what am I doing next, and who still owes me" — a map answers
 * neither. So the queue comes first, and the map becomes a mode of the
 * right-hand pane rather than a band above everything.
 *
 * The rules it keeps from Leads:
 *   * ONE set of stage words and numbers. lib/job-queue owns them, so a chip, a
 *     row badge and the pane header cannot disagree.
 *   * One scroll context. Nothing here has its own scrollbar. On a phone the
 *     queue and the detail are separate screens rather than a detail buried
 *     under a long list. The queue keeps that rule by having an END instead:
 *     one page of rows and a control for the rest. See @/lib/queue-window.
 *   * The pane is READ-ONLY, exactly as Focus is. Every action deep-links to
 *     the full job page: mutating money from a surface with a client-held cache
 *     means cache invalidation plus optimistic rollback on money, which is not
 *     a trade worth making for a preview.
 */

export default function JobSmoothieView({
  jobs,
  onSelect,
  openRequest,
  details,
  basePath = '/dashboard',
  todayKey,
  mapPins = [],
  mapTheme = 'dark',
  gear,
  followupButton,
  initialStage = 'all',
  initialSort = 'soonest',
}: {
  jobs: JobViewItem[];
  onSelect?: (jobId: string | null) => void;
  openRequest?: { id: string; nonce: number } | null;
  details?: Record<string, JobDetailDto>;
  basePath?: string;
  /** Today, decided on the server so "Soonest first" cannot disagree with the
      clock the rest of the page rendered against. */
  todayKey: string;
  mapPins?: MapPin[];
  mapTheme?: 'dark' | 'light';
  gear?: ReactNode;
  followupButton?: ReactNode;
  /** Where a ?status= / ?owing=1 deep link wants the queue to open. Seeds, not
      controls — the chips and the Sort menu own them from the first render on. */
  initialStage?: StageFilter;
  initialSort?: QueueSort;
}) {
  const base = basePath;

  const [stage, setStage] = useState<StageFilter>(initialStage);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<QueueSort>(initialSort);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sortOpen]);

  const currentSort = JOB_SORTS.find((s) => s.id === sort) ?? JOB_SORTS[0];

  const [pane, setPane] = useState<'jobs' | 'map'>('jobs');
  const [onDetailScreen, setOnDetailScreen] = useState(false);
  const [tab, setTab] = useState<JobTabId>('overview');
  // Roving tabindex needs somewhere to send focus when an arrow moves the
  // selection — see nextTabIndex.
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [markerJob, setMarkerJob] = useState<string | null>(null);

  const backRef = useRef<HTMLButtonElement | null>(null);

  const counts = useMemo(() => stageCounts(jobs), [jobs]);

  const shown = useMemo(() => {
    const filtered = jobs.filter(
      (job) => (stage === 'all' || job.status === stage) && matchesQuery(job, query),
    );
    return sortQueue(filtered, sort, todayKey);
  }, [jobs, stage, query, sort, todayKey]);

  /**
   * THE STAGE CHIPS DID NOT REACH THE MAP — AND THIS IS THE DEFAULT VIEW.
   *
   * JobsWorkspace scopes the pins it hands out, but off ITS status filter, which
   * is the toolbar on the other five layouts. Smoothie has its own chips and its
   * own search, holds them in its own state, and passed the pins straight to the
   * map. So the fix that made the jobs map obey a filter never applied to the
   * view most people are looking at: "Complete 53 of 86" in the queue, "Map 27"
   * on the pane switch beside it, unmoved.
   *
   * Same rule as the leads queue, from the same place. See lib/map-pin-scope.
   */
  const queueFiltered = stage !== 'all' || query.trim() !== '';
  const shownJobIds = useMemo(() => new Set(shown.map((job) => job.id)), [shown]);
  const scopedPins = useMemo(
    () => scopePinsToFilter(mapPins, 'job', shownJobIds, queueFiltered),
    [mapPins, shownJobIds, queueFiltered],
  );

  // Opens on the head of the QUEUE, not on jobs[0]. "Soonest first" puts
  // tomorrow's work at the top and finished work at the bottom, so jobs[0] is
  // routinely a long way down it — the pane showed one job while the orange row
  // sat forty rows below, and the window would have had to open that far.
  const [selectedId, setSelectedId] = useState<string | null>(shown[0]?.id ?? null);
  const selected = useMemo(() => jobs.find((job) => job.id === selectedId) ?? null, [jobs, selectedId]);

  // How much of the queue is drawn. The whole thing was, which at a hundred
  // jobs is a column several times the height of the pane beside it.
  const selectedIndex = useMemo(() => shown.findIndex((job) => job.id === selectedId), [shown, selectedId]);
  const win = useQueueWindow({
    total: shown.length,
    selectedIndex,
    resetKey: `${stage}|${sort}|${query}`,
    plural: 'jobs',
    pageSize: 10,
  });
  const visible = useMemo(() => shown.slice(0, win.end), [shown, win.end]);

  const { detail, loading, error, armPrefetch, cancelPrefetch } = useJobDetail({ selectedId, jobs, details });

  // Only the work: scheduled and unscheduled jobs. A lead pin belongs to the
  // leads page and is one legend click away — see PinMap's initialHidden.
  const router = useRouter();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const jobPinCount = useMemo(() => scopedPins.filter((pin) => pin.kind !== 'lead').length, [scopedPins]);
  const [visiblePins, setVisiblePins] = useState<number | null>(null);
  const mapCount = visiblePins ?? jobPinCount;

  useEffect(() => {
    onSelect?.(selectedId);
  }, [selectedId, onSelect]);

  const select = useCallback((id: string, { fromMobileList = false }: { fromMobileList?: boolean } = {}) => {
    setSelectedId(id);
    setTab('overview');
    if (fromMobileList) {
      setOnDetailScreen(true);
      requestAnimationFrame(() => backRef.current?.focus());
    }
  }, []);

  const selectRef = useRef(select);
  selectRef.current = select;

  useEffect(() => {
    if (!openRequest) return;
    if (!jobs.some((job) => job.id === openRequest.id)) return;
    selectRef.current(openRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  // Arrowing past the last drawn row selects the next one anyway — selecting
  // always draws it — so the window opens under the keyboard rather than the
  // queue ending early for anyone not using a mouse.
  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, JOB_TABS.findIndex((t) => t.id === tab), JOB_TABS.length);
    if (next === null) return;
    event.preventDefault();
    const id = JOB_TABS[next].id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  function onQueueKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = shown.findIndex((job) => job.id === selectedId);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next < 0 || next >= shown.length) return;
    select(shown[next].id);
    focusQueueRow(`job-row-${shown[next].id}`, next < win.end);
  }

  // Reveal, then land on the first row that appeared. Without it the button can
  // be the last thing revealed away, leaving focus on nothing.
  function reveal(all: boolean) {
    const first = shown[win.nextIndex];
    if (all) win.showAll();
    else win.showMore();
    if (first) focusQueueRow(`job-row-${first.id}`, false);
  }

  // Rows stay real links so cmd/middle-click opens the full job page and the
  // URL is copyable. A plain <button> would silently kill both.
  function rowClick(event: React.MouseEvent, id: string, mobile: boolean) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    select(id, { fromMobileList: mobile });
  }

  if (jobs.length === 0) {
    return <p className="empty-state">No jobs yet. Create your first job below.</p>;
  }

  const fresh = detail && detail.id === selectedId ? detail : null;

  return (
    <div className={styles.smoothie} data-pane={pane} data-screen={onDetailScreen ? 'detail' : 'list'}>
      {/* --- stage filters: one set of words, one set of numbers --- */}
      <div className={styles.stageBar} role="group" aria-label="Filter by job stage">
        <StageChip id="all" label="All jobs" count={counts.all} active={stage === 'all'} onPick={setStage} />
        {JOB_STAGES.map((entry) => (
          <StageChip
            key={entry.id}
            id={entry.id}
            label={entry.label}
            count={counts[entry.id]}
            active={stage === entry.id}
            onPick={setStage}
          />
        ))}
      </div>

      {/* --- search / sort / pane switch --- */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <label className={styles.srOnly} htmlFor="job-smoothie-search">Search jobs by customer, job number, work or address</label>
          <input
            id="job-smoothie-search"
            type="search"
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customer, job number, work or town"
          />
        </div>

        <div className={styles.paneSwitch} role="group" aria-label="Show jobs or the map">
          <button type="button" className={styles.paneBtn} aria-pressed={pane === 'jobs'} onClick={() => setPane('jobs')}>
            Jobs
          </button>
          <button type="button" className={styles.paneBtn} aria-pressed={pane === 'map'} onClick={() => setPane('map')}>
            Map <span className={styles.paneCount}>{mapCount}</span>
          </button>
        </div>

        {gear ? <div className={styles.gearSlot}>{gear}</div> : null}
      </div>

      {/* Filter results only — the window count moves on every arrow keypress
          past the window edge, so it is read at the foot of the list instead of
          announced over each row. See LeadSmoothieView. */}
      <p className={styles.srOnly} role="status">
        {shown.length} of {jobs.length} jobs match.
      </p>

      <div className={styles.body}>
        {/* --- the queue --- */}
        <section className={styles.queue} aria-label="Job queue">
          <div className={`${styles.queueHead} ${styles.queueHeadTwoRows}`}>
            <div className={styles.queueHeadTop}>
              <div className={styles.queueHeadLeft}>
                <h2 className={styles.queueTitle}>Job queue</h2>
                <span className={styles.queueCount}>
                  {shown.length === jobs.length ? `${jobs.length}` : `${shown.length} of ${jobs.length}`}
                </span>
              </div>
              {followupButton}
            </div>

            <div className={styles.queueHeadActions}>
              <div className={styles.sortPopupWrap} ref={sortRef}>
                <button
                  type="button"
                  className={styles.sortToggleBtn}
                  onClick={() => setSortOpen((prev) => !prev)}
                  aria-expanded={sortOpen}
                  aria-haspopup="menu"
                  title="Sort jobs"
                >
                  <span className={styles.sortToggleLabelGroup}>
                    <svg
                      className={styles.filterIcon}
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    <span className={styles.sortCurrentLabel}>{currentSort.label}</span>
                  </span>
                  <span className={styles.sortChevron} aria-hidden="true">▾</span>
                </button>

                {sortOpen && (
                  <div className={styles.sortMenu} role="menu">
                    <div className={styles.sortMenuTitle}>Sort jobs</div>
                    {JOB_SORTS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === option.id}
                        className={`${styles.sortMenuItem}${sort === option.id ? ` ${styles.sortMenuItemActive}` : ''}`}
                        onClick={() => {
                          setSort(option.id as QueueSort);
                          setSortOpen(false);
                        }}
                      >
                        <span>{option.label}</span>
                        {sort === option.id && <span className={styles.sortCheck} aria-hidden="true">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className={styles.emptyQueue}>
              {query.trim() && stage !== 'all' ? (
                <p style={{ margin: 0 }}>
                  No jobs found in <strong>{jobStageLabel(stage)}</strong> matching &ldquo;{query}&rdquo;.
                  {' '}
                  <button type="button" className={styles.clearBtn} onClick={() => setStage('all')}>
                    Search all jobs
                  </button>
                  {' · '}
                  <button type="button" className={styles.clearBtn} onClick={() => { setQuery(''); setStage('all'); }}>
                    Reset filters
                  </button>
                </p>
              ) : query.trim() ? (
                <p style={{ margin: 0 }}>
                  No jobs matching &ldquo;{query}&rdquo;.{' '}
                  <button type="button" className={styles.clearBtn} onClick={() => setQuery('')}>
                    Clear search
                  </button>
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  No jobs currently in <strong>{jobStageLabel(stage)}</strong>.{' '}
                  <button type="button" className={styles.clearBtn} onClick={() => setStage('all')}>
                    Show all jobs
                  </button>
                </p>
              )}
            </div>
          ) : (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
            <ul className={styles.rows} onKeyDown={onQueueKeyDown}>
              {visible.map((job) => {
                const on = job.id === selectedId;
                const when = scheduleNote(job, todayKey);
                return (
                  <li key={job.id}>
                    <a
                      id={`job-row-${job.id}`}
                      href={`${base}/jobs/${job.id}`}
                      className={`${styles.row}${on ? ` ${styles.rowOn}` : ''}`}
                      aria-current={on ? 'true' : undefined}
                      onClick={(event) => rowClick(event, job.id, !isWide())}
                      onMouseEnter={() => armPrefetch(job.id)}
                      onMouseLeave={cancelPrefetch}
                    >
                      <span className={`${styles.rowDot} ${styles.jobDot}`} data-stage={job.status} aria-hidden="true" />
                      <span className={styles.rowMain}>
                        <span className={styles.rowTop}>
                          <strong className={styles.rowName}>{job.clientName || 'Untitled job'}</strong>
                          {/* The stage as a word, never only a color. */}
                          <span className={styles.rowHeat} data-stage={job.status}>{jobStageLabel(job.status)}</span>
                        </span>
                        <span className={styles.rowDetail}>{job.scope || job.address || 'No description yet'}</span>
                        <span className={styles.rowMeta}>
                          <span className={styles.rowStage} data-stage={job.status}>{job.ref}</span>
                          <span className={styles.rowWait}>
                            {job.scheduledLabel ? `${job.scheduledLabel} · ${when}` : when}
                          </span>
                          {job.invoiceStatusLabel ? <span className={styles.rowPref}>{job.invoiceStatusLabel}</span> : null}
                        </span>
                      </span>
                      {job.quotedAmount > 0 ? <span className={styles.rowValue}>{job.quotedLabel}</span> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}

          {/* The end of the list, and the way past it. "Show all" only appears
              while more than one page is left — with three rows to go it would
              be a second button that does exactly what the first one does. */}
          {win.truncated ? (
            <div className={styles.more}>
              <p className={styles.moreCount}>{win.countLabel}</p>
              <button type="button" className={styles.moreBtn} onClick={() => reveal(false)}>
                {win.moreLabel}
              </button>
              {win.step < win.hidden ? (
                <button type="button" className={styles.moreAll} onClick={() => reveal(true)}>
                  {win.allLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* --- the right pane: the selected job, or the map --- */}
        <section className={styles.detail} aria-label={pane === 'map' ? 'Job map' : 'Selected job'}>
          <button type="button" ref={backRef} className={styles.backBtn} onClick={() => setOnDetailScreen(false)}>
            ← Back to jobs
          </button>

          {pane === 'map' ? (
            <div className={styles.mapPane}>
              <div className={styles.mapHead}>
                <h2 className={styles.paneTitle}>Where the work is</h2>
                {/* The standing note describes the UNFILTERED map, and stopped
                    being true the moment the map started obeying the chips. */}
                <p className={styles.mapNote}>
                  {queueFiltered
                    ? 'The jobs matching your filter. Clear it to see every booked and unbooked job.'
                    : 'Booked and unbooked jobs. Leads are switched off — turn them on in the legend.'}
                </p>
              </div>
              <PinMap
                pins={scopedPins}
                theme={mapTheme}
                initialHidden={['lead']}
                emptyNote={mapEmptyNote('job', queueFiltered)}
                spreadOverlap
                onVisibleCountChange={setVisiblePins}
                focusPinId={selectedId ? `job-${selectedId}` : null}
                onPinClick={(pin) => {
                  const id = pinRecordId(pin.id, 'job');
                  if (!id) return; // lead pins belong to the leads page
                  if (!jobs.some((job) => job.id === id)) return; // filtered out
                  select(id);
                  setMarkerJob(id);
                }}
              />
              {markerJob && selected ? (
                <div className={styles.markerBar}>
                  <span>Selected <strong>{selected.clientName}</strong> on the map.</span>
                  <button type="button" className="btn secondary" onClick={() => setPane('jobs')}>
                    Open job details
                  </button>
                </div>
              ) : null}
            </div>
          ) : selected ? (
            <>
              {/* 1 — who and what */}
              <header className={styles.detailHead}>
                <div className={styles.recordHeadLayout}>
                  <RecordPhotos
                    kind="job"
                    recordId={selected.id}
                    subject={selected.scope}
                    photoUrl={fresh?.photos[0]?.url ?? null}
                    photoCount={selected.photoCount}
                    photoTotal={fresh?.photoCount}
                    title={`Photos · ${selected.clientName || selected.ref}`}
                    emptyLabel="No photos yet. Add progress shots or before/after photos."
                    canOpen={base === '/dashboard'}
                  />
                  <div className={styles.recordHeadCopy}>
                    <p className={focusStyles.heroTag}>Selected job</p>
                    <div className={quickEditStyles.headerTitleRow}>
                      <h2 className={styles.detailName}>{selected.clientName || 'Untitled job'}</h2>
                      <button
                        type="button"
                        className={quickEditStyles.quickEditBtn}
                        onClick={() => setIsEditingName(true)}
                        aria-label="Edit client name"
                      >
                        Edit
                      </button>
                    </div>
                    <p className={styles.detailProject}>{selected.scope || 'No description yet'}</p>

                    {/* 2 — stage, reference, what the badge says */}
                    <div className={styles.detailChips}>
                      <span className={`status-badge status-${selected.badgeTone}`} title={selected.badgeTitle || undefined}>
                        {selected.badgeLabel}
                      </span>
                      <span className={styles.detailStage} data-stage={selected.status}>
                        {jobStageLabel(selected.status)}
                      </span>
                      <span className={styles.jobRefChip}>{selected.ref}</span>
                    </div>
                  </div>
                </div>

                {/* 3 — the four facts that decide what you do next. Straight off
                    the row the server shipped, so they are on screen the instant
                    you click rather than after a request. */}
                <dl className={styles.facts}>
                  <div>
                    <dt>Scheduled</dt>
                    <dd>{selected.scheduledLabel ?? 'No date set'}</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd className={quickEditStyles.defRow}>
                      <span>{selected.address || 'No address on file'}</span>
                      <button
                        type="button"
                        className={quickEditStyles.quickEditBtn}
                        onClick={() => setIsEditingAddress(true)}
                        aria-label="Edit job address"
                      >
                        Edit
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Quoted</dt>
                    <dd>{selected.quotedAmount > 0 ? selected.quotedLabel : 'No quote yet'}</dd>
                  </div>
                  <div>
                    <dt>Balance due</dt>
                    <dd className={styles.waiting}>{selected.outstandingLabel}</dd>
                  </div>
                </dl>
              </header>

              {/* 4 — what you actually do with a job */}
              <div className={styles.comms}>
                <p className={styles.commsNote}>
                  {selected.estimatedHours ? `Estimated ${selected.estimatedHours} hrs of labor.` : 'No labor estimate on this job yet.'}
                </p>
                <div className={styles.commsRow}>
                  <Link className="action-btn action-btn--lead" href={`${base}/jobs/${selected.id}`}>
                    <ActionIcon name="job" />
                    Open job →
                  </Link>
                  <Link className="action-btn action-btn--money-in" href={`${base}/jobs/${selected.id}?open=payment#request-payment`}>
                    <ActionIcon name="payment" />
                    Request payment
                  </Link>
                  <Link className="action-btn action-btn--money-out" href={`${base}/jobs/${selected.id}?open=costs`}>
                    <ActionIcon name="expense" />
                    Add expense
                  </Link>
                </div>
              </div>

              {/* 5 — the detail tabs, the same five Focus shows */}
              {/* The roving tabindex below was here from the start; the arrows
                  that make it navigable were not, so every tab but the open one
                  was unreachable from a keyboard. See nextTabIndex. */}
              <div className={focusStyles.tabs} role="tablist" aria-label="Job detail sections" onKeyDown={onTabKeyDown}>
                {JOB_TABS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    id={`job-smoothie-tab-${entry.id}`}
                    aria-selected={tab === entry.id}
                    aria-controls="job-smoothie-tabpanel"
                    tabIndex={tab === entry.id ? 0 : -1}
                    ref={(el) => { tabRefs.current[entry.id] = el; }}
                    className={`${focusStyles.tab}${tab === entry.id ? ` ${focusStyles.tabOn}` : ''}`}
                    onClick={() => setTab(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              <div
                className={styles.tabBody}
                id="job-smoothie-tabpanel"
                role="tabpanel"
                aria-labelledby={`job-smoothie-tab-${tab}`}
                tabIndex={0}
                key={selected.id}
              >
                {error ? (
                  <p className={focusStyles.error}>{error}</p>
                ) : loading || !fresh ? (
                  <JobDetailSkeleton />
                ) : (
                  <JobDetailTabs tab={tab} detail={fresh} job={selected} base={base} headingLevel={3} />
                )}
              </div>

              {/* 6 — the money strip, as Focus has it */}
              <footer className={focusStyles.moneyStrip}>
                <span><small>Materials</small><strong>{fresh ? fresh.money.materialsLabel : '—'}</strong></span>
                <span><small>Labor</small><strong>{fresh ? fresh.money.laborLabel : '—'}</strong></span>
                <span><small>Overhead</small><strong>{fresh ? fresh.money.overheadLabel : '—'}</strong></span>
                <span>
                  <small>Profit margin</small>
                  <strong className={fresh && fresh.costCount > 0 ? marginClass(fresh.money.marginPct) : undefined}>
                    {fresh ? fresh.money.marginLabel : '—'}
                  </strong>
                </span>
                <span className={focusStyles.moneyStripEnd}>
                  <small>Quoted</small>
                  <strong>{selected.quotedAmount > 0 ? selected.quotedLabel : '—'}</strong>
                </span>
              </footer>
              <QuickEditNameModal
                isOpen={isEditingName}
                onClose={() => setIsEditingName(false)}
                title="Edit client name"
                label="Client name"
                initialName={selected.clientName}
                onSave={async (newName) => {
                  await updateJobClientNameAction(selected.id, newName);
                  router.refresh();
                }}
              />
              <QuickEditAddressModal
                isOpen={isEditingAddress}
                onClose={() => setIsEditingAddress(false)}
                title="Edit job address"
                label="Job address"
                initialAddress={selected.address}
                onSave={async (newAddress) => {
                  await updateJobAddressAction(selected.id, newAddress);
                  router.refresh();
                }}
              />
            </>
          ) : (
            <p className="empty-state">Pick a job from the queue.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Whether both columns are on screen. Read at click time rather than held in
 * state — the only thing it decides is whether a click ALSO moves to the mobile
 * detail screen. Matches the breakpoint in ../smoothie.module.css.
 */
function isWide(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(min-width: 921px)').matches;
}

function StageChip({
  id,
  label,
  count,
  active,
  onPick,
}: {
  id: StageFilter;
  label: string;
  count: number;
  active: boolean;
  onPick: (next: StageFilter) => void;
}) {
  return (
    <button type="button" className={styles.stageChip} aria-pressed={active} onClick={() => onPick(id)}>
      {label}
      <span className={styles.stageCount}>{count}</span>
    </button>
  );
}
