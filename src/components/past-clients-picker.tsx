'use client';

import { useMemo, useState } from 'react';

export type PastClientOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: 'job' | 'lead' | 'both';
  sourceLabel: string;
};

type PastClientsPickerProps = {
  clients: PastClientOption[];
};

function fillField(id: string, value: string | null) {
  const input = document.getElementById(id);
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;

  input.value = value ?? '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function PastClientsPicker({ clients }: PastClientsPickerProps) {
  const [mode, setMode] = useState<'new' | 'previous'>('new');
  const [search, setSearch] = useState('');

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? clients.filter((client) => [client.name, client.phone, client.email, client.address].some((value) => value?.toLowerCase().includes(query)))
      : clients;

    return filtered.slice(0, 6);
  }, [clients, search]);

  function selectClient(client: PastClientOption) {
    fillField('clientPhone', client.phone);
    fillField('clientEmail', client.email);
    fillField('address', client.address);
    setSearch(client.name);
  }

  function setClientMode(nextMode: 'new' | 'previous') {
    setMode(nextMode);
    if (nextMode === 'new') {
      setSearch('');
      fillField('clientPhone', '');
      fillField('clientEmail', '');
      fillField('address', '');
    }
  }

  const hasPastClients = clients.length > 0;

  return (
    <div className="field full past-clients-picker">
      {hasPastClients ? (
        <div className="past-client-mode-toggle" aria-label="Client type">
          <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setClientMode('new')} aria-pressed={mode === 'new'}>
            New client
          </button>
          <button type="button" className={mode === 'previous' ? 'active' : ''} onClick={() => setClientMode('previous')} aria-pressed={mode === 'previous'}>
            Previous client
          </button>
        </div>
      ) : null}

      {mode === 'new' || !hasPastClients ? (
        <>
          <label htmlFor="clientName">Client name</label>
          <input key="new-client-name" id="clientName" name="clientName" required placeholder="Sarah Whitfield" />
        </>
      ) : (
        <>
          <label htmlFor="pastClientSearch">Previous client</label>
          <input
            key="previous-client-name"
            id="pastClientSearch"
            name="clientName"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search by name, phone, email, or address"
            autoComplete="off"
            required
          />
          <div className="past-client-results" aria-label="Past client matches">
            {matches.map((client) => (
              <button key={client.id} type="button" onClick={() => selectClient(client)}>
                <span>
                  <strong>{client.name}</strong>
                  <small>{[client.email, client.phone, client.address].filter(Boolean).join(' · ') || 'No saved contact details'}</small>
                </span>
                <em>{client.sourceLabel}</em>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
