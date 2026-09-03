'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { BAND_LABEL, bandFor, whenHeading, whenLabel } from '@/lib/client-followup';
import {
  CLIENT_SORTS,
  CLIENT_STAGES,
  countMappedClients,
  matchesQuery,
  sortQueue,
  stageCounts,
  type QueueSort,
  type StageFilter,
} from '@/lib/client-queue';
import { hueFor } from '../RecordCover';
import ClientsMap, { type ClientMapPin } from './ClientsMap';
import { nextTabIndex } from '@/lib/tab-strip';
import type { ClientRow } from './ClientsWorkspace';
import { focusQueueRow, useQueueWindow } from '../use-queue-window';
import { useClientDetail } from './use-client-detail';
import ClientDetailTabs, { CLIENT_TABS, ClientDetailSkeleton, type ClientTabId } from './ClientDetailTabs';
import focusStyles from '../focus.module.css';
import styles from '../smoothie.module.css';
import pageStyles from './clients-page.module.css';
import MailIcon from '@/components/MailIcon';

/**
 * Smoothie on Clients — the book led by who needs calling.
 *
 * The same view Leads and Jobs have: it shares ../smoothie.module.css, renders
 * the same four ClientDetailTabs that Focus does, and loads them through the
 * same useClientDetail hook. What changes is the order you meet people in.
 *
 * The stage chips are NOT invented here. They are the four follow-up bands the
 * page already had — On the calendar / Just done / Going quiet / Nothing on the
 * books — so a chip, a row's own word and the Follow-up view cannot disagree.
 * And the default sort is silence, because every other view on this page orders
 * by name or by money, which is exactly what makes a customer drifting away
 * look identical to a happy one.
 *
 * The map is a pane rather than a band, and it is the SAME ClientsMap the Focus
 * pane mounts — a customer's position is the thing that decides whether they
 * get worked into today's route.
 */

