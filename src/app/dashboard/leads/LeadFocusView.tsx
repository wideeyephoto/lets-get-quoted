'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { LeadDetailDto } from '@/lib/lead-detail';
import { leadScoreLabel } from '@/lib/lead-detail-labels';
import type { LeadViewItem } from './LeadsWorkspace';
import RecordCover from '../RecordCover';
import { archiveLeadAction, snoozeLeadAction, updateLeadStatusAction } from './actions';
import styles from '../focus.module.css';
import leadStyles from './leads.module.css';

// Master-detail view of the leads pipeline — the same shape the jobs pipeline
// uses, sharing its stylesheet, so moving between the two doesn't mean learning
// a second layout.
//
// What's different is what a lead IS. There's no money banked, so the strip
// along the bottom counts the things that decide whether there will be: what
// they're worth, when they want it, how long they've been waiting, and how many
// times you've reached out. The clock is the number that matters — a website
// request nobody answered is a job somebody else got.
//
// Loading model, unchanged from the jobs pane:
//   * The header and strip render from the LeadViewItem the server already
//     shipped, so a click paints immediately — no spinner on the part you came
//     for.
//   * Everything deeper (photos, the full request, the contact log, the quote
//     visit) comes from /api/leads/[id]/detail behind a skeleton.

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'request', label: 'Their request' },
  { id: 'activity', label: 'Activity' },
  { id: 'photos', label: 'Photos' },
  { id: 'quote', label: 'Quote & visit' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const CACHE_LIMIT = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SELECT_DEBOUNCE_MS = 140;
const PREFETCH_DWELL_MS = 120;

type CacheEntry = { detail: LeadDetailDto; at: number };

export default function LeadFocusView({
  leads,
  run,
  onSelect,
  openRequest,
}: {
  leads: LeadViewItem[];
  run: (fn: () => Promise<unknown>) => void;
  onSelect?: (leadId: string | null) => void;
  /** A pin on the map asking for a lead; the nonce lets the same one repeat. */
  openRequest?: { id: string; nonce: number } | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null);
  const [detail, setDetail] = useState<LeadDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const wantRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);

  const selected = useMemo(() => leads.find((l) => l.id === selectedId) ?? null, [leads, selectedId]);

  // The server just re-rendered — which is also what happens after every action
  // on this pane — so anything cached may be stale. Correctness guard, not a
  // performance bug: leave it alone.
  useEffect(() => {
    cacheRef.current.clear();
  }, [leads]);

  // A tab left open in a truck holds signed photo URLs that expire, and a lead
  // that may since have been answered. Drop the cache when the window returns.
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

  const readCache = useCallback((id: string): LeadDetailDto | null => {
    const hit = cacheRef.current.get(id);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      cacheRef.current.delete(id);
      return null;
    }
    return hit.detail;
  }, []);

  const writeCache = useCallback((id: string, value: LeadDetailDto) => {
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
    async (id: string, signal?: AbortSignal): Promise<LeadDetailDto | null> => {
      const response = await fetch(`/api/leads/${id}/detail`, { cache: 'no-store', signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Could not load that lead.');
      const value = body?.detail as LeadDetailDto | undefined;
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
          // row that's highlighted. Without this, a slow request for lead A can
          // paint A's phone number under B's name — silent, and the kind of
          // mistake that gets a quote texted to the wrong homeowner.
          if (wantRef.current !== selectedId) return;
          setDetail(value);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted || wantRef.current !== selectedId) return;
          setError(err instanceof Error ? err.message : 'Could not load that lead.');
          setLoading(false);
        });
    }, SELECT_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [selectedId, readCache, fetchDetail]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function select(id: string) {
    setSelectedId(id);
    setTab('overview');

    // The pane sits below the map, so picking a lead off the list could update
    // something you weren't looking at. Bring it into view — but only when it
    // isn't already fully on screen, so clicking down a list on a wide monitor
    // doesn't yank the page on every row.
    const pane = paneRef.current;
    if (!pane) return;
    const box = pane.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) return;
    requestAnimationFrame(() => {
      paneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // Held in a ref so the map-request effect can call the latest version without
  // re-running every time the selection changes.
  const selectRef = useRef<(id: string) => void>(() => {});
  selectRef.current = select;

  // Opened from the map. Goes through the same path as a click on the list, so
  // the pane scrolls into view and the row centres itself exactly as it would.
  useEffect(() => {
    if (!openRequest) return;
    if (!leads.some((l) => l.id === openRequest.id)) return; // filtered out
    selectRef.current(openRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  // Told to the page (and from there to the map) rather than called inside
  // select(), so the first lead counts too and a refresh that moves the
  // selection is picked up as well.
  useEffect(() => {
    onSelect?.(selectedId);
  }, [selectedId, onSelect]);

  // Centre the selected row in the list. The list scrolls independently of the
  // page, so a lead picked from the map, from the keyboard, or one further down
  // than the rows on screen would otherwise stay highlighted somewhere you
  // can't see. Only when it isn't already fully visible.
  useEffect(() => {
    if (!selectedId) return;
    const row = document.getElementById(`lead-row-${selectedId}`);
    const list = row?.closest('ul');
    if (!row || !list) return;
    const r = row.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    if (r.top >= l.top && r.bottom <= l.bottom) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedId]);

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

  // Rows are real links: cmd/middle-click opens the full lead page in a new tab,
  // and the URL is copyable. A plain <button> would silently kill all of that.
  function rowClick(event: React.MouseEvent, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    select(id);
  }

  function onListKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = leads.findIndex((l) => l.id === selectedId);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next < 0 || next >= leads.length) return;
    select(leads[next].id);
  }

  if (leads.length === 0) {
    return <p className="empty-state">No active leads right now.</p>;
  }

  // Deep panels render only when the payload matches the highlighted row, so a
  // stale response can never interleave with the shell.
  const fresh = detail && detail.id === selectedId ? detail : null;

  return (
    <div className={styles.focus}>
      <section className={styles.pane} aria-label="Selected lead" ref={paneRef}>
        {selected ? (
          <>
            <header className={styles.hero}>
              <div className={styles.heroLayout}>
                <RecordCover
                  recordId={selected.id}
                  subject={selected.projectType || selected.detail}
                  photoUrl={fresh?.photos[0]?.url ?? null}
                  photoCount={selected.photoCount}
                  photoTotal={fresh?.photoCount}
                />
                <div className={styles.heroCopy}>
                  <p className={styles.heroTag}>Selected lead</p>
                  <div className={styles.heroTop}>
                    <h2>{selected.name}</h2>
                  </div>

                  <div className={styles.chips}>
                    {selected.hasTriage && (
                      <span className={leadStyles.scoreChip} data-score={selected.score}>{leadScoreLabel(selected.score)}</span>
                    )}
                    <span className={selected.isUrgent ? leadStyles.needsBadge : leadStyles.statusBadge}>
                      {selected.statusLabel}
                    </span>
                    {selected.textOnly && <span className={leadStyles.textOnlyChip}>💬 Text only</span>}
                    {selected.flags.slice(0, 3).map((flag) => (
                      <span className={leadStyles.flagChip} key={flag.key}>{flag.label}</span>
                    ))}
                  </div>

                  <dl className={styles.heroMeta}>
                    <div>
                      <dt>Came from</dt>
                      <dd>{selected.sourceLabel}</dd>
                    </div>
                    <div>
                      <dt>Where</dt>
                      <dd>{selected.address || selected.location || 'No address given'}</dd>
                    </div>
                    <div>
                      <dt>Contact</dt>
                      <dd>{selected.phone || selected.email || 'None on file'}</dd>
                    </div>
                  </dl>

                  {/* Straight off the row — no network, so it's on screen the
                      instant you click. */}
                  <div className={styles.heroStats}>
                    <span>
                      <small>Est. value</small>
                      <strong>{selected.estimateLabel ?? 'Not estimated'}</strong>
                    </span>
                    <span>
                      <small>Wants it</small>
                      <strong>{selected.timeline || 'Not said'}</strong>
                    </span>
                    <span>
                      <small>{selected.isUrgent ? 'Unanswered for' : 'Age'}</small>
                      <strong className={selected.isUrgent ? styles.waiting : undefined}>{selected.ageLabel}</strong>
                    </span>
                  </div>

                  <div className={styles.heroActions}>
                    {selected.phone && (
                      <a className={`btn ${selected.textOnly ? 'secondary' : 'primary'}`} href={`tel:${selected.phone}`}>
                        📞 Call
                      </a>
                    )}
                    {selected.phone && (
                      <a className={`btn ${selected.textOnly ? 'primary' : 'secondary'}`} href={`sms:${selected.phone}`}>
                        💬 Text
                      </a>
                    )}
                    <Link className="btn secondary" href={`/dashboard/leads/${selected.id}#lead-estimate`}>
                      Send quote
                    </Link>
                    <Link className="btn ghost" href={`/dashboard/leads/${selected.id}`}>
                      Open full lead →
                    </Link>
                  </div>

                  {/* Stage changes and set-aside, one step quieter than the
                      thing you actually came here to do. */}
                  <div className={styles.quietActions}>
                    {selected.status !== 'contacted' && selected.status !== 'won' && (
                      <button type="button" className={styles.quietBtn} onClick={() => run(() => updateLeadStatusAction(selected.id, 'contacted'))}>
                        Mark contacted
                      </button>
                    )}
                    {selected.status !== 'won' && (
                      <button type="button" className={styles.quietBtn} onClick={() => run(() => updateLeadStatusAction(selected.id, 'won'))}>
                        Mark won
                      </button>
                    )}
                    <button type="button" className={styles.quietBtn} onClick={() => run(() => snoozeLeadAction(selected.id, 3))}>
                      Snooze 3 days
                    </button>
                    <button type="button" className={styles.quietBtn} onClick={() => run(() => archiveLeadAction(selected.id, true))}>
                      Set aside
                    </button>
                  </div>
                </div>
              </div>
            </header>

            <div className={styles.tabs} role="tablist" aria-label="Lead detail sections">
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
                <TabPanel tab={tab} detail={fresh} lead={selected} />
              )}
            </div>

            <footer className={styles.moneyStrip}>
              <span>
                <small>Stage</small>
                <strong>{selected.statusLabel}</strong>
              </span>
              <span>
                <small>Est. value</small>
                <strong>{selected.estimateLabel ?? '—'}</strong>
              </span>
              <span>
                <small>Est. labor</small>
                <strong>{selected.estimatedHours ? `${selected.estimatedHours} hrs` : '—'}</strong>
              </span>
              <span>
                <small>Touchpoints</small>
                <strong>{fresh ? fresh.contactCount || 'None yet' : '—'}</strong>
              </span>
              <span className={styles.moneyStripEnd}>
                <small>{selected.isUrgent ? 'Waiting' : 'Age'}</small>
                <strong className={selected.isUrgent ? styles.waiting : undefined}>{selected.ageLabel}</strong>
              </span>
            </footer>
          </>
        ) : (
          <p className="empty-state">Pick a lead from the list.</p>
        )}
      </section>

      <section className={styles.list} aria-label={`All leads (${leads.length})`}>
        <header className={styles.listHead}>
          <h3>All leads</h3>
          <span>{leads.length}</span>
        </header>
        <div className={`${styles.listCols} ${styles.listColsLead}`} aria-hidden="true">
          <span>Heat</span>
          <span>Lead / project</span>
          <span>Est. value</span>
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
        <ul className={styles.rows} onKeyDown={onListKeyDown}>
          {leads.map((lead) => (
            <li key={lead.id}>
              <a
                id={`lead-row-${lead.id}`}
                href={`/dashboard/leads/${lead.id}`}
                className={`${styles.row} ${styles.rowLead}${lead.id === selectedId ? ` ${styles.rowOn}` : ''}`}
                aria-current={lead.id === selectedId ? 'true' : undefined}
                onClick={(event) => rowClick(event, lead.id)}
                onMouseEnter={() => armPrefetch(lead.id)}
                onMouseLeave={cancelPrefetch}
              >
                <span className={`${leadStyles.heatDot} ${styles.rowDot}`} data-score={lead.score} aria-hidden="true" />
                <span className={styles.rowMain}>
                  <strong>{lead.name}</strong>
                  <small>{lead.detail}</small>
                </span>
                <span className={styles.rowValue}>
                  {lead.estimateLabel ?? '—'}
                  <small>{lead.ageLabel}</small>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

function TabPanel({ tab, detail, lead }: { tab: TabId; detail: LeadDetailDto; lead: LeadViewItem }) {
  if (tab === 'overview') {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <h4>Contact</h4>
          <dl className={styles.defs}>
            <div>
              <dt>Phone</dt>
              <dd>{detail.phoneDigits ? <a href={`tel:${detail.phoneDigits}`}>{detail.phone}</a> : 'Not on file'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : 'Not on file'}</dd>
            </div>
            <div><dt>Address</dt><dd>{detail.address || detail.location || 'Not on file'}</dd></div>
            <div><dt>Received</dt><dd>{detail.createdAtLabel}</dd></div>
          </dl>
          {detail.textOnly && <p className={styles.muted}>They asked not to be called — text first.</p>}
        </section>

        <section className={styles.card}>
          <h4>What the AI read</h4>
          <dl className={styles.defs}>
            <div><dt>Score</dt><dd>{detail.hasTriage ? detail.scoreLabel : 'Not scored'}</dd></div>
            <div><dt>Est. value</dt><dd>{detail.estimateLabel ?? 'No number given'}</dd></div>
            <div><dt>Timeline</dt><dd>{detail.timeline || 'Not said'}</dd></div>
            <div><dt>Est. labor</dt><dd>{detail.estimatedHours ? `${detail.estimatedHours} hrs` : 'Not set'}</dd></div>
          </dl>
          {detail.flags.length > 0 && (
            <div className={styles.chips}>
              {detail.flags.map((flag) => <span className={leadStyles.flagChip} key={flag.key}>{flag.label}</span>)}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <h4>History</h4>
          {detail.history && (detail.history.jobs > 0 || detail.history.leads > 0) ? (
            <>
              <span className={styles.repeat}>Repeat customer</span>
              <dl className={styles.defs} style={{ marginTop: '0.6rem' }}>
                <div><dt>Past jobs</dt><dd>{detail.history.jobs}</dd></div>
                <div><dt>Other requests</dt><dd>{detail.history.leads}</dd></div>
              </dl>
            </>
          ) : (
            <p className={styles.muted}>
              {detail.history ? 'First time this customer has been in touch.' : 'Not linked to a client profile yet.'}
            </p>
          )}
        </section>
      </div>
    );
  }

  if (tab === 'request') {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <h4>{detail.projectType || 'Project request'}</h4>
          {detail.message ? (
            <p className={styles.quote}>{detail.message}</p>
          ) : (
            <p className={styles.muted}>They didn&rsquo;t write anything beyond the project type.</p>
          )}
          <Link className={styles.cardLink} href={`/dashboard/leads/${detail.id}?edit=client#lead-edit-modal`}>
            Edit the details →
          </Link>
        </section>

        <section className={styles.card}>
          <h4>Where it came from</h4>
          <dl className={styles.defs}>
            <div><dt>Source</dt><dd>{detail.sourceLabel}</dd></div>
            <div><dt>Page</dt><dd>{detail.sourcePage || 'Not recorded'}</dd></div>
            <div><dt>Received</dt><dd>{detail.createdAtLabel}</dd></div>
            <div><dt>Area</dt><dd>{detail.location || detail.address || 'Not given'}</dd></div>
          </dl>
        </section>
      </div>
    );
  }

  if (tab === 'activity') {
    return detail.contactLog.length === 0 ? (
      <p className={styles.muted}>
        Nobody has reached out yet.{' '}
        <Link href={`/dashboard/leads/${detail.id}#lead-activity`}>Log a call or text →</Link>
      </p>
    ) : (
      <>
        <ul className={styles.timeline}>
          {detail.contactLog.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className={styles.feedIcon} aria-hidden="true">•</span>
              <span className={styles.timelineBody}>
                <strong>{entry.label}</strong>
                {entry.note ? <p>{entry.note}</p> : null}
                <small>{entry.at}</small>
              </span>
            </li>
          ))}
        </ul>
        {detail.contactCount > detail.contactLog.length && (
          <p className={styles.muted} style={{ marginTop: '0.7rem' }}>
            Showing the last {detail.contactLog.length} of {detail.contactCount}.{' '}
            <Link href={`/dashboard/leads/${detail.id}#lead-activity`}>See all →</Link>
          </p>
        )}
      </>
    );
  }

  if (tab === 'photos') {
    // Photos the homeowner sent with the request — often the only way to know
    // what the job actually is before you drive out to it.
    return detail.photos.length === 0 ? (
      <p className={styles.muted}>They didn&rsquo;t send any photos with this request.</p>
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
            <Link href={`/dashboard/leads/${detail.id}?details=photos#lead-photos-modal`}>See all →</Link>
          </p>
        )}
      </>
    );
  }

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <h4>Estimate visit</h4>
        {detail.quoteVisit ? (
          <dl className={styles.defs}>
            <div><dt>When</dt><dd>{detail.quoteVisit.whenLabel}</dd></div>
            <div><dt>Length</dt><dd>{detail.quoteVisit.durationLabel}</dd></div>
            <div><dt>Confirmed</dt><dd>{detail.quoteVisit.confirmedLabel ? `Texted ${detail.quoteVisit.confirmedLabel}` : 'Not texted yet'}</dd></div>
            {detail.quoteVisit.notes ? <div><dt>Notes</dt><dd>{detail.quoteVisit.notes}</dd></div> : null}
          </dl>
        ) : (
          <p className={styles.muted}>No visit booked.</p>
        )}
        <Link className={styles.cardLink} href={`/dashboard/leads/${detail.id}#availability-snapshot`}>
          {detail.quoteVisit ? 'Change the visit →' : 'Book a visit →'}
        </Link>
      </section>

      <section className={styles.card}>
        <h4>Quote</h4>
        {detail.convertedJob ? (
          <dl className={styles.defs}>
            <div><dt>Job</dt><dd>{detail.convertedJob.ref}</dd></div>
            <div><dt>Stage</dt><dd>{detail.convertedJob.stageLabel}</dd></div>
            <div><dt>Quoted</dt><dd>{detail.convertedJob.quotedLabel}</dd></div>
          </dl>
        ) : (
          <>
            <dl className={styles.defs}>
              <div><dt>Est. value</dt><dd>{detail.estimateLabel ?? 'No number given'}</dd></div>
              <div><dt>Est. labor</dt><dd>{lead.estimatedHours ? `${lead.estimatedHours} hrs` : 'Not set'}</dd></div>
            </dl>
            <p className={styles.muted}>No quote sent yet.</p>
          </>
        )}
        <Link
          className={styles.cardLink}
          href={detail.convertedJob ? `/dashboard/jobs/${detail.convertedJob.id}` : `/dashboard/leads/${detail.id}#lead-estimate`}
        >
          {detail.convertedJob ? 'Open the job →' : 'Send a quote →'}
        </Link>
      </section>
    </div>
  );
}
