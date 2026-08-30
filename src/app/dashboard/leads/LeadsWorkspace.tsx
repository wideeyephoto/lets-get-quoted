'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LeadStatus, LeadScore } from '@/lib/leads';
import { DEFAULT_LEADS_VIEW, type LeadsView } from '@/lib/dashboard-views';
import { archiveLeadAction, snoozeLeadAction, updateLeadStatusAction, setLeadsViewAction } from './actions';
import { setMapThemeAction, setMapViewAction } from '@/app/dashboard/view-actions';
import type { MapTheme, MapView } from '@/lib/dashboard-views';
import { leadScoreLabel } from '@/lib/lead-detail-labels';
import ViewGear from '@/components/view-gear';
import PinMap, { type MapPin } from '@/components/pin-map';
import { pinRecordId, revealRow } from '@/lib/reveal-row';
import { scopePinsToFilter } from '@/lib/map-pin-scope';
import LeadFocusView from './LeadFocusView';
import LeadSmoothieView from './LeadSmoothieView';
import LeadPriorityView from './LeadPriorityView';
import LeadBoardView from './LeadBoardView';
import LeadTableView from './LeadTableView';
import QuickAddLeadModal from './QuickAddLeadModal';
import { supabase } from '@/lib/supabase';
import styles from './leads.module.css';

// Display-ready lead shape, built server-side in page.tsx so this client
// component never imports the server-only leads module.
export type LeadViewItem = {
  id: string;
  name: string;
  status: LeadStatus;
  statusLabel: string;
  sourceLabel: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  detail: string;
  estimatedHours: number | null;
  createdAt: string;
  ageLabel: string;
  convertedJob: string | null;
  score: LeadScore;
  hasTriage: boolean;
  scoreLabel: string;
  flags: { key: string; label: string }[];
  textOnly: boolean;
  estimate: { min: number; max: number } | null;
  estimateLabel: string | null;
  timeline: string | null;
  location: string | null;
  /** Just the town, pulled out of the address — null when it can't be read. */
  city: string | null;
  contactLog: { at: string; label: string; note?: string }[];
  isUrgent: boolean;
  /**
   * How long they have been waiting, in words — "3 days waiting" / "3d waiting".
   *
   * Computed on the SERVER, like ageLabel beside it. A clock read during a
   * client render disagrees with the markup the server sent and React throws
   * the server's away. Focus does not use these; Smoothie prints them instead
   * of the bare "94h" that read like a code.
   *
   * NULL ON A WON OR LOST LEAD, which is why these are nullable at all. The
   * clock measured from created_at and never stopped, so a closed lead read
   * "12 minutes waiting" under a Won badge. Nobody is waiting on it; the render
   * sites show `ageLabel` or nothing instead. See waitingFor in lib/lead-queue.
   */
  waitingLong: string | null;
  waitingShort: string | null;
  /**
   * ISO timestamp of the last logged touchpoint, or null if nobody has reached
   * out yet. What "overdue follow-up" is measured from — a lead contacted an
   * hour ago and one contacted nine days ago are both "contacted", and only one
   * of them needs you today.
   */
  lastTouchAt: string | null;
  /** When a snoozed lead comes back, already formatted. Null unless snoozed. */
  snoozedUntilLabel: string | null;
  // Enough to draw a lead's cover before any detail request: what they asked
  // for (picks the trade glyph) and whether a real photo is on its way.
  projectType: string | null;
  photoCount: number;
  /** Short warning shown only during the final week before automatic closure. */
  autoCloseLabel?: string | null;
  /** Campaign acquisition channel (google, meta, tiktok, local, print_qr, promo, direct) */
  attributionChannel?: string | null;
  /** Campaign name */
  campaignName?: string | null;
};

export type ChannelFilter = 'all' | 'google' | 'meta' | 'tiktok' | 'local' | 'print_qr' | 'promo' | 'direct';

export const CHANNEL_FILTER_OPTIONS: { id: ChannelFilter; label: string }[] = [
  { id: 'all', label: 'All sources' },
  { id: 'google', label: '🎯 Google Ads' },
  { id: 'meta', label: '📱 Meta / Instagram' },
  { id: 'tiktok', label: '🎵 TikTok Ads' },
  { id: 'local', label: '🏡 Nextdoor & Local' },
  { id: 'print_qr', label: '🪧 Print & QR Signs' },
  { id: 'promo', label: '🏷️ Website Promos' },
  { id: 'direct', label: '🌐 Direct / Organic' },
];