export default function ClientSmoothieView({
  clients,
  pins = [],
  todayKey,
  selectedId,
  onSelect,
  basePath = '/dashboard',
  gear,
  readOnly = false,
  duplicateButton,
}: {
  clients: ClientRow[];
  pins?: ClientMapPin[];
  /** Today, from the server, so the bands cannot disagree with Follow-up. */
  todayKey: string;
  /** Owned by the workspace, so search and the other views stay in step. */
  selectedId: string | null;
  onSelect: (clientId: string) => void;
  basePath?: string;
  gear?: ReactNode;
  readOnly?: boolean;
  duplicateButton?: ReactNode;
}) {
  const base = basePath;

  const [stage, setStage] = useState<StageFilter>('all');
  const [missingContactOnly, setMissingContactOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<QueueSort>('silence');
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

  const currentSort = CLIENT_SORTS.find((s) => s.id === sort) ?? CLIENT_SORTS[0];
  const [pane, setPane] = useState<'clients' | 'map'>('clients');
  const [onDetailScreen, setOnDetailScreen] = useState(false);
  const [tab, setTab] = useState<ClientTabId>('overview');
  // Roving tabindex needs somewhere to send focus when an arrow moves the
  // selection — see nextTabIndex.
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const backRef = useRef<HTMLButtonElement | null>(null);

  const counts = useMemo(() => stageCounts(clients, todayKey), [clients, todayKey]);

  const shown = useMemo(() => {
    const filtered = clients.filter(
      (client) =>
        (stage === 'all' || bandFor(client, todayKey) === stage) &&
        (!missingContactOnly || (!client.phone && !client.email)) &&
        matchesQuery(client, query),
    );
    return sortQueue(filtered, sort, todayKey);
  }, [clients, stage, missingContactOnly, query, sort, todayKey]);

  const missingContactCount = useMemo(
    () => clients.filter((client) => !client.phone && !client.email).length,
    [clients],
  );
  const mappedLocationCount = useMemo(() => countMappedClients(shown, pins), [shown, pins]);

  const selected = useMemo(
    () => clients.find((client) => client.id === selectedId) ?? null,
    [clients, selectedId],
  );

  const { detail, loading, error, armPrefetch, cancelPrefetch } = useClientDetail({ selectedId, clients });

  // How much of the queue is drawn. The whole thing was, which on a book of a
  // few hundred customers is a column several times the height of the pane
  // beside it — and this view has no scrollbar of its own by design. See
  // @/lib/queue-window.
  const selectedIndex = useMemo(() => shown.findIndex((client) => client.id === selectedId), [shown, selectedId]);
  const win = useQueueWindow({
    total: shown.length,
    selectedIndex,
    resetKey: `${stage}|${missingContactOnly ? 'missing-contact' : 'all-contact'}|${sort}|${query}`,
    plural: 'customers',
    pageSize: 15,
  });
  const visible = useMemo(() => shown.slice(0, win.end), [shown, win.end]);

  // Nothing is selected when the page opens on this view, so the pane would be
  // an empty box beside a full queue. The first row is the sensible somebody,
  // and it follows the filters rather than stranding a selection that has been
  // filtered away.
  useEffect(() => {
    if (selectedId && shown.some((client) => client.id === selectedId)) return;
    if (shown.length > 0) onSelect(shown[0].id);
  }, [shown, selectedId, onSelect]);

  const select = useCallback(
    (id: string, { fromMobileList = false }: { fromMobileList?: boolean } = {}) => {
      onSelect(id);
      setTab('overview');
      if (fromMobileList) {
        setOnDetailScreen(true);
        requestAnimationFrame(() => backRef.current?.focus());
      }
    },
    [onSelect],
  );

  // Arrowing past the last drawn row selects the next one anyway — selecting
  // always draws it — so the window opens under the keyboard rather than the
  // queue ending early for anyone not using a mouse.
  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, CLIENT_TABS.findIndex((t) => t.id === tab), CLIENT_TABS.length);
    if (next === null) return;
    event.preventDefault();
    const id = CLIENT_TABS[next].id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  function onQueueKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = shown.findIndex((client) => client.id === selectedId);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next < 0 || next >= shown.length) return;
    select(shown[next].id);
    focusQueueRow(`client-row-${shown[next].id}`, next < win.end);
  }

  // Reveal, then land on the first row that appeared. Without it the button can
  // be the last thing revealed away, leaving focus on nothing.
  function reveal(all: boolean) {
    const first = shown[win.nextIndex];
    if (all) win.showAll();
    else win.showMore();
    if (first) focusQueueRow(`client-row-${first.id}`, false);
  }

  // Rows stay real links so cmd/middle-click opens the full profile and the URL
  // is copyable. A plain <button> would silently kill both.
  function rowClick(event: React.MouseEvent, id: string, mobile: boolean) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    select(id, { fromMobileList: mobile });
  }

  if (clients.length === 0) {
    return <p className="empty-state">No customers to show.</p>;
  }

  const fresh = detail && detail.id === selectedId ? detail : null;

  return (
    <div className={`${styles.smoothie} ${pageStyles.workspace}`} data-pane={pane} data-screen={onDetailScreen ? 'detail' : 'list'}>
      {/* --- the four follow-up bands, as filters --- */}
      <div className={`${styles.stageBar} ${pageStyles.stageBar}`} data-compact="true" role="group" aria-label="Filter customers">
        <StageChip id="all" label="Everyone" count={counts.all} active={stage === 'all'} onPick={setStage} />
        {CLIENT_STAGES.map((entry) => (
          <StageChip
            key={entry.id}
            id={entry.id}
            label={entry.label}
            count={counts[entry.id]}
            active={stage === entry.id}
            onPick={setStage}
          />
        ))}
        <button
          type="button"
          className={styles.stageChip}
          aria-pressed={missingContactOnly}
          disabled={missingContactCount === 0 && !missingContactOnly}
          onClick={() => setMissingContactOnly((current) => !current)}
        >
          Missing contact
          <span className={styles.stageCount}>{missingContactCount}</span>
        </button>
      </div>

      {/* --- search / pane switch --- */}
      <div className={`${styles.toolbar} ${pageStyles.toolbar}`}>
        <div className={`${styles.searchWrap} ${pageStyles.searchWrap}`}>
          <label className={styles.srOnly} htmlFor="client-smoothie-search">Search customers by name, phone, email or address</label>
          <input
            id="client-smoothie-search"
            type="search"
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, email or address"
          />
        </div>

        <div className={`${styles.paneSwitch} ${pageStyles.paneSwitch}`} role="group" aria-label="Show customer list or locations map">
          <button type="button" className={styles.paneBtn} aria-pressed={pane === 'clients'} onClick={() => setPane('clients')}>
            Customers
          </button>
          <button type="button" className={styles.paneBtn} aria-pressed={pane === 'map'} onClick={() => setPane('map')}>
            Map <span className={`${styles.paneCount} ${pageStyles.mapCount}`}>{mappedLocationCount} location{mappedLocationCount === 1 ? '' : 's'}</span>
          </button>
        </div>

        {gear ? <div className={`${styles.gearSlot} ${pageStyles.gearSlot}`}>{gear}</div> : null}
      </div>

      {/* Filter results only — the window count moves on every arrow keypress
          past the window edge, so it is read at the foot of the list instead of
          announced over each row. See LeadSmoothieView. */}
      <p className={styles.srOnly} role="status">
        {shown.length} of {clients.length} customers match.
      </p>

      <div className={`${styles.body} ${pageStyles.body}`}>
        {/* --- the queue --- */}
        <section className={`${styles.queue} ${pageStyles.queue}`} aria-label="Customer queue">
          <div className={`${styles.queueHead} ${styles.queueHeadTwoRows}`}>
            <div className={styles.queueHeadTop}>
              <div className={styles.queueHeadLeft}>
                <h2 className={styles.queueTitle}>Customers</h2>
                <span className={styles.queueCount}>
                  {shown.length === clients.length ? `${clients.length}` : `${shown.length} of ${clients.length}`}
                </span>
              </div>
              {duplicateButton}
            </div>

            <div className={styles.queueHeadActions}>
              <div className={styles.sortPopupWrap} ref={sortRef}>
                <button
                  type="button"
                  className={styles.sortToggleBtn}
                  onClick={() => setSortOpen((prev) => !prev)}
                  aria-expanded={sortOpen}
                  aria-haspopup="menu"
                  title="Sort customers"
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
                    <div className={styles.sortMenuTitle}>Sort customers</div>
                    {CLIENT_SORTS.map((option) => (
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
            <p className={styles.emptyQueue}>
              Nobody matches that.{' '}
              <button type="button" className={styles.clearBtn} onClick={() => { setQuery(''); setStage('all'); setMissingContactOnly(false); }}>
                Clear the filters
              </button>
            </p>
          ) : (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
            <ul className={styles.rows} onKeyDown={onQueueKeyDown}>
              {visible.map((client) => {
                const on = client.id === selectedId;
                const band = bandFor(client, todayKey);
                return (
                  <li key={client.id}>
                    <a
                      id={`client-row-${client.id}`}
                      href={`${base}/clients/${client.id}`}
                      className={`${styles.row}${on ? ` ${styles.rowOn}` : ''}`}
                      aria-current={on ? 'true' : undefined}
                      onClick={(event) => rowClick(event, client.id, !isWide())}
                      onMouseEnter={() => armPrefetch(client.id)}
                      onMouseLeave={cancelPrefetch}
                    >
                      <span
                        className={styles.clientMono}
                        style={{ '--cover-hue': hueFor(client.id) } as React.CSSProperties}
                        aria-hidden="true"
                      >
                        {client.initials}
                      </span>
                      <span className={styles.rowMain}>
                        <span className={styles.rowTop}>
                          <strong className={styles.rowName}>{client.name}</strong>
                          {/* The band as a word, never only a color. */}
                          <span className={styles.rowHeat} data-band={band}>{BAND_LABEL[band]}</span>
                        </span>
                        <span className={styles.rowDetail}>{client.address || client.contactLine || 'No contact details'}</span>
                        <span className={styles.rowMeta}>
                          <span className={styles.rowStage} data-band={band}>{client.jobsLabel}</span>
                          <span className={styles.rowWait}>{whenLabel(client, todayKey)}</span>
                          {client.isRepeat ? <span className={styles.rowPref}>Repeat</span> : null}
                        </span>
                      </span>
                      {client.totalValue > 0 ? <span className={styles.rowValue}>{client.totalLabel}</span> : null}
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

        {/* --- the right pane: the selected customer, or the map --- */}
        <section className={`${styles.detail} ${pageStyles.detail}`} aria-label={pane === 'map' ? 'Customer map' : 'Selected customer'}>
          <button type="button" ref={backRef} className={styles.backBtn} onClick={() => setOnDetailScreen(false)}>
            ← Back to customers
          </button>

          {pane === 'map' ? (
            <div className={styles.mapPane}>
              <div className={styles.mapHead}>
                <h2 className={styles.paneTitle}>Where everybody is</h2>
                <p className={styles.mapNote}>
                  Each customer sits on their most recent job&apos;s address. Pick one to open them.
                  {shown.length !== clients.length ? ' Showing the customers your filter matched.' : ''}
                </p>
              </div>
              {shown.length === 0 ? (
                /* ClientsMap renders NOTHING for an empty list — it returns null
                   before it draws a frame — and until the band filters reached
                   it that could not happen, because the list it got was the
                   whole book. Now it can, and a blank pane under a heading is
                   the worst of the three answers. */
                <p className="empty-state">No customers match that filter, so there is nothing to place on the map.</p>
              ) : pins.length > 0 ? (
                /* `shown`, not `clients`. ClientsMap already drops pins whose
                   customer is not in the list it was handed — "a map that
                   ignores the search is a second, contradictory answer on the
                   same screen", as its own comment says — but it was handed the
                   WHOLE book, so the search box was the only filter it ever
                   obeyed. Pressing "Nothing on the books 22" left it reading
                   "21 of 42 pinned" beside a list of 22. The band filters are
                   filters too. */
                <ClientsMap clients={shown} pins={pins} selectedId={selectedId} onSelect={onSelect} />
              ) : (
                <p className="empty-state">No customer has a geocoded address yet.</p>
              )}
            </div>
          ) : selected ? (
            <>
              {/* 1 — who */}
              <header className={styles.detailHead}>
                <div className={`${styles.recordHeadLayout} ${pageStyles.recordHeadLayout}`}>
                  {/* A customer has no photos, so the monogram IS the cover —
                      same hue function as a job's, so the two panes sit
                      together without looking like different apps. */}
                  <figure
                    className={focusStyles.cover}
                    style={{ '--cover-hue': hueFor(selected.id) } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    <span className={focusStyles.coverArt}>
                      <span className={focusStyles.coverMono}>{selected.initials}</span>
                    </span>
                  </figure>

                  <div className={styles.recordHeadCopy}>
                    <p className={focusStyles.heroTag}>Selected customer</p>
                    <h2 className={styles.detailName}>{selected.name}</h2>
                    <p className={styles.detailProject}>{selected.address || 'No address given'}</p>

                    {/* 2 — the band, and what is true about them */}
                    <div className={styles.detailChips}>
                      <span className={styles.detailStage} data-band={bandFor(selected, todayKey)}>
                        {BAND_LABEL[bandFor(selected, todayKey)]}
                      </span>
                      {selected.isRepeat ? <span className={styles.detailRepeat}>Repeat customer</span> : null}
                      {fresh && fresh.openJobCount > 0 ? (
                        <span className="status-badge">{fresh.openJobCount} job{fresh.openJobCount === 1 ? '' : 's'} open</span>
                      ) : null}
                      {fresh && fresh.totals.outstanding > 0 ? (
                        <span className={styles.detailOwed}>{fresh.totals.outstandingLabel} owed</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* 3 — the four facts, straight off the row the server shipped */}
                <dl className={styles.facts}>
                  <div>
                    <dt>Jobs</dt>
                    <dd>{selected.jobsLabel}</dd>
                  </div>
                  <div>
                    <dt>Total billed</dt>
                    <dd>{selected.totalLabel}</dd>
                  </div>
                  <div>
                    <dt>Last job</dt>
                    <dd>{selected.lastLabel}</dd>
                  </div>
                  <div>
                    <dt>{whenHeading(selected)}</dt>
                    <dd className={bandFor(selected, todayKey) === 'drifting' ? styles.waiting : undefined}>
                      {whenLabel(selected, todayKey)}
                    </dd>
                  </div>
                </dl>
              </header>

              {/* 4 — how you reach them */}
              <div className={`${styles.comms} ${pageStyles.comms}`}>
                <div className={styles.commsRow}>
                  {readOnly ? null : <Link className="btn primary" href="/dashboard/jobs?new=1#new-job">+ New job</Link>}
                  {selected.phone ? <a className="btn secondary" href={`tel:${selected.phone}`}>📞 Call</a> : null}
                  {selected.phone ? <a className="btn secondary" href={`sms:${selected.phone}`}>💬 Text</a> : null}
                  {selected.email ? <a className="btn secondary" href={`mailto:${selected.email}`}><MailIcon /> Email</a> : null}
                  {readOnly ? null : <Link className="btn secondary" href={`${base}/clients/${selected.id}#client-profile`}>Edit</Link>}
                  <Link className={styles.quietLink} href={`${base}/clients/${selected.id}`}>Open full profile →</Link>
                </div>
              </div>

              {/* 5 — the detail tabs, the same four Focus shows */}
              {/* The roving tabindex below was here from the start; the arrows
                  that make it navigable were not, so every tab but the open one
                  was unreachable from a keyboard. See nextTabIndex. */}
              <div className={focusStyles.tabs} role="tablist" aria-label="Customer detail sections" onKeyDown={onTabKeyDown}>
                {CLIENT_TABS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    id={`client-smoothie-tab-${entry.id}`}
                    aria-selected={tab === entry.id}
                    aria-controls="client-smoothie-tabpanel"
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
                id="client-smoothie-tabpanel"
                role="tabpanel"
                aria-labelledby={`client-smoothie-tab-${tab}`}
                tabIndex={0}
                key={selected.id}
              >
                {error ? (
                  <p className={focusStyles.error}>{error}</p>
                ) : loading || !fresh ? (
                  <ClientDetailSkeleton />
                ) : (
                  <ClientDetailTabs tab={tab} detail={fresh} base={base} headingLevel={3} />
                )}
              </div>

              {/* 6 — history, cumulative rather than urgent. The one loud figure
                  is what is still owed, because it is the only one anybody acts
                  on today. */}
              <footer className={focusStyles.moneyStrip}>
                <span><small>Jobs</small><strong>{selected.jobCount || '—'}</strong></span>
                <span><small>Billed</small><strong>{fresh ? fresh.totals.quotedLabel : selected.totalLabel}</strong></span>
                <span><small>Paid</small><strong>{fresh ? fresh.totals.paidLabel : '—'}</strong></span>
                <span><small>Customer since</small><strong>{fresh ? fresh.customerSinceLabel : '—'}</strong></span>
                <span className={focusStyles.moneyStripEnd}>
                  <small>Outstanding</small>
                  <strong className={fresh && fresh.totals.outstanding > 0 ? focusStyles.waiting : undefined}>
                    {fresh ? fresh.totals.outstandingLabel : '—'}
                  </strong>
                </span>
              </footer>
            </>
          ) : (
            <p className="empty-state">Pick a customer from the list.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Matches the breakpoint in ../smoothie.module.css — keep the two in step. */
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
    <button
      type="button"
      className={styles.stageChip}
      aria-pressed={active}
      disabled={count === 0 && !active}
      title={count === 0 ? 'No customers in this group' : undefined}
      onClick={() => onPick(id)}
    >
      {label}
      <span className={styles.stageCount}>{count}</span>
    </button>
  );
}
