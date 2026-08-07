'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { LeadDetailDto } from '@/lib/lead-detail';
import { leadScoreLabel } from '@/lib/lead-detail-labels';
import type { MapPin } from '@/components/pin-map';
import PinMap from '@/components/pin-map';
import { pinRecordId } from '@/lib/reveal-row';
import {
  QUEUE_SORTS,
  QUEUE_STAGES,
  contactPlan,
  matchesQuery,
  queueStageLabel,
  sortQueue,
  stageCounts,
  type QueueSort,
  type StageFilter,
} from '@/lib/lead-queue';
import type { LeadViewItem } from './LeadsWorkspace';
import { focusQueueRow, useQueueWindow } from '../use-queue-window';
import { archiveLeadAction, snoozeLeadAction, updateLeadStatusAction } from './actions';
import { useLeadDetail } from './use-lead-detail';
import LeadDetailTabs, { LEAD_TABS, LeadDetailSkeleton, type LeadTabId } from './LeadDetailTabs';
import focusStyles from '../focus.module.css';
import leadStyles from './leads.module.css';
import styles from '../smoothie.module.css';

/**
 * Smoothie — Focus, led by the queue instead of by one lead.
 *
 * Same data, same actions, same look. What moves is the order you meet things
 * in. Focus opens with a full-width map and one lead below it; the first
 * question on this page is "who do I call next", and a map cannot answer that.
 * So the queue comes first — searchable, stage-filtered, priority-sorted — and
 * the map becomes a mode of the right-hand pane rather than a band above
 * everything.
 *
 * Three rules it holds itself to:
 *   * ONE set of stage words and numbers. lib/lead-queue owns them, so a chip,
 *     a row badge and the pane header cannot disagree about what stage a lead
 *     is in or how many are in it.
 *   * The contact preference decides which button is primary. A homeowner who
 *     ticked "text only" and then gets phoned is a homeowner you have already
 *     annoyed.
 *   * One scroll context. Nothing here has its own scrollbar — not the queue,
 *     not the detail. On a phone the list and the detail are separate screens
 *     rather than a detail buried under a long list. The queue keeps that rule
 *     by having an END instead: one page of rows and a control for the rest.
 *     See @/lib/queue-window.
 */

const HEAT_HELP: Record<LeadViewItem['score'], string> = {
  hot: 'Ready to hire — call first',
  warm: 'Real lead, something unconfirmed',
  low: 'Probably not a fit yet',
};

