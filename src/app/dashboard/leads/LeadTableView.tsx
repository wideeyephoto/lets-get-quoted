'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QUEUE_STAGES, matchesQuery, matchesStage, queueStageLabel, type StageFilter } from '@/lib/lead-queue';
import { primaryAction, priorityLabel, priorityTone } from '@/lib/lead-priority';
import {
  DEFAULT_COLUMNS,
  LOCKED_COLUMN,
  TABLE_COLUMNS,
  csvFilename,
  normalizeColumns,
  toCsv,
  type TableColumnId,
} from '@/lib/lead-table';
import type { LeadViewItem } from './LeadsWorkspace';
import { archiveLeadAction, snoozeLeadAction, updateLeadStatusAction } from './actions';
import styles from './table.module.css';
import leadStyles from './leads.module.css';

/**
 * The Table — the one view for working on MANY leads at once.
 *
 * It was the strongest of the three structurally and the weakest in purpose: a
 * denser copy of the same six fields, sortable, with an 18px "Open →" link at
 * the end of each row. What earns a table its place is bulk: search, filters
 * you keep, a selection, actions that apply to the selection, columns you
 * choose, a header that stays put, and a way to take the result away.
 *
 * Preferences live in localStorage rather than a cookie. They are per-device
 * ("this laptop is where I do the admin"), they never need to be known on the
 * server, and a cookie would mean a round trip to change a column.
 */

const STORE_COLUMNS = 'lgq_leads_table_columns';
const STORE_FILTERS = 'lgq_leads_table_filters';
const TABLE_FILTERS_VERSION = 2;

type SortKey = TableColumnId;
type SortDir = 'asc' | 'desc';