// Three layouts with distinct jobs. The legacy Focus, Split and Priority views
// remain in the file for one migration window, but are no longer choices; old
// cookies normalize to Inbox in lib/dashboard-views.
const VIEWS: { id: LeadsView; label: string; hint: string }[] = [
  { id: 'smoothie', label: 'Inbox', hint: 'Prioritized queue with one lead open' },
  { id: 'board', label: 'Board', hint: 'Kanban by stage' },
  { id: 'table', label: 'Table', hint: 'Filter, select, export and bulk edit' },
];

function scoreText(item: LeadViewItem) {
  return leadScoreLabel(item.score);
}

// Bottom-of-section explainer: what Hot / Warm / Low actually mean, mirroring
// the chips shown on every card.
function ScoreLegend() {
  return (
    <details className={styles.scoreLegend}>
      <summary className={styles.scoreLegendTitle}>How lead priority works</summary>
      <div className={styles.scoreLegendBody}>
        <div className={styles.scoreLegendRow}>
          <span className={styles.scoreChip} data-score="hot">🔥 Hot</span>
          <span>Ready to hire — a clear job in your area, a realistic budget, and they want it soon (or it&rsquo;s high-value). Contact these first.</span>
        </div>
        <div className={styles.scoreLegendRow}>
          <span className={styles.scoreChip} data-score="warm">Warm</span>
          <span>A real lead worth a follow-up, but something&rsquo;s unconfirmed — the timeline, the budget, or they&rsquo;re still comparing options.</span>
        </div>
        <div className={styles.scoreLegendRow}>
          <span className={styles.scoreChip} data-score="low">Low</span>
          <span>Probably not a fit yet — just researching, out of your area, below your minimum, or work you don&rsquo;t take on.</span>
        </div>
        <p className={styles.scoreLegendNote}>Smart Intake sets this from the homeowner&rsquo;s answers. Open any lead to change its score, or <Link href="/dashboard/automations#intake-ai">configure Smart Intake &rarr;</Link></p>
      </div>
    </details>
  );
}

const VIEW_OPTIONS = VIEWS.map((v) => ({ id: v.id, label: v.label, hint: v.hint }));

