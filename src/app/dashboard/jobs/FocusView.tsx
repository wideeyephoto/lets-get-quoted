'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { JobDetailDto } from '@/lib/job-detail';
import type { JobViewItem } from './JobsWorkspace';
import RecordPhotos from '../RecordPhotos';
import ActionIcon from '@/components/action-icon';
import VoiceCaptureButton from '@/components/ai/VoiceCaptureButton';
import JobDetailTabs, { JOB_TABS, JobDetailSkeleton, marginClass, type JobTabId } from './JobDetailTabs';
import { useJobDetail } from './use-job-detail';
import { updateJobAddressAction, updateJobClientNameAction } from './actions';
import { QuickEditAddressModal, QuickEditNameModal, quickEditStyles } from '@/components/quick-edit';
import { nextTabIndex } from '@/lib/tab-strip';
import styles from '../focus.module.css';

// Master-detail view of the pipeline: one job open on the left, the whole list
// on the right, the way a contractor actually works a pipeline — read the top
// one, act, move down.
//
// Loading model, and why it's shaped like this:
//   * The header and money strip render from the JobViewItem the server already
//     shipped, so a click paints immediately with the answer to "what do they
//     owe me" — no spinner on the part you came for.
//   * Everything deeper (timeline, costs, checklist, photos) comes from
//     /api/jobs/[id]/detail behind a skeleton. Nobody needs a timeline in the
//     first 200ms.
//   * The pane is READ-ONLY on purpose. Every action deep-links to the full job
//     page. Mutating from a surface with a client-held cache means cache
//     invalidation plus optimistic rollback on money, which is not worth it for
//     a preview.

function StatusBadge({ job }: { job: JobViewItem }) {
  return (
    <span className={`status-badge status-${job.badgeTone}`} title={job.badgeTitle || undefined}>
      {job.badgeLabel}
    </span>
  );
}