// No ownerControls prop, and that is a statement rather than an omission: this
// view has nothing an office user cannot run. Its bulk actions are Mark
// contacted, Snooze and Archive -- each one update on the lead row -- and its
// only links go to the lead detail page, which admits them.
export default function LeadTableView({
  leads,
  run,
  onOpenQuickAdd,
}: {
  leads: LeadViewItem[];
  run: (fn: () => Promise<unknown>) => void;
  onOpenQuickAdd?: () => void;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState<TableColumnId[]>(DEFAULT_COLUMNS);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('open');
  const [heat, setHeat] = useState<'all' | 'hot' | 'warm' | 'low'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('waiting');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [chooserOpen, setChooserOpen] = useState(false);
  const chooserId = useId();
  const [ready, setReady] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);

  // Read after mount, never during render: localStorage read while rendering
  // gives the server and the browser different markup and React throws the
  // server's away.
  useEffect(() => {
    try {
      const savedColumns = window.localStorage.getItem(STORE_COLUMNS);
      if (savedColumns) setColumns(normalizeColumns(JSON.parse(savedColumns)));
      const savedFilters = window.localStorage.getItem(STORE_FILTERS);
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters) as { version?: number; stage?: StageFilter; heat?: typeof heat; sortKey?: SortKey; sortDir?: SortDir };
        // Version 1 defaulted to All. Migrate it once so existing accounts get
        // the same open-first queue as a new account; subsequent choices save
        // with this version and remain the user's choice.
        if (parsed.version === TABLE_FILTERS_VERSION && parsed.stage) setStage(parsed.stage);
        else setStage('open');
        if (parsed.heat) setHeat(parsed.heat);
        if (parsed.sortKey) setSortKey(parsed.sortKey);
        if (parsed.sortDir) setSortDir(parsed.sortDir);
      }
    } catch {
      // Private mode or a corrupted value — the defaults are fine.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORE_COLUMNS, JSON.stringify(columns));
      window.localStorage.setItem(STORE_FILTERS, JSON.stringify({ version: TABLE_FILTERS_VERSION, stage, heat, sortKey, sortDir }));
    } catch {
      // Not worth surfacing — the table still works, it just forgets.
    }
  }, [ready, columns, stage, heat, sortKey, sortDir]);

  useEffect(() => {
    if (!chooserOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!chooserRef.current?.contains(event.target as Node)) setChooserOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setChooserOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [chooserOpen]);

  const shown = useMemo(() => {
    const filtered = leads.filter((lead) => {
      if (!matchesStage(lead, stage)) return false;
      if (heat !== 'all' && (!lead.hasTriage || lead.score !== heat)) return false;
      return matchesQuery(lead, query);
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    const rank: Record<string, number> = { hot: 0, warm: 1, low: 2 };
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'lead') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'stage') cmp = a.status.localeCompare(b.status);
      // "Waiting" ascending means the SHORTEST wait first, so the comparison is
      // on the timestamp the other way round.
      else if (sortKey === 'waiting') {
        // Won/lost rows have no waiting clock. They stay last in BOTH
        // directions instead of sorting as very old open work.
        const aWaits = Boolean(a.waitingShort);
        const bWaits = Boolean(b.waitingShort);
        if (aWaits !== bWaits) return aWaits ? -1 : 1;
        cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      else if (sortKey === 'received') cmp = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      else if (sortKey === 'value') cmp = (a.estimate?.max ?? -1) - (b.estimate?.max ?? -1);
      else if (sortKey === 'heat') cmp = rank[b.score] - rank[a.score];
      if (cmp === 0) cmp = a.id.localeCompare(b.id);
      return cmp * dir;
    });
  }, [leads, query, stage, heat, sortKey, sortDir]);

  const shownIds = useMemo(() => shown.map((lead) => lead.id), [shown]);
  // A selection can only ever contain rows you can see. Filter something out
  // while it is ticked and a bulk action would hit a lead that is not on screen.
  const liveSelection = useMemo(() => shownIds.filter((id) => selected.has(id)), [shownIds, selected]);
  const allShownSelected = shownIds.length > 0 && liveSelection.length === shownIds.length;

  const visibleColumns = TABLE_COLUMNS.filter((column) => columns.includes(column.id));

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulk(fn: (id: string) => Promise<unknown>, verb: string) {
    const ids = [...liveSelection];
    if (ids.length === 0) return;
    if (!window.confirm(`${verb} ${ids.length} lead${ids.length === 1 ? '' : 's'}?`)) return;
    run(async () => {
      // Sequential on purpose: each of these writes the same leads table, and
      // firing thirty at once is how you find a rate limit with somebody's
      // pipeline.
      for (const id of ids) await fn(id);
      setSelected(new Set());
    });
  }

  function exportCsv() {
    const headers = visibleColumns.map((column) => column.label);
    const rows = shown.map((lead) => visibleColumns.map((column) => cellText(lead, column.id)));
    const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFilename(new Date().toISOString().slice(0, 10));
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportSelectedCsv() {
    const selectedRows = shown.filter((lead) => selected.has(lead.id));
    if (selectedRows.length === 0) return;
    const headers = visibleColumns.map((column) => column.label);
    const rows = selectedRows.map((lead) => visibleColumns.map((column) => cellText(lead, column.id)));
    const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvFilename(`selected-${new Date().toISOString().slice(0, 10)}`);
    link.click();
    URL.revokeObjectURL(url);
  }

  // The whole row opens the lead. An 18px "Open →" was the only way in.
  function openLead(id: string, event: React.MouseEvent | React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, select, label')) return;
    router.push(`/dashboard/leads/${id}`);
  }

  if (leads.length === 0) return <p className="empty-state">No active leads right now.</p>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <label className={styles.srOnly} htmlFor="lead-table-search">Search leads by customer, project or location</label>
        <input
          id="lead-table-search"
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search leads"
        />

        <label className={styles.filter}>
          <span className={styles.filterLabel}>Stage</span>
          <select value={stage} onChange={(event) => setStage(event.target.value as StageFilter)}>
            <option value="open">Open leads</option>
            <option value="closed">Closed leads</option>
            <option value="all">All leads</option>
            {QUEUE_STAGES.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.filter}>
          <span className={styles.filterLabel}>Heat</span>
          <select value={heat} onChange={(event) => setHeat(event.target.value as typeof heat)}>
            <option value="all">Any heat</option>
            <option value="hot">Hot</option>
            <option value="warm">Warm</option>
            <option value="low">Low</option>
          </select>
        </label>

        <div className={styles.chooser} ref={chooserRef}>
          <button
            type="button"
            className={styles.toolBtn}
            aria-haspopup="true"
            aria-expanded={chooserOpen}
            aria-controls={chooserOpen ? chooserId : undefined}
            onClick={() => setChooserOpen((was) => !was)}
          >
            Columns <span className={styles.toolCount}>{visibleColumns.length}</span>
          </button>
          {chooserOpen ? (
            <div id={chooserId} className={styles.chooserPop} role="group" aria-label="Choose columns">
              {TABLE_COLUMNS.map((column) => {
                const locked = column.id === LOCKED_COLUMN;
                return (
                  <label key={column.id} className={styles.chooserItem}>
                    <input
                      type="checkbox"
                      checked={columns.includes(column.id)}
                      disabled={locked}
                      onChange={() =>
                        setColumns((current) =>
                          current.includes(column.id)
                            ? normalizeColumns(current.filter((id) => id !== column.id))
                            : normalizeColumns([...current, column.id]),
                        )
                      }
                    />
                    {column.label}
                    {locked ? <small>always shown</small> : null}
                  </label>
                );
              })}
              <button type="button" className={styles.chooserReset} onClick={() => setColumns(DEFAULT_COLUMNS)}>
                Reset to the default columns
              </button>
            </div>
          ) : null}
        </div>

        <button type="button" className={styles.toolBtn} onClick={exportCsv}>
          Export CSV
        </button>

        {onOpenQuickAdd && (
          <button type="button" className={styles.toolBtn} onClick={onOpenQuickAdd}>
            + Add lead
          </button>
        )}

        <span className={styles.count} role="status">
          {shown.length === leads.length ? `${leads.length} leads` : `${shown.length} of ${leads.length} leads`}
        </span>
      </div>

      {liveSelection.length > 0 ? (
        <div className={styles.bulkBar}>
          <strong>{liveSelection.length} selected</strong>
          <button type="button" className={styles.bulkBtn} onClick={() => bulk((id) => updateLeadStatusAction(id, 'contacted'), 'Mark contacted')}>
            Mark contacted
          </button>
          <button type="button" className={styles.bulkBtn} onClick={() => bulk((id) => updateLeadStatusAction(id, 'won'), 'Mark won')}>
            Mark won
          </button>
          <button type="button" className={styles.bulkBtn} onClick={() => bulk((id) => snoozeLeadAction(id, 3), 'Snooze for 3 days')}>
            Snooze 3 days
          </button>
          <button type="button" className={styles.bulkBtn} onClick={() => bulk((id) => archiveLeadAction(id, true), 'Archive')}>
            Archive
          </button>
          <button type="button" className={styles.bulkBtn} onClick={exportSelectedCsv}>
            Export selected ({liveSelection.length})
          </button>
          <button type="button" className={styles.bulkClear} onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      ) : null}

      {/* --- desktop: a real table --- */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Leads, sorted by {TABLE_COLUMNS.find((c) => c.id === sortKey)?.label ?? sortKey}, {sortDir === 'asc' ? 'ascending' : 'descending'}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={styles.checkCol}>
                <label className={styles.checkWrap}>
                  <span className={styles.srOnly}>Select every lead shown</span>
                  <input
                    type="checkbox"
                    checked={allShownSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = liveSelection.length > 0 && !allShownSelected;
                    }}
                    onChange={() => setSelected(allShownSelected ? new Set() : new Set(shownIds))}
                  />
                </label>
              </th>
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={column.numeric ? styles.numCol : undefined}
                  // The real thing, not an arrow glyph: a screen reader announces
                  // "sorted descending" from this and from nothing else.
                  aria-sort={sortKey === column.id ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortable ? (
                    <button type="button" className={styles.sortBtn} onClick={() => sortBy(column.id)}>
                      {column.label}
                      <span aria-hidden="true" className={styles.arrow}>
                        {sortKey === column.id ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((lead) => (
              <tr
                key={lead.id}
                id={`lead-row-${lead.id}`}
                className={`${styles.row}${selected.has(lead.id) ? ` ${styles.rowOn}` : ''}`}
                tabIndex={0}
                onClick={(event) => openLead(lead.id, event)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  openLead(lead.id, event);
                }}
              >
                <td className={styles.checkCol}>
                  <label className={styles.checkWrap}>
                    <span className={styles.srOnly}>Select {lead.name}</span>
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleRow(lead.id)} />
                  </label>
                </td>
                {visibleColumns.map((column) => (
                  <td key={column.id} className={cellClass(column.id)}>
                    {cellNode(lead, column.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? (
          <p className={styles.noMatch}>
            {query.trim() && stage !== 'open' ? (
              <>
                No leads found in <strong>{queueStageLabel(stage)}</strong> matching &ldquo;{query}&rdquo;.
                {' '}
                <button type="button" className={styles.bulkClear} onClick={() => setStage('open')}>
                  Search all open leads
                </button>
                {' · '}
                <button type="button" className={styles.bulkClear} onClick={() => { setQuery(''); setStage('open'); setHeat('all'); }}>
                  Reset filters
                </button>
              </>
            ) : query.trim() ? (
              <>
                No leads matching &ldquo;{query}&rdquo;.
                {' '}
                <button type="button" className={styles.bulkClear} onClick={() => setQuery('')}>
                  Clear search
                </button>
              </>
            ) : (
              <>
                No leads match the current filters.
                {' '}
                <button type="button" className={styles.bulkClear} onClick={() => { setQuery(''); setStage('open'); setHeat('all'); }}>
                  Reset filters
                </button>
              </>
            )}
          </p>
        ) : null}
      </div>

      {/* --- phones: the same rows as compact cards, same filters and sort --- */}
      <ul className={styles.cards}>
        {shown.map((lead) => {
          const action = primaryAction(lead);
          return (
            <li key={lead.id} className={`${styles.card}${selected.has(lead.id) ? ` ${styles.cardOn}` : ''}`}>
              <label className={styles.cardCheck}>
                <span className={styles.srOnly}>Select {lead.name}</span>
                <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleRow(lead.id)} />
              </label>
              <div className={styles.cardBody}>
                <Link href={`/dashboard/leads/${lead.id}`} className={styles.cardName}>
                  {lead.name}
                  {lead.city ? <span className={styles.cardCity}> ({lead.city})</span> : null}
                </Link>
                <p className={styles.cardProject}>{lead.detail}</p>
                <p className={styles.cardMeta}>
                  <span className={styles.cardStage} data-stage={lead.status}>{queueStageLabel(lead.status)}</span>
                  {lead.waitingShort ? <span>{lead.waitingShort}</span> : null}
                  {lead.estimateLabel ? <span className={styles.cardValue}>{lead.estimateLabel}</span> : null}
                </p>
              </div>
              <a className={styles.cardAction} href={action.href}>
                {action.label}
              </a>
            </li>
          );
        })}
        {shown.length === 0 ? (
          <li className={styles.noMatch}>
            {query.trim() && stage !== 'open' ? (
              <>
                No leads found in <strong>{queueStageLabel(stage)}</strong> matching &ldquo;{query}&rdquo;.
                {' '}
                <button type="button" className={styles.bulkClear} onClick={() => setStage('open')}>
                  Search all open leads
                </button>
                {' · '}
                <button type="button" className={styles.bulkClear} onClick={() => { setQuery(''); setStage('open'); setHeat('all'); }}>
                  Reset filters
                </button>
              </>
            ) : query.trim() ? (
              <>
                No leads matching &ldquo;{query}&rdquo;.
                {' '}
                <button type="button" className={styles.bulkClear} onClick={() => setQuery('')}>
                  Clear search
                </button>
              </>
            ) : (
              <>
                No leads match the current filters.
                {' '}
                <button type="button" className={styles.bulkClear} onClick={() => { setQuery(''); setStage('open'); setHeat('all'); }}>
                  Reset filters
                </button>
              </>
            )}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function cellClass(id: TableColumnId): string | undefined {
  if (id === 'value' || id === 'waiting') return styles.numCol;
  if (id === 'lead') return styles.leadCell;
  if (id === 'project') return styles.projectCell;
  return undefined;
}

/** The rendered cell. */
function cellNode(lead: LeadViewItem, id: TableColumnId) {
  if (id === 'lead') {
    return (
      <Link href={`/dashboard/leads/${lead.id}`} className={styles.tName}>
        {lead.name}
        {lead.city ? <span className={styles.tCity}> ({lead.city})</span> : null}
      </Link>
    );
  }
  if (id === 'stage') {
    return <span className={styles.tStage} data-stage={lead.status}>{queueStageLabel(lead.status)}</span>;
  }
  if (id === 'heat') {
    return (
      <span className={styles.tHeat}>
        <span className={leadStyles.heatDot} data-score={priorityTone(lead)} aria-hidden="true" /> {priorityLabel(lead)}
      </span>
    );
  }
  if (id === 'next') {
    const action = primaryAction(lead);
    return <a className={styles.tNext} href={action.href}>{action.label}</a>;
  }
  return cellText(lead, id);
}

/** The same cell as plain text — what the CSV exports, so the two agree. */
function cellText(lead: LeadViewItem, id: TableColumnId): string {
  switch (id) {
    case 'lead':
      return lead.city ? `${lead.name} (${lead.city})` : lead.name;
    case 'project':
      return lead.detail;
    case 'stage':
      return queueStageLabel(lead.status);
    // "27d waiting", not "647h" — the figure a human can act on. Empty for a
    // won or lost lead: an exported cell reading "null", or a duration for
    // somebody nobody is waiting on, are both worse than a blank.
    case 'waiting':
      return lead.waitingShort ?? '';
    case 'value':
      return lead.estimateLabel ?? '';
    case 'source':
      return lead.sourceLabel;
    case 'next':
      return primaryAction(lead).label;
    case 'heat':
      return priorityLabel(lead);
    case 'location':
      return lead.address || lead.location || '';
    case 'received':
      return new Date(lead.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    default:
      return '';
  }
}
