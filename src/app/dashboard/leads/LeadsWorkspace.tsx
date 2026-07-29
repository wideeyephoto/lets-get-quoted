'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LeadStatus, LeadScore, LeadsView } from '@/lib/leads';
import { archiveLeadAction, declineLeadAction, snoozeLeadAction, updateLeadStatusAction, setLeadsViewAction } from './actions';
import { setMapThemeAction, setMapViewAction } from '@/app/dashboard/view-actions';
import type { MapTheme, MapView } from '@/lib/dashboard-views';
import ViewGear from '@/components/view-gear';
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
  contactLog: { at: string; label: string; note?: string }[];
  isUrgent: boolean;
};

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: 'new', label: 'Needs response' },
  { status: 'contacted', label: 'Contacted' },
  { status: 'quoted', label: 'Quote sent' },
  { status: 'won', label: 'Won' },
  { status: 'lost', label: 'Lost' },
];

const SCORE_RANK: Record<LeadScore, number> = { hot: 0, warm: 1, low: 2 };

const VIEWS: { id: LeadsView; label: string; hint: string }[] = [
  { id: 'board', label: 'Board', hint: 'Kanban by stage' },
  { id: 'inbox', label: 'Priority inbox', hint: 'Hottest first' },
  { id: 'table', label: 'Table', hint: 'Sort & scan' },
  { id: 'split', label: 'Split view', hint: 'List + detail' },
];

function scoreText(item: LeadViewItem) {
  return item.score === 'hot' ? '🔥 Hot' : item.score === 'low' ? 'Low' : 'Warm';
}

// One-tap decline reasons — keys map to LEAD_DECLINE_REASONS server-side. The
// board decline is quiet (no homeowner text); the full texted close-out lives
// on the lead detail page.
const DECLINE_REASONS: { key: string; label: string }[] = [
  { key: 'out_of_area', label: 'Out of area' },
  { key: 'excluded_work', label: 'Not our work' },
  { key: 'below_minimum', label: 'Too small' },
  { key: 'fully_booked', label: 'Fully booked' },
];

// Bottom-of-section explainer: what Hot / Warm / Low actually mean, mirroring
// the chips shown on every card.
function ScoreLegend() {
  return (
    <div className={styles.scoreLegend}>
      <span className={styles.scoreLegendTitle}>How leads are scored</span>
      <div className={styles.scoreLegendRow}>
        <span className={styles.scoreChip} data-score="hot">🔥 Hot</span>
        <span>Ready to hire — a clear job in your area, a realistic budget, and they want it soon (or it&rsquo;s high-value). Call these first.</span>
      </div>
      <div className={styles.scoreLegendRow}>
        <span className={styles.scoreChip} data-score="warm">Warm</span>
        <span>A real lead worth a follow-up, but something&rsquo;s unconfirmed — the timeline, the budget, or they&rsquo;re still comparing options.</span>
      </div>
      <div className={styles.scoreLegendRow}>
        <span className={styles.scoreChip} data-score="low">Low</span>
        <span>Probably not a fit yet — just researching, out of your area, below your minimum, or work you don&rsquo;t take on.</span>
      </div>
      <p className={styles.scoreLegendNote}>Your 24/7 AI Estimator sets this from the homeowner&rsquo;s answers. Open any lead to change its score.</p>
    </div>
  );
}

const VIEW_OPTIONS = VIEWS.map((v) => ({ id: v.id, label: v.label, hint: v.hint }));

export default function LeadsWorkspace({ leads, initialView, mapView, mapTheme }: { leads: LeadViewItem[]; initialView: LeadsView; mapView: MapView; mapTheme: MapTheme }) {
  const [view, setView] = useState<LeadsView>(initialView);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
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
    // Persist the choice; fire-and-forget (no refresh needed).
    startTransition(() => setLeadsViewAction(next).catch(() => {}));
  }

  // Map placement (off / large / mini) is server-rendered from the cookie;
  // changing it persists then refreshes so the page re-renders in place.
  function setMap(next: MapView) {
    startTransition(async () => {
      await setMapViewAction(next, 'leads');
      router.refresh();
    });
  }
  function setTheme(next: MapTheme) {
    startTransition(async () => {
      await setMapThemeAction(next);
      router.refresh();
    });
  }

  return (
    <div className={pending ? styles.workspaceBusy : undefined}>
      {view === 'board' && <BoardView leads={leads} run={run} />}
      {view === 'inbox' && <InboxView leads={leads} run={run} />}
      {view === 'table' && <TableView leads={leads} />}
      {view === 'split' && <SplitView leads={leads} run={run} />}

      <div className={styles.viewBar}>
        <ViewGear views={VIEW_OPTIONS} activeView={view} onPickView={pickView} mapView={mapView} onSetMapView={setMap} mapTheme={mapTheme} onSetMapTheme={setTheme} />
      </div>

      <ScoreLegend />
    </div>
  );
}