export default function LeadsWorkspace({
  leads,
  snoozedLeads = [],
  initialView,
  mapView,
  mapTheme,
  mapPins,
  details,
  initialLeadId,
  basePath = '/dashboard',
  readOnly = false,
  ownerControls = true,
}: {
  leads: LeadViewItem[];
  /** Open on this lead. The demo gives each lead its own shareable URL. */
  initialLeadId?: string;
  /** Snoozed but not archived — the Priority inbox's third group. */
  snoozedLeads?: LeadViewItem[];
  initialView: LeadsView;
  mapView: MapView;
  mapTheme: MapTheme;
  mapPins: MapPin[];
  /**
   * Pre-loaded lead detail, keyed by id. Supplying it makes the Focus and
   * Smoothie panes read from memory instead of calling /api/leads/[id]/detail —
   * which is what lets the logged-out demo render the real workspace.
   */
  details?: Record<string, import('@/lib/lead-detail').LeadDetailDto>;
  basePath?: string;
  /**
   * The logged-out demo.
   *
   * Every lead action on this workspace — mark contacted, snooze, archive, move
   * a stage — funnels through the single `run` below, whichever of the six
   * layouts fired it. So one guard there covers all of them, and the layout
   * pickers stop trying to write a cookie nobody is signed in to own.
   */
  readOnly?: boolean;
  /**
   * Whether to render the controls only an OWNER can actually run.
   *
   * Defaults TRUE so every existing caller is unchanged, and the one surface
   * that admits office users opts out explicitly. What it hides is not a
   * matter of taste: each one either reaches a table RLS does not cover, or
   * sends a text, or opens a page still guarded by requireOwnerContext. A
   * control certain to fail is worse than a control that is absent.
   */
  ownerControls?: boolean;
}) {
  const [view, setView] = useState<LeadsView>(initialView);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  /**
   * Whether the map panel is open.
   *
   * Client state, not the server-rendered cookie, and that is the whole fix.
   * The map used to be a band welded above every view — 414px on desktop and
   * 388px on a phone before anybody reached a lead — and it was tied to the
   * view switcher because both lived in the same gear. Now it is a toolbar
   * toggle that belongs to no view.
   *
   * Starts CLOSED and opens in an effect, so a phone never pays for it: the
   * server cannot know the viewport, and rendering the map only to hide it is
   * the cost we are removing.
   */
  const [mapOpen, setMapOpen] = useState(false);
  // A pin click asks the split or focus view to open that lead. The nonce makes
  // clicking the same pin twice count twice, so re-clicking the lead you're
  // already on still brings its details back into view.
  const [pinRequest, setPinRequest] = useState<{ id: string; nonce: number } | null>(null);
  // Which lead the Focus pane has open, so the map can center on it.
  const [focusLeadId, setFocusLeadId] = useState<string | null>(null);
  // Stable identity: LeadFocusView calls this from an effect, so a new function
  // every render would re-fire it on every render.
  const onFocusSelect = useCallback((id: string | null) => setFocusLeadId(id), []);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Local map color, so the demo's picker works with no cookie behind it.
  const [localMapTheme, setLocalMapTheme] = useState<MapTheme>(mapTheme);
  const effectiveMapTheme = readOnly ? localMapTheme : mapTheme;

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');

  const filteredLeads = useMemo(() => {
    if (channelFilter === 'all') return leads;
    return leads.filter((lead) => (lead.attributionChannel || 'direct') === channelFilter);
  }, [leads, channelFilter]);

  const filteredSnoozedLeads = useMemo(() => {
    if (channelFilter === 'all') return snoozedLeads;
    return snoozedLeads.filter((lead) => (lead.attributionChannel || 'direct') === channelFilter);
  }, [snoozedLeads, channelFilter]);

  const visibleLeadIds = useMemo(() => new Set(filteredLeads.map((lead) => lead.id)), [filteredLeads]);
  // A Leads map maps leads. The global pin query also carries jobs for other
  // workspaces; letting those through made the toggle disagree with the queue.
  const leadPins = useMemo(
    () => scopePinsToFilter(mapPins, 'lead', visibleLeadIds, true),
    [mapPins, visibleLeadIds],
  );

  // Global 'N' shortcut to open quick lead creation modal
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'n' || e.key === 'N') {
        const target = e.target as HTMLElement | null;
        const isFormInput =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          target?.isContentEditable;
        if (!isFormInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          setQuickAddOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  // Real-time intake updates via Supabase Realtime channel
  useEffect(() => {
    if (readOnly) return;
    try {
      const channel = supabase
        .channel('leads-realtime-feed')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'leads' },
          () => {
            router.refresh();
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Leads realtime subscription error:', err);
    }
  }, [router, readOnly]);

  function run(fn: () => Promise<unknown>) {
    // The one chokepoint every lead action goes through. Swallowed rather than
    // hidden: the buttons stay visible, because the demo is showing what the
    // triage controls ARE, and a card with its actions cut out reads as a
    // narrower product than it is.
    if (readOnly) return;
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (error) {
        console.error('Lead action failed:', error);
      }
    });
  }

  function pickView(next: LeadsView) {
    setView(next);
    // Awaited, not fire-and-forget.
    //
    // The layout swaps immediately either way — it is local state — so the
    // missing await was invisible on screen and only showed up on the next page
    // load, which came back in the view you thought you had left. Awaiting
    // inside the transition keeps the swap instant and makes the cookie
    // actually land.
    if (readOnly) return;
    startTransition(async () => {
      try {
        await setLeadsViewAction(next);
      } catch {
        // The layout still changed for this session; only the memory of it is lost.
      }
    });
  }

  // The cookie is now a PREFERENCE, not a layout instruction: the panel opens
  // and closes locally so a toggle never costs a round trip, and the choice is
  // remembered for the next visit. No refresh — the pins are already here.
  function toggleMap() {
    const next = !mapOpen;
    setMapOpen(next);
    if (readOnly) return;
    startTransition(async () => {
      try {
        await setMapViewAction(next ? 'large' : 'off', 'leads');
      } catch {
        // The panel still opened; only the memory of it is lost.
      }
    });
  }

  // Desktop honours the saved preference; a phone always starts closed. Read
  // after mount because the server has no viewport — and because rendering the
  // map and then hiding it is the 388px this change exists to remove.
  useEffect(() => {
    if (mapView === 'off') return;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 920px)').matches) return;
    setMapOpen(true);
  }, [mapView]);

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

  // Smoothie owns its own map — it is a pane you switch to, not a band above
  // the page — so its gear offers the view list and the map's COLOR, and no
  // placement setting that would govern a map this view never renders.
  const smoothie = view === 'smoothie';

  // The view/map settings gear. Lives on the map's legend row when the map is
  // shown; falls back to a small bar when the map is off, so it's always reachable.
  const gear = (
    <ViewGear
      views={VIEW_OPTIONS}
      activeView={view}
      onPickView={pickView}
      // No map PLACEMENT in the gear any more, in any view. Where the map goes
      // is not a view setting — it is a toolbar toggle beside the views now, so
      // leaving a second control for it here would be two switches for one
      // thing. Its color is still a preference, so that stays.
      mapTheme={effectiveMapTheme}
      onSetMapTheme={setTheme}
      label="Layout"
      // Mirrors normalizeLeadsView / normalizeMapTheme — the values this page
      // renders for someone with no cookies at all.
      defaults={{ view: DEFAULT_LEADS_VIEW, mapTheme: 'dark' }}
    />
  );

  if (smoothie) {
    return (
      <div className={pending ? styles.workspaceBusy : undefined}>
        <LeadSmoothieView
          leads={leads}
          run={run}
          onSelect={onFocusSelect}
          openRequest={pinRequest}
          details={details}
          initialLeadId={initialLeadId}
          basePath={basePath}
          mapPins={leadPins}
          mapTheme={effectiveMapTheme}
          gear={gear}
          onOpenQuickAdd={() => setQuickAddOpen(true)}
        />
        <ScoreLegend />
        <QuickAddLeadModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      </div>
    );
  }

  return (
    <div className={pending ? styles.workspaceBusy : undefined}>
      {/* One toolbar for every view: which layout, channel filter, and whether the map is on.
          Two independent choices that used to be one control. */}
      <div className={styles.viewBar}>
        {gear}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <label htmlFor="leads-channel-filter" style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600 }}>Source</label>
          <select
            id="leads-channel-filter"
            style={{
              padding: '0.35rem 0.6rem',
              fontSize: '0.82rem',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
              background: 'var(--surface-subtle, rgba(0,0,0,0.2))',
              color: 'var(--foreground)',
            }}
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
          >
            {CHANNEL_FILTER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={styles.mapToggle}
          aria-pressed={mapOpen}
          aria-controls="leads-map-panel"
          // A Leads control counts lead locations from this page. Job pins from
          // the shared map query belong in the Jobs and Schedule workspaces.
          aria-label={`Map — ${leadPins.length} lead ${leadPins.length === 1 ? 'location' : 'locations'}`}
          onClick={toggleMap}
        >
          <span aria-hidden="true">🗺</span> Map
          <span className={styles.mapToggleCount}>{leadPins.length}</span>
        </button>
      </div>

      {mapOpen ? (
        <div className="workspace-embedded-map" id="leads-map-panel">
          <PinMap
            pins={leadPins}
            theme={mapTheme}
            focusPinId={view === 'focus' && focusLeadId ? `lead-${focusLeadId}` : null}
            // A pin is the same lead as the row below it; clicking one should
            // take you to the other rather than making you hunt for it.
            onPinClick={(pin) => {
              const id = pinRecordId(pin.id, 'lead');
              if (!id) return;
              // Split and Focus show one lead at a time, so "go to it" means
              // open it; the other layouts are lists, so it means scroll to its
              // row.
              setPinRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
              revealRow(`lead-row-${id}`);
            }}
          />
        </div>
      ) : null}

      {view === 'board' && <LeadBoardView leads={filteredLeads} run={run} ownerControls={ownerControls} />}
      {view === 'inbox' && <LeadPriorityView leads={filteredLeads} snoozed={filteredSnoozedLeads} run={run} ownerControls={ownerControls} />}
      {view === 'table' && <LeadTableView leads={filteredLeads} run={run} onOpenQuickAdd={() => setQuickAddOpen(true)} />}
      {view === 'split' && <SplitView leads={filteredLeads} run={run} openRequest={pinRequest} ownerControls={ownerControls} />}
      {view === 'focus' && <LeadFocusView leads={filteredLeads} run={run} onSelect={onFocusSelect} openRequest={pinRequest} details={details} initialLeadId={initialLeadId} basePath={basePath} ownerControls={ownerControls} />}

      <ScoreLegend />
      <QuickAddLeadModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
    </div>
  );
}

