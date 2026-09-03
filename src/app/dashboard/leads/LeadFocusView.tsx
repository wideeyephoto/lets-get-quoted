'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { LeadDetailDto } from '@/lib/lead-detail';
import { leadScoreLabel } from '@/lib/lead-detail-labels';
import type { LeadViewItem } from './LeadsWorkspace';
import RecordPhotos from '../RecordPhotos';
import { archiveLeadAction, snoozeLeadAction, updateLeadStatusAction, updateLeadNameAction } from './actions';
import { useLeadDetail } from './use-lead-detail';
import { nextTabIndex } from '@/lib/tab-strip';
import LeadDetailTabs, { LEAD_TABS, LeadDetailSkeleton, type LeadTabId } from './LeadDetailTabs';
import VoiceCaptureButton from '@/components/ai/VoiceCaptureButton';
import { QuickEditNameModal, quickEditStyles } from '@/components/quick-edit';
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

// The tabs, the panels behind them and the detail-loading model all live in
// their own modules now (LeadDetailTabs / use-lead-detail) so the Smoothie view
// shares them instead of carrying a second copy. Nothing about this view's
// behavior changed in that move.

export default function LeadFocusView({
  leads,
  run,
  onSelect,
  openRequest,
  details,
  basePath = '/dashboard',
  initialLeadId,
  ownerControls,
}: {
  leads: LeadViewItem[];
  run: (fn: () => Promise<unknown>) => void;
  onSelect?: (leadId: string | null) => void;
  /** See LeadsWorkspace: controls only an owner can actually run. */
  ownerControls: boolean;
  /** A pin on the map asking for a lead; the nonce lets the same one repeat. */
  openRequest?: { id: string; nonce: number } | null;
  /** See FocusView — the logged-out demo passes '/demo' so its links stay inside it. */
  basePath?: string;
  /** Which row to open on. Lets /demo/leads/<id> land on the lead it names. */
  initialLeadId?: string;
  /**
   * Pre-loaded detail, keyed by lead id. Supplying it makes the pane read from
   * memory instead of calling the API — which is what lets the logged-out demo
   * render THIS component rather than a replica of it that drifts. Absent in
   * the real app, where the detail is far too big to ship with the list.
   */
  details?: Record<string, LeadDetailDto>;
}) {
  const base = basePath;
  const [selectedId, setSelectedId] = useState<string | null>(
    (initialLeadId && leads.some((lead) => lead.id === initialLeadId) ? initialLeadId : leads[0]?.id) ?? null,
  );
  const [tab, setTab] = useState<LeadTabId>('overview');
  const paneRef = useRef<HTMLElement | null>(null);
  // Roving tabindex needs somewhere to send focus when an arrow moves the
  // selection — see nextTabIndex.
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, LEAD_TABS.findIndex((t) => t.id === tab), LEAD_TABS.length);
    if (next === null) return;
    event.preventDefault();
    const id = LEAD_TABS[next].id;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  const router = useRouter();
  const [isEditingName, setIsEditingName] = useState(false);
  const selected = useMemo(() => leads.find((l) => l.id === selectedId) ?? null, [leads, selectedId]);

  const { detail, loading, error, armPrefetch, cancelPrefetch } = useLeadDetail({ selectedId, leads, details });

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
  // the pane scrolls into view and the row centers itself exactly as it would.
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

  // Center the selected row in the list. The list scrolls independently of the
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
                <RecordPhotos
                  kind="lead"
                  recordId={selected.id}
                  subject={selected.projectType || selected.detail}
                  photoUrl={fresh?.photos[0]?.url ?? null}
                  photoCount={selected.photoCount}
                  photoTotal={fresh?.photoCount}
                  title={`Photos · ${selected.name || 'Lead'}`}
                  emptyLabel="No photos yet. Add photos of the project so you can quote it faster."
                  canOpen={base === '/dashboard'}
                />
                <div className={styles.heroCopy}>
                  <p className={styles.heroTag}>Selected lead</p>
                  <div className={styles.heroTop}>
                    {/* The town rides with the name everywhere it appears. Two
                        leads called Brennan on one screen are told apart by
                        where they are, and it's also what decides which one is
                        worth driving to first. */}
                    <div className={quickEditStyles.headerTitleRow}>
                      <h2>
                        {selected.name}
                        {selected.city ? <span className={styles.heroCity}> ({selected.city})</span> : null}
                      </h2>
                      <button
                        type="button"
                        className={quickEditStyles.quickEditBtn}
                        onClick={() => setIsEditingName(true)}
                        aria-label="Edit lead name"
                      >
                        Edit
                      </button>
                    </div>
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
                    <VoiceCaptureButton
                      targetType="lead"
                      targetId={selected.id}
                      contextTitle={selected.name}
                      label="🎙️ Voice Update"
                    />
                    {selected.phone && !selected.textOnly && (
                      <a className="btn primary" href={`tel:${selected.phone}`}>
                        📞 Call
                      </a>
                    )}
                    {selected.phone && (
                      <a className={`btn ${selected.textOnly ? 'primary' : 'secondary'}`} href={`sms:${selected.phone}`}>
                        💬 Text
                      </a>
                    )}
                    {/* Send quote stays owner-only: it deep-links to the estimate
                        composer, and that whole panel is withheld from an office
                        user because sending needs quotes.write. Opening the lead
                        itself is fine -- the page admits them now. */}
                    {ownerControls ? (
                      <Link className="btn secondary" href={`${base}/leads/${selected.id}#lead-estimate`}>
                        Send quote
                      </Link>
                    ) : null}
                    <Link className="btn ghost" href={`${base}/leads/${selected.id}`}>
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
                    {/* Mark won hands the service role to applyQuoteAcceptance,
                        which writes job_feed -- a table RLS does not cover. */}
                    {ownerControls && selected.status !== 'won' && (
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

            {/* A tab with no panel behind it is a button wearing a tab's name.
                The Smoothie view of this same detail has always been wired
                properly; Focus declared the roles and stopped there, so a
                screen reader was told "tab 3 of 5" and given nothing to move
                into. Same shape as LeadSmoothieView, deliberately. */}
            <div className={styles.tabs} role="tablist" aria-label="Lead detail sections" onKeyDown={onTabKeyDown}>
              {LEAD_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`focus-lead-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="focus-lead-tabpanel"
                  // One tab stop for the strip, arrows to move within it —
                  // otherwise every tab is another Tab press on the way to the
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
              id="focus-lead-tabpanel"
              role="tabpanel"
              aria-labelledby={`focus-lead-tab-${tab}`}
              tabIndex={0}
              key={selected.id}
            >
              {error ? (
                <p className={styles.error}>{error}</p>
              ) : loading || !fresh ? (
                <LeadDetailSkeleton />
              ) : (
                <LeadDetailTabs tab={tab} detail={fresh} lead={selected} base={base} onSelectTab={setTab} />
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
            <QuickEditNameModal
              isOpen={isEditingName}
              onClose={() => setIsEditingName(false)}
              title="Edit lead name"
              label="Client name"
              initialName={selected.name}
              onSave={async (newName) => {
                await updateLeadNameAction(selected.id, newName);
                router.refresh();
              }}
            />
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
                href={`${base}/leads/${lead.id}`}
                className={`${styles.row} ${styles.rowLead}${lead.id === selectedId ? ` ${styles.rowOn}` : ''}`}
                aria-current={lead.id === selectedId ? 'true' : undefined}
                onClick={(event) => rowClick(event, lead.id)}
                onMouseEnter={() => armPrefetch(lead.id)}
                onMouseLeave={cancelPrefetch}
              >
                <span className={`${leadStyles.heatDot} ${styles.rowDot}`} data-score={lead.score} aria-hidden="true" />
                <span className={styles.rowMain}>
                  <strong>
                    {lead.name}
                    {lead.city ? <span className={styles.rowCity}> ({lead.city})</span> : null}
                  </strong>
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
