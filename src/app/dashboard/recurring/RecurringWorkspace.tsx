'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import RecurringMap, { jumpToPlan, type PlanPin } from './RecurringMap';

// The Plans / Calendar / Map surface. The cards themselves are built on the
// server — they carry bound Server Actions — and arrive here already rendered;
// this owns only the tab, the filters and the order. That split is deliberate:
// filtering needs the plan's FIELDS, so each row carries its data alongside its
// rendered card rather than this trying to read anything back out of the JSX.
//
// Nothing here imports from @/lib/jobs or @/lib/recurring. Both reach server-only
// code, and pulling either into a client bundle fails the build with the famously
// unhelpful "Module not found: Can't resolve 'fs'". So every date and every
// amount arrives already formatted, and this file does no formatting at all.
// The board's types come from @/lib/recurring-board as `import type`, which the
// compiler erases — the module itself reaches @/lib/recurring and must never be
// pulled in for real.

import type { BoardIssue, BoardVisit } from '@/lib/recurring-board';

export type PlanRow = {
  id: string;
  title: string;
  clientName: string;
  /** 'weekly' | 'biweekly' | 'monthly' — a plain string so the type stays local. */
  frequency: string;
  active: boolean;
  nextRunDate: string;
  monthly: number;
  needsAttention: boolean;
  card: ReactNode;
};

export type CalendarMonth = {
  monthKey: string;
  label: string;
  countLabel: string;
  visits: { key: string; dateLabel: string; planTitle: string; clientName: string; amountLabel: string | null }[];
};

/**
 * What the Operations view puts between the tiles and the list.
 *
 * The mockup had three panels here — Needs attention, Upcoming visits and an
 * autopay donut — sitting under four tiles that already carried those same three
 * numbers. Two of the three said nothing the tile above them had not said, so
 * this is one panel with the two halves that do: WHICH plans need you, and WHICH
 * visits are coming. Seven panels became five, and the list starts higher.
 */
export type BoardModel = {
  issues: BoardIssue[];
  visits: (Omit<BoardVisit, 'amount'> & { amountLabel: string | null })[];
  /** "next 7 days" — named, so the count is never a number with no window. */
  windowLabel: string;
  /** "Next 30 days: 12 visits · $1,240 expected · Next 90 days: …" */
  workload: ReactNode;
};

type SortKey = 'next' | 'value' | 'customer' | 'name';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'next', label: 'Sort by next visit' },
  { key: 'value', label: 'Sort by value' },
  { key: 'customer', label: 'Sort by customer' },
  { key: 'name', label: 'Sort by plan name' },
];

