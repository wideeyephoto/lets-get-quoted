'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import ViewGear, { type ViewOption } from '@/components/view-gear';
import AddressAutocomplete from '@/components/address-autocomplete';
import SaveButton from '@/components/save-button';
import { setClientsViewAction } from '@/app/dashboard/view-actions';
import { followUpHeadline, groupByFollowUp } from '@/lib/client-followup';
import type { ClientsView } from '@/lib/dashboard-views';
import { avatarTone } from '@/lib/avatar-tone';
import ClientFocusView from './ClientFocusView';
import { createClientAction } from './actions';

// The customer list, five ways.
//
// One dataset, five shapes, because "who are my customers" is several different
// questions: skim the whole book (List), recognise a face (Cards), compare and
// sort (Table), or work one person while keeping the list to hand (Focus).
//
// Follow-up is the odd one out and earns its place by not answering that
// question at all. The other four order by name or by money, which makes a
// customer drifting away look exactly like a happy one. It orders by silence.
//
// Selecting somebody does something in every view — that's the point of the
// selection state. In Focus it opens them beside the list; everywhere else it
// lifts the row and reveals the actions, so a click is never a dead end.

export type ClientRow = {
  id: string;
  name: string;
  initials: string;
  isRepeat: boolean;
  phone: string | null;
  phoneLabel: string | null;
  email: string | null;
  address: string | null;
  contactLine: string;
  jobCount: number;
  jobsLabel: string;
  totalValue: number;
  totalLabel: string;
  lastJobAt: string | null;
  lastLabel: string;
  search: string;
  // Follow-up reads the SCHEDULED dates, not lastJobAt — that one is when the
  // job record was created, so an imported book gives everybody the same value.
  nextJobAt: string | null;
  lastVisitAt: string | null;
  unscheduledJobs: number;
};

const VIEWS: ViewOption<ClientsView>[] = [
  { id: 'list', label: 'List', hint: 'The classic stacked list' },
  { id: 'cards', label: 'Cards', hint: 'Bigger, with initials and totals' },
  { id: 'table', label: 'Table', hint: 'Sort & compare' },
  { id: 'focus', label: 'Focus', hint: 'One customer open, list beside it' },
  { id: 'followup', label: 'Follow up', hint: 'Who has gone quiet' },
];

type SortKey = 'name' | 'jobs' | 'total' | 'last';

