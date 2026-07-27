'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export type ClientSearchRow = {
  id: string;
  name: string;
  isRepeat: boolean;
  contactLine: string;
  jobsLabel: string;
  totalLabel: string;
  lastLabel: string;
  // Lower-cased haystack of name + phone + email + address, matched as you type.
  search: string;
};

type ClientsSearchListProps = {
  clients: ClientSearchRow[];
};

export default function ClientsSearchList({ clients }: ClientsSearchListProps) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    // Match every whitespace-separated term (order-independent) so "smith 555"
    // finds a Smith with a 555 number.
    const terms = q.split(/\s+/);
    return clients.filter((client) => terms.every((term) => client.search.includes(term)));
  }, [clients, query]);

  return (
    <>
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

      {matches.length === 0 ? (
        <p className="empty-state">No clients match “{query.trim()}”. Try a name, phone number, email, or address.</p>
      ) : (
        <div className="client-list">
          {matches.map((client) => (
            <Link href={`/dashboard/clients/${client.id}`} className="client-row" key={client.id}>
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
          ))}
        </div>
      )}
    </>
  );
}