export default function LeadSmoothieView({
  leads,
  run,
  onSelect,
  openRequest,
  details,
  basePath = '/dashboard',
  initialLeadId,
  mapPins = [],
  mapTheme = 'dark',
  gear,
}: {
  leads: LeadViewItem[];
  run: (fn: () => Promise<unknown>) => void;
  onSelect?: (leadId: string | null) => void;
  openRequest?: { id: string; nonce: number } | null;
  basePath?: string;
  initialLeadId?: string;
  details?: Record<string, LeadDetailDto>;
  /** The same pins the embedded map uses — this view puts them in a pane. */
  mapPins?: MapPin[];
  mapTheme?: 'dark' | 'light';
  /** The view/settings gear, so it sits in this view's own toolbar. */
  gear?: ReactNode;
}) {
  const base = basePath;

  const [stage, setStage] = useState<StageFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<QueueSort>('priority');
  const [pane, setPane] = useState<'leads' | 'map'>('leads');
  // Phones only: which screen of the lead workflow is showing. Desktop renders
  // both columns and ignores this.
  const [onDetailScreen, setOnDetailScreen] = useState(false);
  const [tab, setTab] = useState<LeadTabId>('overview');
  const [markerLead, setMarkerLead] = useState<string | null>(null);

  const backRef = useRef<HTMLButtonElement | null>(null);
  const queueRef = useRef<HTMLDivElement | null>(null);

  const counts = useMemo(() => stageCounts(leads), [leads]);

  const shown = useMemo(() => {
    const filtered = leads.filter(
      (lead) => (stage === 'all' || lead.status === stage) && matchesQuery(lead, query),
    );
    return sortQueue(filtered, sort);
  }, [leads, stage, query, sort]);

  // Opens on the head of the QUEUE, not on leads[0]. The list arrives newest
  // first and the queue is ordered by priority, so leads[0] is routinely a long
  // way down it — the pane showed one lead while the orange row sat forty rows
  // below, and the window below would have had to open that far to reach it.
  const [selectedId, setSelectedId] = useState<string | null>(
    (initialLeadId && leads.some((lead) => lead.id === initialLeadId) ? initialLeadId : shown[0]?.id) ?? null,
  );
  const selected = useMemo(() => leads.find((lead) => lead.id === selectedId) ?? null, [leads, selectedId]);

  // How much of the queue is drawn. The whole thing was, which at a hundred
  // leads is a column several times the height of the pane beside it.
  const selectedIndex = useMemo(() => shown.findIndex((lead) => lead.id === selectedId), [shown, selectedId]);
  const win = useQueueWindow({
    total: shown.length,
    selectedIndex,
    resetKey: `${stage}|${sort}|${query}`,
    plural: 'leads',
  });
  const visible = useMemo(() => shown.slice(0, win.end), [shown, win.end]);

  const { detail, loading, error, armPrefetch, cancelPrefetch } = useLeadDetail({ selectedId, leads, details });

  // Only the opportunities: leads and quotes out. A scheduled job is work
  // already won, and on a busy territory it buries the two kinds you came here
  // to act on. Still one legend click away — see PinMap's initialHidden.
  const openPinCount = useMemo(() => mapPins.filter((pin) => pin.kind !== 'scheduled').length, [mapPins]);
  const [visiblePins, setVisiblePins] = useState<number | null>(null);
  const mapCount = visiblePins ?? openPinCount;

  useEffect(() => {
    onSelect?.(selectedId);
  }, [selectedId, onSelect]);

  // Selecting never navigates. On a phone it moves to the detail screen and
  // sends focus to Back, so a keyboard or screen-reader user lands at the top of
  // the new screen instead of wherever the list left them.
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

  // A pin asked for a lead. Same path as a click on a row.
  useEffect(() => {
    if (!openRequest) return;
    if (!leads.some((lead) => lead.id === openRequest.id)) return;
    selectRef.current(openRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  // Keyboard traversal of the queue, matching Focus. Arrowing past the last
  // drawn row selects the next one anyway — selecting always draws it — so the
  // window opens under the keyboard rather than the queue ending early for
  // anyone not using a mouse.
  function onQueueKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = shown.findIndex((lead) => lead.id === selectedId);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    if (next < 0 || next >= shown.length) return;
    select(shown[next].id);
    focusQueueRow(`lead-row-${shown[next].id}`, next < win.end);
  }

  // Reveal, then land on the first row that appeared. Without it the button can
  // be the last thing revealed away, leaving focus on nothing.
  function reveal(all: boolean) {
    const first = shown[win.nextIndex];
    if (all) win.showAll();
    else win.showMore();
    if (first) focusQueueRow(`lead-row-${first.id}`, false);
  }

  // Rows stay real links so cmd/middle-click opens the full lead page and the
  // URL is copyable. A plain <button> would silently kill both.
  function rowClick(event: React.MouseEvent, id: string, mobile: boolean) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    select(id, { fromMobileList: mobile });
  }

  if (leads.length === 0) {
    return <p className="empty-state">No active leads right now.</p>;
  }

  const fresh = detail && detail.id === selectedId ? detail : null;
  const plan = selected
    ? contactPlan({ textOnly: selected.textOnly, hasPhone: Boolean(selected.phone), hasEmail: Boolean(selected.email) })
    : null;

  return (
    <div
      className={styles.smoothie}
      data-pane={pane}
      data-screen={onDetailScreen ? 'detail' : 'list'}
    >
      {/* --- stage filters: one set of words, one set of numbers --- */}
      <div className={styles.stageBar} role="group" aria-label="Filter by pipeline stage">
        <StageChip id="all" label="All open" count={counts.all} active={stage === 'all'} onPick={setStage} />
        {QUEUE_STAGES.map((entry) => (
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
          <label className={styles.srOnly} htmlFor="smoothie-search">Search leads by customer, project or location</label>
          <input
            id="smoothie-search"
            type="search"
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customer, project or town"
          />
        </div>

        <div className={styles.sortWrap}>
          <label className={styles.sortLabel} htmlFor="smoothie-sort">Sort</label>
          <select
            id="smoothie-sort"
            className={styles.sort}
            value={sort}
            onChange={(event) => setSort(event.target.value as QueueSort)}
          >
            {QUEUE_SORTS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.paneSwitch} role="group" aria-label="Show leads or the map">
          <button
            type="button"
            className={styles.paneBtn}
            aria-pressed={pane === 'leads'}
            onClick={() => setPane('leads')}
          >
            Leads
          </button>
          <button
            type="button"
            className={styles.paneBtn}
            aria-pressed={pane === 'map'}
            onClick={() => setPane('map')}
          >
            Map <span className={styles.paneCount}>{mapCount}</span>
          </button>
        </div>

        {gear ? <div className={styles.gearSlot}>{gear}</div> : null}

        {/* Reachable without opening the navigation menu, on every width. The
            form itself is further down the page and already exists; this opens
            it rather than being a second one. */}
        <a
          className={styles.addLead}
          href="#add-lead"
          onClick={(event) => {
            const target = document.getElementById('add-lead');
            if (!(target instanceof HTMLDetailsElement)) return;
            event.preventDefault();
            target.open = true;
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
          }}
        >
          + Add lead
        </a>
      </div>

      {/* Announced rather than merely displayed: filtering with a screen reader
          otherwise gives no feedback that anything happened. */}
      {/* Filter results only. The WINDOW count deliberately stays out: it moves
          every time the selection steps past the last drawn row, so putting it
          in a live region made arrowing down the queue re-announce "Showing 26
          of 100… 27 of 100…" over the top of each row. It is announced where it
          belongs instead — as ordinary text at the foot of the list, in reading
          order, next to the button that changes it. */}
      <p className={styles.srOnly} role="status">
        {shown.length} of {leads.length} leads match.
      </p>

      <div className={styles.body}>
        {/* --- the queue --- */}
        <section className={styles.queue} aria-label="Lead queue" ref={queueRef}>
          <div className={styles.queueHead}>
            <h2 className={styles.queueTitle}>Lead queue</h2>
            <span className={styles.queueCount}>
              {shown.length === leads.length ? `${leads.length}` : `${shown.length} of ${leads.length}`}
            </span>
          </div>

          {shown.length === 0 ? (
            <p className={styles.emptyQueue}>
              No leads match that. <button type="button" className={styles.clearBtn} onClick={() => { setQuery(''); setStage('all'); }}>Clear the filters</button>
            </p>
          ) : (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
            <ul className={styles.rows} onKeyDown={onQueueKeyDown}>
              {visible.map((lead) => {
                const on = lead.id === selectedId;
                return (
                  <li key={lead.id}>
                    <a
                      id={`lead-row-${lead.id}`}
                      href={`${base}/leads/${lead.id}`}
                      className={`${styles.row}${on ? ` ${styles.rowOn}` : ''}`}
                      aria-current={on ? 'true' : undefined}
                      onClick={(event) => rowClick(event, lead.id, !isWide())}
                      onMouseEnter={() => armPrefetch(lead.id)}
                      onMouseLeave={cancelPrefetch}
                    >
                      <span className={`${leadStyles.heatDot} ${styles.rowDot}`} data-score={lead.score} aria-hidden="true" />
                      <span className={styles.rowMain}>
                        <span className={styles.rowTop}>
                          <strong className={styles.rowName}>
                            {lead.name}
                            {lead.city ? <span className={styles.rowCity}> ({lead.city})</span> : null}
                          </strong>
                          {/* Heat as a word, not only a coloured dot. */}
                          <span className={styles.rowHeat} data-score={lead.score}>{leadScoreLabel(lead.score)}</span>
                        </span>
                        <span className={styles.rowDetail}>{lead.detail}</span>
                        <span className={styles.rowMeta}>
                          <span className={styles.rowStage} data-stage={lead.status}>{queueStageLabel(lead.status)}</span>
                          <span className={styles.rowWait}>{lead.waitingShort}</span>
                          {lead.textOnly ? <span className={styles.rowPref}>Text only</span> : null}
                        </span>
                      </span>
                      {/* No placeholder dash. On desktop it is a column that
                          simply has nothing in it; on a phone the value drops
                          to its own line, and a lone "—" there reads as a
                          rendering fault rather than as "not estimated". */}
                      {lead.estimateLabel ? <span className={styles.rowValue}>{lead.estimateLabel}</span> : null}
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

        {/* --- the right pane: the selected lead, or the map --- */}
        <section
          className={styles.detail}
          aria-label={pane === 'map' ? 'Lead map' : 'Selected lead'}
        >
          {/* Phones only — desktop keeps the queue on screen so there is
              nothing to go back to. display:none removes it from the
              accessibility tree entirely rather than hiding it visually. */}
          <button
            type="button"
            ref={backRef}
            className={styles.backBtn}
            onClick={() => setOnDetailScreen(false)}
          >
            ← Back to leads
          </button>

          {pane === 'map' ? (
            <div className={styles.mapPane}>
              <div className={styles.mapHead}>
                <h2 className={styles.paneTitle}>Where the work is</h2>
                <p className={styles.mapNote}>
                  Active leads and quotes out. Scheduled jobs are switched off — turn them on in the legend.
                </p>
              </div>
              <PinMap
                pins={mapPins}
                theme={mapTheme}
                initialHidden={['scheduled']}
                spreadOverlap
                onVisibleCountChange={setVisiblePins}
                focusPinId={selectedId ? `lead-${selectedId}` : null}
                onPinClick={(pin) => {
                  const id = pinRecordId(pin.id, 'lead');
                  if (!id) return; // job pins belong to the jobs page
                  if (!leads.some((lead) => lead.id === id)) return; // filtered out
                  select(id);
                  setMarkerLead(id);
                }}
              />
              {markerLead && selected ? (
                <div className={styles.markerBar}>
                  <span>
                    Selected <strong>{selected.name}</strong> on the map.
                  </span>
                  <button type="button" className="btn secondary" onClick={() => setPane('leads')}>
                    Open lead details
                  </button>
                </div>
              ) : null}
            </div>
          ) : selected && plan ? (
            <>
              {/* 1 — who and what */}
              <header className={styles.detailHead}>
                <p className={focusStyles.heroTag}>Selected lead</p>
                <h2 className={styles.detailName}>
                  {selected.name}
                  {selected.city ? <span className={styles.detailCity}> ({selected.city})</span> : null}
                </h2>
                <p className={styles.detailProject}>{selected.detail}</p>

                {/* 2 — heat, stage, contact preference */}
                <div className={styles.detailChips}>
                  {selected.hasTriage ? (
                    <span className={leadStyles.scoreChip} data-score={selected.score} title={HEAT_HELP[selected.score]}>
                      {leadScoreLabel(selected.score)}
                    </span>
                  ) : null}
                  <span className={styles.detailStage} data-stage={selected.status}>
                    {queueStageLabel(selected.status)}
                  </span>
                  {selected.textOnly ? <span className={leadStyles.textOnlyChip}>💬 Text only</span> : null}
                  {selected.flags.slice(0, 3).map((flag) => (
                    <span className={leadStyles.flagChip} key={flag.key}>{flag.label}</span>
                  ))}
                </div>

                {/* 3 — the four facts that decide what you do next */}
                <dl className={styles.facts}>
                  <div>
                    <dt>Est. value</dt>
                    <dd>{selected.estimateLabel ?? 'Not estimated'}</dd>
                  </div>
                  <div>
                    <dt>Wants it</dt>
                    <dd>{selected.timeline || 'Not said'}</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>{selected.address || selected.location || 'No address given'}</dd>
                  </div>
                  <div>
                    <dt>Waiting</dt>
                    <dd className={selected.isUrgent ? styles.waiting : undefined}>{selected.waitingLong}</dd>
                  </div>
                </dl>
              </header>

              {/* 4 — communication, ordered by how they asked to be contacted */}
              <div className={styles.comms}>
                <p className={styles.commsNote}>{plan.note}</p>
                <div className={styles.commsRow}>
                  {selected.phone ? (
                    <a className={`btn ${plan.primary === 'text' ? 'primary' : 'secondary'}`} href={`sms:${selected.phone}`}>
                      💬 Text customer
                    </a>
                  ) : null}
                  <Link
                    className={`btn ${plan.primary === 'text' ? 'secondary' : 'primary'}`}
                    href={`${base}/leads/${selected.id}#lead-estimate`}
                  >
                    Send quote
                  </Link>
                  {selected.phone ? (
                    <a className={styles.callQuiet} href={`tel:${selected.phone}`}>
                      📞 {plan.callLabel}
                    </a>
                  ) : null}
                  {selected.email ? (
                    <a className={styles.callQuiet} href={`mailto:${selected.email}`}>✉️ Email</a>
                  ) : null}
                </div>
              </div>

              {/* 5 — lifecycle, kept apart from the buttons above */}
              <div className={styles.lifecycle}>
                <span className={styles.lifecycleLabel}>Move this lead</span>
                <div className={styles.lifecycleRow}>
                  {selected.status !== 'contacted' && selected.status !== 'won' ? (
                    <button type="button" className={styles.quietBtn} onClick={() => run(() => updateLeadStatusAction(selected.id, 'contacted'))}>
                      Mark contacted
                    </button>
                  ) : null}
                  {selected.status !== 'won' ? (
                    <button type="button" className={styles.quietBtn} onClick={() => run(() => updateLeadStatusAction(selected.id, 'won'))}>
                      Mark won
                    </button>
                  ) : null}
                  <button type="button" className={styles.quietBtn} onClick={() => run(() => snoozeLeadAction(selected.id, 3))}>
                    Snooze 3 days
                  </button>
                  {/* "Set aside" said nothing about what happens. It archives:
                      the lead leaves the queue and lands in the Set aside
                      drawer at the foot of this page, where it can be restored. */}
                  <button
                    type="button"
                    className={styles.quietBtn}
                    onClick={() => run(() => archiveLeadAction(selected.id, true))}
                    title="Archives the lead. It leaves the queue and moves to the Set aside drawer at the foot of this page, where you can restore it."
                  >
                    Archive (out of the queue)
                  </button>
                  <Link className={styles.quietLink} href={`${base}/leads/${selected.id}`}>
                    Open full lead →
                  </Link>
                </div>
              </div>

              {/* 6 — the detail tabs */}
              <div className={focusStyles.tabs} role="tablist" aria-label="Lead detail sections">
                {LEAD_TABS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    id={`smoothie-tab-${entry.id}`}
                    aria-selected={tab === entry.id}
                    aria-controls="smoothie-tabpanel"
                    tabIndex={tab === entry.id ? 0 : -1}
                    className={`${focusStyles.tab}${tab === entry.id ? ` ${focusStyles.tabOn}` : ''}`}
                    onClick={() => setTab(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              <div
                className={styles.tabBody}
                id="smoothie-tabpanel"
                role="tabpanel"
                aria-labelledby={`smoothie-tab-${tab}`}
                tabIndex={0}
                key={selected.id}
              >
                {error ? (
                  <p className={focusStyles.error}>{error}</p>
                ) : loading || !fresh ? (
                  <LeadDetailSkeleton />
                ) : (
                  <LeadDetailTabs tab={tab} detail={fresh} lead={selected} base={base} headingLevel={3} />
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">Pick a lead from the queue.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Whether both columns are on screen.
 *
 * Read at click time rather than held in state: a media query in state needs a
 * listener and a re-render, and the only thing this decides is whether a click
 * ALSO moves to the mobile detail screen. Matches the breakpoint in
 * ../smoothie.module.css — keep the two in step.
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
    <button
      type="button"
      className={styles.stageChip}
      aria-pressed={active}
      onClick={() => onPick(id)}
    >
      {label}
      <span className={styles.stageCount}>{count}</span>
    </button>
  );
}
