'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { JobDetailDto } from '@/lib/job-detail';
import type { JobViewItem } from './JobsWorkspace';
import JobCover from './JobCover';
import styles from './focus.module.css';

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

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'photos', label: 'Photos' },
  { id: 'money', label: 'Quote & Payment' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const CACHE_LIMIT = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SELECT_DEBOUNCE_MS = 140;
const PREFETCH_DWELL_MS = 120;

type CacheEntry = { detail: JobDetailDto; at: number };

function StatusBadge({ job }: { job: JobViewItem }) {
  return (
    <span className={`status-badge status-${job.badgeTone}`} title={job.badgeTitle || undefined}>
      {job.badgeLabel}
    </span>
  );
}

export default function FocusView({ jobs, onSelect }: { jobs: JobViewItem[]; onSelect?: (jobId: string | null) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(jobs[0]?.id ?? null);
  const [detail, setDetail] = useState<JobDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const wantRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(() => jobs.find((j) => j.id === selectedId) ?? null, [jobs, selectedId]);

  // The server just re-rendered, so anything cached may be stale. Correctness
  // guard, not a performance bug — leave it alone.
  useEffect(() => {
    cacheRef.current.clear();
  }, [jobs]);

  // A tab left open on a job site holds signed photo URLs that expire, and a
  // balance that may have been paid. Drop the cache when the window comes back.
  useEffect(() => {
    let last = 0;
    const drop = () => {
      const now = Date.now();
      if (document.visibilityState !== 'visible' || now - last < 60_000) return;
      last = now;
      cacheRef.current.clear();
    };
    document.addEventListener('visibilitychange', drop);
    window.addEventListener('focus', drop);
    return () => {
      document.removeEventListener('visibilitychange', drop);
      window.removeEventListener('focus', drop);
    };
  }, []);

  const readCache = useCallback((id: string): JobDetailDto | null => {
    const hit = cacheRef.current.get(id);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      cacheRef.current.delete(id);
      return null;
    }
    return hit.detail;
  }, []);

  const writeCache = useCallback((id: string, value: JobDetailDto) => {
    const cache = cacheRef.current;
    cache.delete(id);
    cache.set(id, { detail: value, at: Date.now() });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }, []);

  const fetchDetail = useCallback(
    async (id: string, signal?: AbortSignal): Promise<JobDetailDto | null> => {
      const response = await fetch(`/api/jobs/${id}/detail`, { cache: 'no-store', signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load that job.');
      const value = body?.detail as JobDetailDto | undefined;
      if (!value) return null;
      writeCache(id, value);
      return value;
    },
    [writeCache],
  );

  // Selection -> detail. Debounced so holding ArrowDown through the list fires
  // one request, not one per row.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    wantRef.current = selectedId;

    const cached = readCache(selectedId);
    if (cached) {
      setDetail(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setDetail(null);
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetchDetail(selectedId, controller.signal)
        .then((value) => {
          // The response that comes back last is not necessarily the one for the
          // row that's highlighted. Without this, a slow request for job A can
          // paint A's balance under B's name — silent, and the kind of mistake
          // that gets a payment link sent to the wrong homeowner.
          if (wantRef.current !== selectedId) return;
          setDetail(value);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || wantRef.current !== selectedId) return;
          setError(err instanceof Error ? err.message : 'Could not load that job.');
          setLoading(false);
        });
    }, SELECT_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [selectedId, readCache, fetchDetail]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function select(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setTab('overview');
  }

  // Told to the page (and from there to the map) rather than called inside
  // select(), so the first job counts too and a filter change that moves the
  // selection is picked up as well.
  useEffect(() => {
    onSelect?.(selectedId);
  }, [selectedId, onSelect]);

  // Warm the cache on hover only. Never on keyboard traversal — that would turn
  // the prefetch into the request storm it exists to prevent.
  function armPrefetch(id: string) {
    if (readCache(id) || id === selectedId) return;
    if (dwellRef.current) clearTimeout(dwellRef.current);
    dwellRef.current = setTimeout(() => {
      fetchDetail(id).catch(() => {});
    }, PREFETCH_DWELL_MS);
  }
  function cancelPrefetch() {
    if (dwellRef.current) clearTimeout(dwellRef.current);
  }

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
    document.getElementById(`focus-row-${jobs[next].id}`)?.scrollIntoView({ block: 'nearest' });
  }

  if (jobs.length === 0) {
    return <p className="empty-state">No jobs yet. Create your first job below.</p>;
  }

  // Deep panels render only when the payload matches the highlighted row, so a
  // stale response can never interleave with the shell.
  const fresh = detail && detail.id === selectedId ? detail : null;

  return (
    <div className={styles.focus}>
      <section className={styles.pane} aria-label="Selected job">
        {selected ? (
          <>
            <header className={styles.hero}>
              <div className={styles.heroLayout}>
              <JobCover
                jobId={selected.id}
                scope={selected.scope}
                photoUrl={fresh?.photos[0]?.url ?? null}
                photoCount={selected.photoCount}
                photoTotal={fresh?.photoCount}
              />
              <div className={styles.heroCopy}>
              <p className={styles.heroTag}>Selected job</p>
              <div className={styles.heroTop}>
                <h2>{selected.clientName || 'Untitled job'}</h2>
                <StatusBadge job={selected} />
              </div>
              <dl className={styles.heroMeta}>
                <div>
                  <dt>Job ID</dt>
                  <dd>{selected.ref}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{selected.address || 'No address on file'}</dd>
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
                  <small>Still owed</small>
                  <strong className={styles.owed}>{selected.outstandingLabel}</strong>
                </span>
              </div>

              <div className={styles.heroActions}>
                <Link className="btn primary" href={`/dashboard/jobs/${selected.id}`}>
                  Open job →
                </Link>
                <Link className="btn secondary" href={`/dashboard/jobs/${selected.id}?open=payment#request-payment`}>
                  Request payment
                </Link>
                <Link className="btn secondary" href={`/dashboard/jobs/${selected.id}?open=costs`}>
                  Add expense
                </Link>
              </div>
              </div>
              </div>
            </header>

            <div className={styles.tabs} role="tablist" aria-label="Job detail sections">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`${styles.tab}${tab === t.id ? ` ${styles.tabOn}` : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className={styles.tabBody} key={selected.id}>
              {error ? (
                <p className={styles.error}>{error}</p>
              ) : loading || !fresh ? (
                <Skeleton />
              ) : (
                <TabPanel tab={tab} detail={fresh} job={selected} />
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
                href={`/dashboard/jobs/${job.id}`}
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

function marginClass(pct: number): string {
  if (pct >= 35) return 'margin-good';
  if (pct >= 20) return 'margin-ok';
  return 'margin-bad';
}

function Skeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

function TabPanel({ tab, detail, job }: { tab: TabId; detail: JobDetailDto; job: JobViewItem }) {
  if (tab === 'overview') {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <h4>Details</h4>
          <dl className={styles.defs}>
            <div><dt>Client</dt><dd>{detail.clientName}</dd></div>
            <div><dt>Phone</dt><dd>{detail.clientPhone || 'Not on file'}</dd></div>
            <div><dt>Email</dt><dd>{detail.clientEmail || 'Not on file'}</dd></div>
            <div><dt>Address</dt><dd>{detail.address || 'Not on file'}</dd></div>
            <div><dt>Created</dt><dd>{detail.createdAtLabel}</dd></div>
            <div>
              <dt>Crew</dt>
              <dd>{detail.crew.length > 0 ? detail.crew.map((c) => c.name).join(', ') : 'None assigned'}</dd>
            </div>
          </dl>
        </section>

        {/* There is no notes feature in this product — no job_notes table and no
            jobs.notes column. This is the job's scope, labelled as what it is
            rather than dressed up as notes. */}
        <section className={styles.card}>
          <h4>Job description</h4>
          {detail.scope ? (
            <p className={styles.scope}>{detail.scope}</p>
          ) : (
            <p className={styles.muted}>Nothing written down yet.</p>
          )}
          <Link className={styles.cardLink} href={`/dashboard/jobs/${detail.id}`}>Edit on the job page →</Link>
        </section>

        <section className={styles.card}>
          <h4>Recent activity</h4>
          {detail.feed.length === 0 ? (
            <p className={styles.muted}>Nothing has happened on this job yet.</p>
          ) : (
            <ul className={styles.feed}>
              {detail.feed.slice(0, 4).map((event) => (
                <li key={event.id}>
                  <span className={styles.feedIcon} aria-hidden="true">{event.icon}</span>
                  <span>
                    <strong>{event.title}</strong>
                    <small>{event.at}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  if (tab === 'timeline') {
    return detail.feed.length === 0 ? (
      <p className={styles.muted}>Nothing has happened on this job yet.</p>
    ) : (
      <ul className={styles.timeline}>
        {detail.feed.map((event) => (
          <li key={event.id}>
            <span className={styles.feedIcon} aria-hidden="true">{event.icon}</span>
            <span className={styles.timelineBody}>
              <strong>{event.title}</strong>
              {event.body ? <p>{event.body}</p> : null}
              <small>{event.kindLabel} · {event.at}</small>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (tab === 'checklist') {
    return detail.tasks.total === 0 ? (
      <p className={styles.muted}>
        No checklist on this job yet. <Link href={`/dashboard/jobs/${detail.id}`}>Add one →</Link>
      </p>
    ) : (
      <>
        <p className={styles.progress}>
          <span style={{ width: `${detail.tasks.pct}%` }} />
          <em>{detail.tasks.done} of {detail.tasks.total} done</em>
        </p>
        <ul className={styles.tasks}>
          {detail.tasks.items.map((task) => (
            <li key={task.id} className={task.done ? styles.taskDone : undefined}>
              <span aria-hidden="true">{task.done ? '✓' : ''}</span>
              {task.title}
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (tab === 'photos') {
    // Files on a job are photos. There's no document upload in this product, so
    // this doesn't pretend to be a file manager.
    return detail.photos.length === 0 ? (
      <p className={styles.muted}>
        No photos on this job. <Link href={`/dashboard/jobs/${detail.id}`}>Upload some →</Link>
      </p>
    ) : (
      <>
        <div className={styles.photos}>
          {detail.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.path} src={photo.url} alt="" loading="lazy" />
          ))}
        </div>
        {detail.photoCount > detail.photos.length && (
          <p className={styles.muted}>
            Showing {detail.photos.length} of {detail.photoCount}.{' '}
            <Link href={`/dashboard/jobs/${detail.id}`}>See all →</Link>
          </p>
        )}
      </>
    );
  }

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <h4>Quote &amp; invoice</h4>
        <dl className={styles.defs}>
          <div><dt>Quoted</dt><dd>{job.quotedAmount > 0 ? job.quotedLabel : 'No quote yet'}</dd></div>
          <div><dt>Invoice</dt><dd>{detail.invoice ? `${detail.invoice.ref} · ${detail.invoice.statusLabel}` : 'None raised'}</dd></div>
          <div><dt>Paid</dt><dd>{detail.money.paidLabel}</dd></div>
          <div><dt>Still owed</dt><dd className={styles.owed}>{detail.money.outstandingLabel}</dd></div>
          <div><dt>Payment</dt><dd>{detail.paymentStatusLabel ?? 'None requested'}</dd></div>
        </dl>
        <Link className={styles.cardLink} href={`/dashboard/jobs/${detail.id}?open=payment#request-payment`}>
          Request payment →
        </Link>
      </section>

      <section className={styles.card}>
        <h4>Costs &amp; margin</h4>
        <dl className={styles.defs}>
          <div><dt>Materials</dt><dd>{detail.money.materialsLabel}</dd></div>
          <div><dt>Labor</dt><dd>{detail.money.laborLabel}</dd></div>
          <div><dt>Overhead</dt><dd>{detail.money.overheadLabel}</dd></div>
          <div><dt>Total cost</dt><dd>{detail.money.totalCostLabel}</dd></div>
          <div><dt>Profit</dt><dd>{detail.money.profitLabel}</dd></div>
          <div>
            <dt>Margin</dt>
            <dd className={marginClass(detail.money.marginPct)}>{detail.money.marginLabel}</dd>
          </div>
        </dl>
        <Link className={styles.cardLink} href={`/dashboard/jobs/${detail.id}?open=costs`}>
          Add an expense →
        </Link>
      </section>
    </div>
  );
}