const FREQUENCIES: { key: string; label: string }[] = [
  { key: 'all', label: 'Any frequency' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Monthly' },
];

export default function RecurringWorkspace({
  rows,
  months,
  composer,
  gear,
  activeCount,
  view = 'cards',
  board = null,
  pins = [],
  totalPlans = 0,
}: {
  rows: PlanRow[];
  months: CalendarMonth[];
  composer: ReactNode;
  gear: ReactNode;
  activeCount: number;
  view?: 'cards' | 'ops';
  /** Operations only — Cards keeps the attention banner and the hero map. */
  board?: BoardModel | null;
  /** Operations only: the map is a tab here rather than sitting in the hero. */
  pins?: PlanPin[];
  totalPlans?: number;
}) {
  const ops = view === 'ops';
  const [tab, setTab] = useState<'plans' | 'calendar' | 'map'>('plans');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'paused' | 'attention'>('all');
  const [frequency, setFrequency] = useState('all');
  const [sort, setSort] = useState<SortKey>('next');
  // Set by a map pin or a board row; consumed one commit later, once the list it
  // scrolls to is actually in the DOM.
  const [pendingJump, setPendingJump] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (needle && !`${row.title} ${row.clientName}`.toLowerCase().includes(needle)) return false;
      if (status === 'active' && !row.active) return false;
      if (status === 'paused' && row.active) return false;
      if (status === 'attention' && !row.needsAttention) return false;
      if (frequency !== 'all' && row.frequency !== frequency) return false;
      return true;
    });
    // Paused plans sink in every order — they are not work you are doing.
    return filtered.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (sort === 'value') return b.monthly - a.monthly;
      if (sort === 'customer') return a.clientName.localeCompare(b.clientName);
      if (sort === 'name') return a.title.localeCompare(b.title);
      return a.nextRunDate.localeCompare(b.nextRunDate);
    });
  }, [rows, query, status, frequency, sort]);

  useEffect(() => {
    if (!pendingJump) return;
    jumpToPlan(pendingJump);
    setPendingJump(null);
  }, [pendingJump]);

  /**
   * Take me to that plan — from a map pin or a board row.
   *
   * Clears the filters only when the target is filtered OUT. Clearing them every
   * time would silently undo a search somebody is in the middle of; not clearing
   * them at all makes a pin click do nothing at all, which reads as broken. The
   * check is synchronous against the list this render already computed, so both
   * state updates land in one batch and the effect above fires once.
   */
  function goToPlan(planId: string) {
    setTab('plans');
    if (!shown.some((row) => row.id === planId)) {
      setQuery('');
      setStatus('all');
      setFrequency('all');
    }
    setPendingJump(planId);
  }

  const filtering = query.trim() !== '' || status !== 'all' || frequency !== 'all';

  const tabs: { id: typeof tab; label: string }[] = ops
    ? [
        { id: 'plans', label: 'Plans' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'map', label: 'Map' },
      ]
    : [
        { id: 'plans', label: 'Plans' },
        { id: 'calendar', label: 'Calendar' },
      ];

  return (
    <>
      {ops && board ? <OpsBoard board={board} onOpenPlan={goToPlan} onShowAttention={() => { setTab('plans'); setStatus('attention'); }} onOpenCalendar={() => setTab('calendar')} /> : null}

      <section className="panel workspace-section-card">
        <div className="recurring-tabbar" role="tablist" aria-label="Recurring plans view">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={`insight-window-tab${tab === entry.id ? ' is-active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
          <div className="recurring-tabbar-action">
            {gear}
            {composer}
          </div>
        </div>

        {tab === 'plans' ? (
          <>
            <div className="clients-toolbar recurring-toolbar">
              <label className="client-search-bar recurring-search">
                <span className="sr-only">Search customer or service</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search customer or service"
                />
              </label>
              <label className="recurring-filter">
                <span className="sr-only">Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
                  <option value="all">Any status</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="attention">Needs attention</option>
                </select>
              </label>
              <label className="recurring-filter">
                <span className="sr-only">Frequency</span>
                <select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
                  {FREQUENCIES.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="recurring-filter">
                <span className="sr-only">Sort</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                  {SORTS.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="section-heading workspace-section-heading compact-heading recurring-list-head">
              <p className="eyebrow">
                Recurring plans
                {filtering
                  ? ` · ${shown.length} of ${rows.length}`
                  : activeCount > 0
                    ? ` · ${activeCount} active`
                    : ''}
              </p>
            </div>

            {/* Each card is wrapped in a node carrying `plan-<id>` — that is what
                a pin on the map scrolls to, see RecurringMap.jumpToPlan. The
                comment lives out here because a block comment written as the first
                thing inside a ternary branch is JSX *text*, not a comment, and
                tsc will not tell you. */}
            {rows.length === 0 ? (
              <p className="empty-state">
                No recurring plans yet. Create one and its visits will schedule themselves.
              </p>
            ) : shown.length === 0 ? (
              <p className="empty-state">
                No plans match that. Clear the filters to see all {rows.length}.
              </p>
            ) : (
              <div className={ops ? 'rops-list' : 'recurring-list'}>
                {shown.map((row) => (
                  <div key={row.id} id={`plan-${row.id}`}>{row.card}</div>
                ))}
              </div>
            )}
          </>
        ) : tab === 'calendar' ? (
          <div className="recurring-calendar">
            {months.length === 0 ? (
              <p className="empty-state">
                No visits projected. Active plans draw their upcoming visits here before the jobs exist.
              </p>
            ) : (
              months.map((month) => (
                <section key={month.monthKey} className="recurring-cal-month">
                  <div className="recurring-cal-monthhead">
                    <h3>{month.label}</h3>
                    <span>{month.countLabel}</span>
                  </div>
                  <ul className="recurring-cal-list">
                    {month.visits.map((visit) => (
                      <li key={visit.key} className="recurring-cal-row">
                        <span className="recurring-cal-date">{visit.dateLabel}</span>
                        <span className="recurring-cal-what">
                          <strong>{visit.planTitle}</strong>
                          <small>{visit.clientName}</small>
                        </span>
                        {visit.amountLabel ? (
                          <span className="recurring-cal-money">{visit.amountLabel}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        ) : (
          <div className="rops-maptab">
            <RecurringMap pins={pins} totalPlans={totalPlans} onJump={goToPlan} />
          </div>
        )}
      </section>
    </>
  );
}

/**
 * The one panel between the tiles and the list.
 *
 * Two halves, both of them lists of things rather than restatements of a number.
 * Autopay coverage is deliberately absent: the tile above already reads "14 of
 * 18 plans", and drawing that same fraction as a donut underneath it is the same
 * sentence twice.
 */
function OpsBoard({
  board,
  onOpenPlan,
  onShowAttention,
  onOpenCalendar,
}: {
  board: BoardModel;
  onOpenPlan: (planId: string) => void;
  onShowAttention: () => void;
  onOpenCalendar: () => void;
}) {
  // Three each, and the count on the heading says how many there really are.
  // The point of this view is that the LIST starts high; a board that grows a
  // row per problem pushes the thing you came for further down exactly when you
  // have the most to do.
  const issues = board.issues.slice(0, 3);
  const visits = board.visits.slice(0, 3);

  return (
    <section className="panel rops-board">
      <div className="rops-board-half">
        <div className="rops-board-head">
          <h2>Needs your review</h2>
          {board.issues.length > 0 ? <span className="rops-board-count">{board.issues.length}</span> : null}
        </div>

        {issues.length === 0 ? (
          <p className="rops-board-clear">
            Nothing needs a decision. Every active plan has a way to bill, a price on it, somebody
            on its next visit, and a visit that hasn&rsquo;t slipped.
          </p>
        ) : (
          <ul className="rops-issues">
            {issues.map((issue) => (
              <li key={issue.planId}>
                <button type="button" className="rops-issue" onClick={() => onOpenPlan(issue.planId)}>
                  <span className={`rops-issue-dot is-${issue.level}`} aria-hidden="true" />
                  <span className="rops-issue-copy">
                    <strong>{issue.headline}</strong>
                    <small>{issue.clientName}</small>
                  </span>
                  <span className="rops-issue-when">{issue.when}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {board.issues.length > issues.length ? (
          <button type="button" className="linklike rops-board-more" onClick={onShowAttention}>
            Show all {board.issues.length} in the list →
          </button>
        ) : null}
      </div>

      <div className="rops-board-half">
        <div className="rops-board-head">
          <h2>Coming up</h2>
          <span className="rops-board-window">{board.windowLabel}</span>
        </div>

        {visits.length === 0 ? (
          <p className="rops-board-clear">
            No visits due in the {board.windowLabel}. The calendar tab has everything further out.
          </p>
        ) : (
          <ul className="rops-visits">
            {visits.map((visit) => (
              <li key={visit.key}>
                <button type="button" className="rops-visit" onClick={() => onOpenPlan(visit.planId)}>
                  <span className="rops-visit-date" aria-hidden="true">
                    <em>{visit.monthLabel}</em>
                    <strong>{visit.dayLabel}</strong>
                  </span>
                  <span className="rops-visit-copy">
                    <strong>{visit.planTitle}</strong>
                    <small>
                      {visit.weekdayLabel} · {visit.clientName}
                    </small>
                  </span>
                  {visit.amountLabel ? <span className="rops-visit-money">{visit.amountLabel}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className="linklike rops-board-more" onClick={onOpenCalendar}>
          {board.visits.length > visits.length
            ? `All ${board.visits.length} on the calendar →`
            : 'Open the calendar →'}
        </button>
      </div>

      {/* Workload sits along the bottom of both halves rather than in a tile of
          its own: it is the sentence that ties the two together — this is what
          needs fixing, this is what is coming, and this is what it all adds up
          to. */}
      <p className="rops-board-workload">{board.workload}</p>
    </section>
  );
}
