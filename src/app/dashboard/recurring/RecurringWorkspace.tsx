'use client';

import { useMemo, useState, type ReactNode } from 'react';

// The Plans / Calendar surface. The cards themselves are built on the server —
// they carry bound Server Actions — and arrive here already rendered; this owns
// only the tab, the filters and the order. That split is deliberate: filtering
// needs the plan's FIELDS, so each row carries its data alongside its rendered
// card rather than this trying to read anything back out of the JSX.
//
// Nothing here imports from @/lib/jobs or @/lib/recurring. Both reach server-only
// code, and pulling either into a client bundle fails the build with the famously
// unhelpful "Module not found: Can't resolve 'fs'". So every date and every
// amount arrives already formatted, and this file does no formatting at all.

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
  activeCount,
}: {
  rows: PlanRow[];
  months: CalendarMonth[];
  composer: ReactNode;
  activeCount: number;
}) {
  const [tab, setTab] = useState<'plans' | 'calendar'>('plans');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'paused' | 'attention'>('all');
  const [frequency, setFrequency] = useState('all');
  const [sort, setSort] = useState<SortKey>('next');

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

  const filtering = query.trim() !== '' || status !== 'all' || frequency !== 'all';

  return (
    <section className="panel workspace-section-card">
      <div className="recurring-tabbar" role="tablist" aria-label="Recurring plans view">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'plans'}
          className={`insight-window-tab${tab === 'plans' ? ' is-active' : ''}`}
          onClick={() => setTab('plans')}
        >
          Plans
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'calendar'}
          className={`insight-window-tab${tab === 'calendar' ? ' is-active' : ''}`}
          onClick={() => setTab('calendar')}
        >
          Calendar
        </button>
        <div className="recurring-tabbar-action">{composer}</div>
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
              a pin on the hero map scrolls to, see RecurringMap.jumpToPlan. The
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
            <div className="recurring-list">
              {shown.map((row) => (
                <div key={row.id} id={`plan-${row.id}`}>{row.card}</div>
              ))}
            </div>
          )}
        </>
      ) : (
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
      )}
    </section>
  );
}