export default function ClientsWorkspace({
  clients,
  initialView,
  openAdd = false,
}: {
  clients: ClientRow[];
  initialView: ClientsView;
  /**
   * Arrived from the nav's "+ New → New client", so open the dialog rather than
   * landing on the list and making them find the button.
   *
   * INITIAL state only. Adding a client runs a server action, which revalidates
   * this page — synced to the prop, the dialog would spring back open the
   * instant it was used.
   */
  openAdd?: boolean;
}) {
  const [view, setView] = useState<ClientsView>(initialView);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [adding, setAdding] = useState(openAdd);
  const [, startSaveView] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  function pickView(next: ClientsView) {
    setView(next);
    startSaveView(() => {
      void setClientsViewAction(next).catch(() => {});
    });
  }

  // Filtering swaps the rows without touching the scroll offset, so searching
  // from halfway down would open partway into the results.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [query, view]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const terms = needle ? needle.split(/\s+/) : [];
    const filtered = clients.filter((client) => {
      if (repeatOnly && !client.isRepeat) return false;
      // Every term has to match, in any order, so "smith 555" finds a Smith
      // with a 555 number.
      return terms.every((term) => client.search.includes(term));
    });

    const direction = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'jobs':
          return (a.jobCount - b.jobCount) * direction || a.name.localeCompare(b.name);
        case 'total':
          return (a.totalValue - b.totalValue) * direction || a.name.localeCompare(b.name);
        case 'last':
          return ((a.lastJobAt ?? '').localeCompare(b.lastJobAt ?? '')) * direction || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name) * direction;
      }
    });
  }, [clients, query, repeatOnly, sort]);

  // Focus needs somebody open or it's an empty pane. The first match is the
  // sensible somebody, and it follows the search rather than stranding a
  // selection that's been filtered away.
  const selected = useMemo(() => {
    const found = matches.find((client) => client.id === selectedId);
    return found ?? (view === 'focus' ? matches[0] ?? null : null);
  }, [matches, selectedId, view]);

  function sortBy(key: SortKey) {
    setSort((current) => ({ key, dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc' }));
  }

  const gear = (
    <div className="clients-toolbar">
      <div className="client-search-bar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search by name, phone, email, or address"
          aria-label="Search clients"
          autoComplete="off"
        />
        {query.trim() ? (
          <span className="client-search-count">
            {matches.length} match{matches.length === 1 ? '' : 'es'}
          </span>
        ) : null}
      </div>
      <label className="clients-repeat-toggle">
        <input type="checkbox" checked={repeatOnly} onChange={(event) => setRepeatOnly(event.currentTarget.checked)} />
        <span>Repeat only</span>
      </label>
      <button type="button" className="btn primary" onClick={() => setAdding(true)}>
        + Add new client
      </button>
      <ViewGear views={VIEWS} activeView={view} onPickView={pickView} label="View" />
    </div>
  );

  const empty =
    matches.length === 0 ? (
      <p className="empty-state">
        {query.trim() || repeatOnly
          ? `No clients match${query.trim() ? ` “${query.trim()}”` : ''}${repeatOnly ? ' with more than one job' : ''}.`
          : 'No clients yet.'}
      </p>
    ) : null;

  return (
    <>
      {gear}

      {empty}

      {matches.length > 0 && view === 'list' ? (
        <div className="client-list" ref={listRef}>
          {matches.map((client) => (
            <ClientRowLink key={client.id} client={client} selected={selectedId === client.id} onSelect={setSelectedId} />
          ))}
        </div>
      ) : null}

      {matches.length > 0 && view === 'cards' ? (
        <div className="client-card-grid" ref={listRef}>
          {matches.map((client) => (
            <Link
              key={client.id}
              href={`/dashboard/clients/${client.id}`}
              className={`client-card${selectedId === client.id ? ' is-selected' : ''}`}
              onMouseEnter={() => setSelectedId(client.id)}
              onFocus={() => setSelectedId(client.id)}
            >
              <span className="client-card-top">
                <span className="client-avatar" data-avatar-tone={avatarTone(client.name)} aria-hidden="true">{client.initials}</span>
                {client.isRepeat ? <span className="client-repeat-badge">Repeat</span> : null}
              </span>
              <strong className="client-card-name">{client.name}</strong>
              <span className="client-card-contact">{client.contactLine}</span>
              <span className="client-card-stats">
                <span><b>{client.jobsLabel}</b></span>
                <span className="client-card-total">{client.totalLabel}</span>
              </span>
              <span className="client-card-last">Last: {client.lastLabel}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {matches.length > 0 && view === 'table' ? (
        <div className="client-table-wrap" ref={listRef}>
          <table className="client-table">
            <thead>
              <tr>
                <SortTh label="Customer" k="name" sort={sort} onSort={sortBy} />
                <th>Contact</th>
                <SortTh label="Jobs" k="jobs" sort={sort} onSort={sortBy} numeric />
                <SortTh label="Total" k="total" sort={sort} onSort={sortBy} numeric />
                <SortTh label="Last job" k="last" sort={sort} onSort={sortBy} />
              </tr>
            </thead>
            <tbody>
              {matches.map((client) => (
                <tr
                  key={client.id}
                  className={selectedId === client.id ? 'is-selected' : undefined}
                  onMouseEnter={() => setSelectedId(client.id)}
                >
                  <td>
                    <Link href={`/dashboard/clients/${client.id}`} className="client-table-name">
                      <span className="client-avatar small" data-avatar-tone={avatarTone(client.name)} aria-hidden="true">{client.initials}</span>
                      <span>
                        {client.name}
                        {client.isRepeat ? <span className="client-repeat-badge">Repeat</span> : null}
                      </span>
                    </Link>
                  </td>
                  <td className="client-table-contact">{client.contactLine}</td>
                  <td className="num">{client.jobCount}</td>
                  <td className="num"><strong>{client.totalLabel}</strong></td>
                  <td>{client.lastLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* The same master-detail leads and jobs use, off the same stylesheet.
          What was here before was a second, shallower thing that happened to
          share the word "Focus": a name, three numbers and two buttons, with no
          cover, no tabs, no deep detail, and rows built from <button> — so
          cmd-clicking a customer opened nothing and the URL was uncopyable. */}
      {matches.length > 0 && view === 'focus' ? (
        <ClientFocusView clients={matches} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      ) : null}

      {matches.length > 0 && view === 'followup' ? <FollowUpBoard clients={matches} /> : null}

      {adding ? <AddClientDialog onClose={() => setAdding(false)} /> : null}
    </>
  );
}

/**
 * Customers banded by how long they have been quiet.
 *
 * Today is resolved in the browser rather than passed from the server: this is
 * a display grouping, and the person reading it is standing in their own
 * timezone. Nothing here is written or paid against, so a boundary that follows
 * the reader is the right one.
 */
function FollowUpBoard({ clients }: { clients: ClientRow[] }) {
  const groups = useMemo(() => {
    const todayKey = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD', local
    return groupByFollowUp(
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        phone: client.phone,
        email: client.email,
        jobCount: client.jobCount,
        totalValue: client.totalValue,
        nextJobAt: client.nextJobAt,
        lastVisitAt: client.lastVisitAt,
        unscheduledJobs: client.unscheduledJobs,
      })),
      todayKey,
    );
  }, [clients]);

  const byId = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const headline = followUpHeadline(groups);

  return (
    <div className="client-followup">
      {headline ? <p className="client-followup-headline">{headline}</p> : null}

      <div className="client-followup-board">
        {groups.map((group) => (
          <section key={group.band} className="client-band" data-band={group.band}>
            <header className="client-band-head">
              <h3>{group.label}</h3>
              <span>{group.clients.length}</span>
            </header>
            <p className="client-band-note">{group.note}</p>

            {group.clients.length === 0 ? (
              <p className="client-band-empty">
                {group.band === 'drifting' ? 'Nobody has gone quiet. Good.' : 'Nobody here.'}
              </p>
            ) : (
              <div className="client-band-stack">
                {group.clients.map((client) => {
                  const row = byId.get(client.id);
                  return (
                    <Link key={client.id} href={`/dashboard/clients/${client.id}`} className="client-band-card">
                      <span className="client-avatar small" data-avatar-tone={avatarTone(row?.name)} aria-hidden="true">{row?.initials ?? '?'}</span>
                      <span className="client-band-who">
                        <strong>{client.name}</strong>
                        <small>{client.when}</small>
                        {client.flags.map((flag) => (
                          <em key={flag.text} className="client-band-flag" data-tone={flag.tone}>{flag.text}</em>
                        ))}
                      </span>
                      <span className={`client-band-total${client.totalValue > 0 ? '' : ' is-zero'}`}>
                        {row?.totalLabel ?? '—'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  numeric,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const active = sort.key === k;
  return (
    <th className={numeric ? 'num' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)}>
        {label}
        <span aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  );
}

function ClientRowLink({
  client,
  selected,
  onSelect,
}: {
  client: ClientRow;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Link
      href={`/dashboard/clients/${client.id}`}
      className={`client-row${selected ? ' is-selected' : ''}`}
      onMouseEnter={() => onSelect(client.id)}
      onFocus={() => onSelect(client.id)}
    >
      <span className="client-avatar small" data-avatar-tone={avatarTone(client.name)} aria-hidden="true">{client.initials}</span>
      <div className="client-row-main">
        <div className="client-row-name">
          <strong>{client.name}</strong>
          {client.isRepeat ? <span className="client-repeat-badge">Repeat</span> : null}
        </div>
        <span className="client-row-contact">{client.contactLine}</span>
      </div>
      <div className="client-row-stats">
        <span><strong>{client.jobsLabel}</strong></span>
        <span><strong>{client.totalLabel}</strong> total</span>
        <span className="client-row-last">Last: {client.lastLabel}</span>
      </div>
    </Link>
  );
}

/**
 * Add a customer without leaving the list.
 *
 * The one thing you'd expect a customer list to do — add a customer — couldn't
 * be done from it until now; they only appeared as a side effect of a job or an
 * import.
 */
function AddClientDialog({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      returnTo.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="client-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="client-modal" role="dialog" aria-modal="true" aria-labelledby="add-client-title" ref={panelRef}>
        <header>
          <div>
            <h3 id="add-client-title">Add a new client</h3>
            <p>Already in your list? Adding them again opens the profile you have rather than making a second one.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <form action={createClientAction} className="client-modal-form">
          <div className="field">
            <label htmlFor="nc-name">Name *</label>
            <input id="nc-name" name="name" required maxLength={160} placeholder="Dana Whitfield" />
          </div>
          <div className="client-modal-row">
            <div className="field">
              <label htmlFor="nc-phone">Phone</label>
              <input id="nc-phone" name="phone" type="tel" placeholder="(248) 555-0112" />
            </div>
            <div className="field">
              <label htmlFor="nc-email">Email</label>
              <input id="nc-email" name="email" type="email" placeholder="dana@example.com" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="nc-address">Address</label>
            <AddressAutocomplete id="nc-address" name="address" placeholder="Start typing the address" />
          </div>
          <div className="field">
            <label htmlFor="nc-notes">Notes</label>
            <textarea id="nc-notes" name="notes" rows={2} maxLength={2000} placeholder="Gate code, dog, where to park…" />
          </div>
          <div className="client-modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <SaveButton className="btn primary" pendingLabel="Adding…" savedLabel="Added ✓">Add client</SaveButton>
          </div>
        </form>
      </div>
    </div>
  );
}