export default function FocusView({
  jobs,
  onSelect,
  openRequest,
  details,
  basePath = '/dashboard',
}: {
  jobs: JobViewItem[];
  onSelect?: (jobId: string | null) => void;
  /** A pin on the map asking for a job; the nonce lets the same one repeat. */
  openRequest?: { id: string; nonce: number } | null;
  /**
   * Where this pane's links point. The logged-out demo renders this very
   * component, and every link in here used to be hardcoded to /dashboard — so a
   * prospect clicking "Open job", "Request payment" or "Add expense" was thrown
   * onto the login wall, mid-demo, with no explanation. It passes '/demo'.
   */
  basePath?: string;
  /**
   * Pre-loaded detail, keyed by job id. Supplying it makes the pane read from
   * memory instead of calling the API — which is what lets the logged-out demo
   * render THIS component rather than a replica of it that drifts.
   */
  details?: Record<string, JobDetailDto>;
}) {
  const base = basePath;
  const [pickedId, setPickedId] = useState<string | null>(jobs[0]?.id ?? null);
  const [tab, setTab] = useState<JobTabId>('overview');
  const paneRef = useRef<HTMLElement | null>(null);
  // Roving tabindex needs somewhere to send focus when an arrow moves the
  // selection — see nextTabIndex.
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, JOB_TABS.findIndex((t) => t.id === tab), JOB_TABS.length);
    if (next === null) return;
    event.preventDefault();
    const id = JOB_TABS[next].id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  const router = useRouter();
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);

  /**
   * THE FILTER MOVES AND THE SELECTION HAS TO MOVE WITH IT.
   *
   * `jobs` here is the FILTERED list. Filtering to "Complete 5" while an
   * in-progress job was open left that job selected: the list showed five
   * finished jobs and everything keyed off the selection still pointed at a
   * sixth that was no longer in it — the detail request, the map centering, and
   * the arrow keys, which searched a list the selection was not in and jumped
   * to the top on the first press.
   *
   * Derived rather than corrected in an effect. An effect would render one
   * frame of the wrong pane first and fire a detail fetch for a job that is
   * about to be dropped; falling back during render means there is never a
   * moment when the pane and the list disagree.
   *
   * `pickedId` is still what the visitor CHOSE, so returning to "All" reopens
   * the job they had rather than the first row.
   */
  const selected = useMemo(() => {
    if (jobs.length === 0) return null;
    return jobs.find((j) => j.id === pickedId) ?? jobs[0];
  }, [jobs, pickedId]);
  const selectedId = selected?.id ?? null;

  // The cache, the debounce, the abort and the stale-response guard now live
  // in useJobDetail so Smoothie runs the same code rather than a second copy.
  // Nothing about the behavior moved with them.
  const { detail, loading, error, armPrefetch, cancelPrefetch } = useJobDetail({ selectedId, jobs, details });

  // Opened from the map. Goes through the same path as a click on the list, so
  // the pane scrolls into view and the row centers itself exactly as it would.
  useEffect(() => {
    if (!openRequest) return;
    if (!jobs.some((j) => j.id === openRequest.id)) return; // filtered out
    selectRef.current(openRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  // Held in a ref so the map-request effect can call the latest version without
  // re-running every time the selection changes.
  const selectRef = useRef<(id: string) => void>(() => {});
  selectRef.current = select;

  function select(id: string) {
    setPickedId(id);
    setTab('overview');

    // The pane sits below the map, so picking a job off the list could update
    // something you weren't looking at. Bring it into view — but only when it
    // isn't already fully on screen, so clicking down a list on a wide monitor
    // doesn't yank the page on every row.
    const pane = paneRef.current;
    if (!pane) return;
    const box = pane.getBoundingClientRect();
    const fullyVisible = box.top >= 0 && box.bottom <= window.innerHeight;
    if (fullyVisible) return;
    requestAnimationFrame(() => {
      paneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Told to the page (and from there to the map) rather than called inside
  // select(), so the first job counts too and a filter change that moves the
  // selection is picked up as well.
  useEffect(() => {
    onSelect?.(selectedId);
  }, [selectedId, onSelect]);

  // Center the selected row in the list. The list scrolls independently of the
  // page, so a job picked from the map, from the keyboard, or one that's simply
  // further down than the rows on screen would otherwise stay highlighted
  // somewhere you can't see. Only when it isn't already fully visible, so
  // clicking down the list doesn't shunt it under your cursor.
  useEffect(() => {
    if (!selectedId) return;
    const row = document.getElementById(`focus-row-${selectedId}`);
    const list = row?.parentElement?.parentElement; // li -> ul.rows
    if (!row || !list) return;
    const r = row.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    if (r.top >= l.top && r.bottom <= l.bottom) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedId]);

  // Rows are real links: cmd/middle-click opens the full job page in a new tab,
  // and the URL is copyable. A plain <button> would silently kill all of that.
  function rowClick(event: React.MouseEvent, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    select(id);
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = jobs.findIndex((j) => j.id === selectedId);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next < 0 || next >= jobs.length) return;
    select(jobs[next].id);
  }

  if (jobs.length === 0) {
    return <p className="empty-state">No jobs yet. Create your first job below.</p>;
  }

  // Deep panels render only when the payload matches the highlighted row, so a
  // stale response can never interleave with the shell.
  const fresh = detail && detail.id === selectedId ? detail : null;

  return (
    <div className={styles.focus}>
      <section className={styles.pane} aria-label="Selected job" ref={paneRef}>
        {selected ? (
          <>
            <header className={styles.hero}>
              <div className={styles.heroLayout}>
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
              <div className={styles.heroCopy}>
              <p className={styles.heroTag}>Selected job</p>
              <div className={styles.heroTop}>
                <div className={quickEditStyles.headerTitleRow}>
                  <h2>{selected.clientName || 'Untitled job'}</h2>
                  <button
                    type="button"
                    className={quickEditStyles.quickEditBtn}
                    onClick={() => setIsEditingName(true)}
                    aria-label="Edit client name"
                  >
                    Edit
                  </button>
                </div>
                <StatusBadge job={selected} />
              </div>
              <dl className={styles.heroMeta}>
                <div>
                  <dt>Job ID</dt>
                  <dd>{selected.ref}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
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
                  <dt>Scheduled</dt>
                  <dd>{selected.scheduledLabel || 'No date set'}</dd>
                </div>
              </dl>

              {/* Straight off the row — no network, so it's on screen the
                  instant you click. */}
              <div className={styles.heroStats}>
                <span>
                  <small>Est. labor</small>
                  <strong>{selected.estimatedHours ? `${selected.estimatedHours} hrs` : 'Not set'}</strong>
                </span>
                <span>
                  <small>Quoted</small>
                  <strong>{selected.quotedAmount > 0 ? selected.quotedLabel : 'No quote yet'}</strong>
                </span>
                <span>
                  <small>Balance due</small>
                  <strong className={styles.owed}>{selected.outstandingLabel}</strong>
                </span>
              </div>

              <div className={styles.heroActionsJob}>
                <VoiceCaptureButton
                  targetType="job"
                  targetId={selected.id}
                  contextTitle={selected.clientName || selected.ref}
                  label="🎙️ Voice Update"
                />
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
              </div>
            </header>

            {/* A tab with no panel behind it is a button wearing a tab's name.
                The Smoothie view of this same detail has always been wired
                properly; Focus declared the roles and stopped there, so a
                screen reader was told "tab 3 of 6" and given nothing to move
                into. Same shape as LeadSmoothieView, deliberately. */}
            <div className={styles.tabs} role="tablist" aria-label="Job detail sections" onKeyDown={onTabKeyDown}>
              {JOB_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`focus-job-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="focus-job-tabpanel"
                  // One tab stop for the strip, arrows to move within it —
                  // otherwise six tabs are six Tab presses on the way to the
                  // content. The arrows are the other half of that and are not
                  // optional: without them -1 just means unreachable.
                  tabIndex={tab === t.id ? 0 : -1}
                  ref={(el) => { tabRefs.current[t.id] = el; }}
                  className={`${styles.tab}${tab === t.id ? ` ${styles.tabOn}` : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              className={styles.tabBody}
              id="focus-job-tabpanel"
              role="tabpanel"
              aria-labelledby={`focus-job-tab-${tab}`}
              tabIndex={0}
              key={selected.id}
            >
              {error ? (
                <p className={styles.error}>{error}</p>
              ) : loading || !fresh ? (
                <JobDetailSkeleton />
              ) : (
                <JobDetailTabs tab={tab} detail={fresh} job={selected} base={base} />
              )}
            </div>

            <footer className={styles.moneyStrip}>
              <span>
                <small>Materials</small>
                <strong>{fresh ? fresh.money.materialsLabel : '—'}</strong>
              </span>
              <span>
                <small>Labor</small>
                <strong>{fresh ? fresh.money.laborLabel : '—'}</strong>
              </span>
              <span>
                <small>Overhead</small>
                <strong>{fresh ? fresh.money.overheadLabel : '—'}</strong>
              </span>
              <span>
                <small>Profit margin</small>
                <strong className={fresh && fresh.costCount > 0 ? marginClass(fresh.money.marginPct) : undefined}>
                  {fresh ? fresh.money.marginLabel : '—'}
                </strong>
              </span>
              <span className={styles.moneyStripEnd}>
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
          <p className="empty-state">Pick a job from the list.</p>
        )}
      </section>

      <section className={styles.list} aria-label={`All jobs (${jobs.length})`}>
        <header className={styles.listHead}>
          <h3>All jobs</h3>
          <span>{jobs.length}</span>
        </header>
        <div className={styles.listCols} aria-hidden="true">
          <span>Client / address</span>
          <span>Stage</span>
          <span>Owed</span>
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
        <ul className={styles.rows} onKeyDown={onListKeyDown}>
          {jobs.map((job) => (
            <li key={job.id}>
              <a
                id={`focus-row-${job.id}`}
                href={`${base}/jobs/${job.id}`}
                className={`${styles.row}${job.id === selectedId ? ` ${styles.rowOn}` : ''}`}
                aria-current={job.id === selectedId ? 'true' : undefined}
                onClick={(event) => rowClick(event, job.id)}
                onMouseEnter={() => armPrefetch(job.id)}
                onMouseLeave={cancelPrefetch}
              >
                <span className={styles.rowMain}>
                  <strong>{job.clientName || 'Untitled job'}</strong>
                  <small>{job.address || 'No address on file'}</small>
                </span>
                <StatusBadge job={job} />
                <span className={styles.rowMoney}>
                  {job.quotedAmount > 0 ? job.quotedLabel : '—'}
                  {job.invoiceStatusLabel ? <small>{job.invoiceStatusLabel}</small> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