/* ---------------- Board (kanban by stage) ---------------- */
function BoardView({ leads, run }: { leads: LeadViewItem[]; run: (fn: () => Promise<unknown>) => void }) {
  return (
    <div className={styles.board}>
      {COLUMNS.map((column) => {
        const columnLeads = leads.filter((lead) => lead.status === column.status);
        return (
          <section className={`${styles.column} ${styles[`col_${column.status}`]}`} key={column.status}>
            <header className={styles.columnHeader}><h2>{column.label}</h2><span>{columnLeads.length}</span></header>
            <div className={styles.cards}>
              {columnLeads.map((lead) => <BoardCard key={lead.id} lead={lead} run={run} />)}
              {columnLeads.length === 0 && <p className={styles.empty}>No leads here.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({ lead, run }: { lead: LeadViewItem; run: (fn: () => Promise<unknown>) => void }) {
  const [declining, setDeclining] = useState(false);
  return (
    <div className={`${styles.leadCard}${lead.isUrgent ? ` ${styles.urgentCard}` : ''}`}>
      {/* The card body is the click target (the actions below carry their own). */}
      <Link className={styles.cardBody} href={`/dashboard/leads/${lead.id}`}>
        <div className={styles.cardTopline}><strong>{lead.name}</strong><span className={lead.isUrgent ? styles.needsBadge : styles.statusBadge}>{lead.statusLabel}</span></div>
        {(lead.hasTriage || lead.flags.length > 0) && (
          <div className={styles.cardChips}>
            {lead.hasTriage && <span className={styles.scoreChip} data-score={lead.score}>{scoreText(lead)}</span>}
            {lead.textOnly && <span className={styles.textOnlyChip}>💬 Text only</span>}
            {lead.flags.slice(0, 2).map((flag) => <span className={styles.flagChip} key={flag.key}>{flag.label}</span>)}
          </div>
        )}
        <p>{lead.detail}</p>
        <div className={styles.cardMetaGrid}>
          <span>{lead.sourceLabel}</span>
          <span>Estimated hours: {lead.estimatedHours ? `${lead.estimatedHours} hrs` : 'Not set'}</span>
          <time dateTime={lead.createdAt}>Received {lead.ageLabel} ago</time>
        </div>
        {(lead.phone || lead.email) && <div className={styles.contactHint}>{lead.phone || lead.email}</div>}
      </Link>

      <div className={styles.cardActions}>
        {lead.phone && <a className={styles.callLink} href={`tel:${lead.phone}`} aria-label={`Call ${lead.name}`}>📞 Call</a>}
        {lead.status !== 'lost' && (
          <button type="button" className={styles.declineBtn} aria-expanded={declining} onClick={() => setDeclining((v) => !v)}>Decline</button>
        )}
        {lead.convertedJob && <Link className={styles.openJobLink} href={`/dashboard/jobs/${lead.convertedJob}`}>Open job →</Link>}
      </div>

      {declining && (
        <div className={styles.declineInline}>
          <p>Why decline?</p>
          <div className={styles.declineReasons}>
            {DECLINE_REASONS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={styles.declineChip}
                onClick={() => { setDeclining(false); run(() => declineLeadAction(lead.id, r.key, false)); }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.declineCancel} onClick={() => setDeclining(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Priority inbox (heat-sorted list) ---------------- */
function InboxView({ leads, run }: { leads: LeadViewItem[]; run: (fn: () => Promise<unknown>) => void }) {
  const sorted = useMemo(() => [...leads].sort((a, b) => SCORE_RANK[a.score] - SCORE_RANK[b.score]), [leads]);
  return (
    <div className={styles.inbox}>
      {sorted.map((lead) => (
        <div className={`${styles.inboxRow}${lead.isUrgent ? ` ${styles.inboxUrgent}` : ''}`} key={lead.id}>
          <span className={styles.heatDot} data-score={lead.score} aria-hidden="true" />
          <Link href={`/dashboard/leads/${lead.id}`} className={styles.inboxBody}>
            <div className={styles.inboxTop}>
              <strong className={styles.inboxName}>{lead.name}</strong>
              {lead.hasTriage && <span className={styles.scoreChip} data-score={lead.score}>{scoreText(lead)}</span>}
              {lead.estimateLabel && <span className={styles.inboxVal}>{lead.estimateLabel}</span>}
              <span className={styles.inboxAge}>{lead.ageLabel}</span>
            </div>
            <span className={styles.inboxSnip}>{lead.detail} · {lead.sourceLabel}{lead.location ? ` · ${lead.location}` : ''}</span>
          </Link>
          <div className={styles.inboxActions}>
            {lead.phone && <a className={styles.iconBtn} href={`tel:${lead.phone}`} title="Call">📞</a>}
            {lead.phone && <a className={styles.iconBtn} href={`sms:${lead.phone}`} title="Text">💬</a>}
            <button type="button" className={styles.iconBtn} title="Snooze 3 days" onClick={() => run(() => snoozeLeadAction(lead.id, 3))}>💤</button>
            <Link className={styles.iconBtn} href={`/dashboard/leads/${lead.id}`} title="Open">→</Link>
          </div>
        </div>
      ))}
      {sorted.length === 0 && <p className="empty-state">No active leads right now.</p>}
    </div>
  );
}

/* ---------------- Command table (sortable) ---------------- */
type SortKey = 'heat' | 'name' | 'value' | 'age' | 'status';
function TableView({ leads }: { leads: LeadViewItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('heat');
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const rows = [...leads];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'heat') cmp = SCORE_RANK[a.score] - SCORE_RANK[b.score];
      else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'value') cmp = (b.estimate?.max ?? -1) - (a.estimate?.max ?? -1);
      else if (sortKey === 'age') cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      return asc ? cmp : -cmp;
    });
    return rows;
  }, [leads, sortKey, asc]);

  function sortBy(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(true); }
  }
  const arrow = (key: SortKey) => (sortKey === key ? (asc ? ' ▲' : ' ▼') : '');

  return (
    <div className={styles.tableWrap}>
      <table className={styles.leadTable}>
        <thead>
          <tr>
            <th><button type="button" onClick={() => sortBy('name')}>Lead{arrow('name')}</button></th>
            <th><button type="button" onClick={() => sortBy('heat')}>Heat{arrow('heat')}</button></th>
            <th>Service</th>
            <th>Source</th>
            <th className={styles.numCol}><button type="button" onClick={() => sortBy('value')}>Est. value{arrow('value')}</button></th>
            <th className={styles.numCol}><button type="button" onClick={() => sortBy('age')}>Age{arrow('age')}</button></th>
            <th><button type="button" onClick={() => sortBy('status')}>Stage{arrow('status')}</button></th>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((lead) => (
            <tr key={lead.id}>
              <td><Link href={`/dashboard/leads/${lead.id}`} className={styles.tName}>{lead.name}</Link></td>
              <td><span className={styles.scoreChip} data-score={lead.score}>{scoreText(lead)}</span></td>
              <td className={styles.tMuted}>{lead.detail}</td>
              <td className={styles.tMuted}>{lead.sourceLabel}</td>
              <td className={styles.numCol}>{lead.estimateLabel ?? '—'}</td>
              <td className={styles.numCol}>{lead.ageLabel}</td>
              <td>{lead.statusLabel}</td>
              <td><Link href={`/dashboard/leads/${lead.id}`} className={styles.tOpen}>Open →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <p className="empty-state">No active leads right now.</p>}
    </div>
  );
}

/* ---------------- Split view (list + detail) ---------------- */
function SplitView({ leads, run }: { leads: LeadViewItem[]; run: (fn: () => Promise<unknown>) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null);
  const selected = leads.find((l) => l.id === selectedId) ?? leads[0] ?? null;

  return (
    <div className={styles.splitWrap}>
      <div className={styles.splitList}>
        {leads.map((lead) => (
          <button
            type="button"
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
        <div className={styles.splitDetail} key={selected.id}>
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
            <button type="button" className="btn secondary" onClick={() => run(() => updateLeadStatusAction(selected.id, 'won'))}>Mark won</button>
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