/* ---------------- Split view (list + detail) ---------------- */
function SplitView({
  leads,
  run,
  openRequest,
  ownerControls,
}: {
  leads: LeadViewItem[];
  run: (fn: () => Promise<unknown>) => void;
  /** A pin on the map asking for a lead; the nonce lets the same one repeat. */
  openRequest?: { id: string; nonce: number } | null;
  ownerControls: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null);
  const selected = leads.find((l) => l.id === selectedId) ?? leads[0] ?? null;
  const detailRef = useRef<HTMLDivElement | null>(null);

  // Same treatment the jobs pipeline gives a pin click: open the record, bring
  // its detail into view, and center its row in the list's own scroller — each
  // only when it isn't already fully visible, so working down the list on a
  // wide monitor doesn't yank the page or shunt the row under the cursor.
  const reveal = useCallback((id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => {
      const detail = detailRef.current;
      if (detail) {
        const box = detail.getBoundingClientRect();
        if (box.top < 0 || box.bottom > window.innerHeight) {
          detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      const row = document.getElementById(`lead-row-${id}`);
      const list = row?.parentElement;
      if (!row || !list) return;
      const r = row.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      if (r.top < l.top || r.bottom > l.bottom) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  useEffect(() => {
    if (!openRequest) return;
    if (!leads.some((l) => l.id === openRequest.id)) return; // filtered out
    revealRef.current(openRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  return (
    <div className={styles.splitWrap}>
      <div className={styles.splitList}>
        {leads.map((lead) => (
          <button
            type="button"
            id={`lead-row-${lead.id}`}
            key={lead.id}
            className={`${styles.splitRow}${selected?.id === lead.id ? ` ${styles.splitRowOn}` : ''}`}
            onClick={() => setSelectedId(lead.id)}
          >
            <span className={styles.heatDot} data-score={lead.score} aria-hidden="true" />
            <span className={styles.splitRowBody}>
              <strong>{lead.name}</strong>
              <span>{lead.detail}</span>
            </span>
          </button>
        ))}
        {leads.length === 0 && <p className={styles.empty}>No active leads.</p>}
      </div>

      {selected ? (
        <div className={styles.splitDetail} key={selected.id} ref={detailRef}>
          <div className={styles.sdHead}>
            <div>
              <p className="eyebrow">Lead details</p>
              <h3 className={styles.sdName}>{selected.name}</h3>
            </div>
            <div className={styles.sdBadges}>
              {selected.hasTriage && <span className={styles.scoreChip} data-score={selected.score}>{scoreText(selected)}</span>}
              <span className={styles.statusBadge}>{selected.statusLabel}</span>
              {selected.textOnly && <span className={styles.textOnlyChip}>💬 Text only</span>}
            </div>
          </div>

          {selected.flags.length > 0 && (
            <div className={styles.cardChips}>
              {selected.flags.map((flag) => <span className={styles.flagChip} key={flag.key}>{flag.label}</span>)}
            </div>
          )}

          <div className={styles.sdGrid}>
            <div className={styles.sdBox}>
              <span className={styles.sdLabel}>Contact</span>
              {selected.phone ? <a href={`tel:${selected.phone}`}>{selected.phone}</a> : <span className={styles.tMuted}>No phone</span>}
              {selected.email && <a href={`mailto:${selected.email}`}>{selected.email}</a>}
            </div>
            <div className={styles.sdBox}>
              <span className={styles.sdLabel}>Location</span>
              <span>{selected.address || selected.location || 'Not provided'}</span>
            </div>
            <div className={styles.sdBox}>
              <span className={styles.sdLabel}>Est. value</span>
              <span>{selected.estimateLabel ?? '—'}</span>
            </div>
            <div className={styles.sdBox}>
              <span className={styles.sdLabel}>Timeline</span>
              <span>{selected.timeline || '—'}</span>
            </div>
          </div>

          <div className={styles.sdBox}>
            <span className={styles.sdLabel}>Project</span>
            <span>{selected.detail}</span>
          </div>

          {selected.contactLog.length > 0 && (
            <div className={styles.sdActivity}>
              <span className={styles.sdLabel}>Recent activity</span>
              <ul>
                {selected.contactLog.slice(-4).reverse().map((entry, index) => (
                  <li key={index}><strong>{entry.label}</strong>{entry.note ? ` — ${entry.note}` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.sdActions}>
            {selected.status !== 'contacted' && selected.status !== 'won' && (
              <button type="button" className="btn secondary" onClick={() => run(() => updateLeadStatusAction(selected.id, 'contacted'))}>Mark contacted</button>
            )}
            {/* Mark won hands the service role to applyQuoteAcceptance, which
                writes job_feed -- a table RLS does not cover. Owner only. */}
            {ownerControls ? (
            <button type="button" className="btn secondary" onClick={() => run(() => updateLeadStatusAction(selected.id, 'won'))}>Mark won</button>
            ) : null}
            <button type="button" className="btn ghost" onClick={() => run(() => snoozeLeadAction(selected.id, 3))}>Snooze 3d</button>
            <button type="button" className="btn ghost" onClick={() => run(() => archiveLeadAction(selected.id, true))}>Archive</button>
            <Link className="btn primary" href={`/dashboard/leads/${selected.id}`}>Open full lead →</Link>
          </div>
        </div>
      ) : (
        <div className={styles.splitDetail}><p className="empty-state">Select a lead to see the details.</p></div>
      )}
    </div>
  );
}
