'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

// A customer-name field that knows who you already have.
//
// Typing a name that's already in the book and retyping their phone, email and
// address is how the same customer ends up in the database three times with
// three different spellings. This searches the existing list as you type and
// fills the rest of the form from the one you pick.
//
// It is a SEARCH, not a picker: a name that matches nobody is still a valid
// answer, because plenty of plans start with a customer who isn't in the book
// yet. Nothing is forced and nothing is blocked.

export type LookupClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

function score(client: LookupClient, needle: string): number {
  const name = client.name.toLowerCase();
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;
  // Match on the other fields too — people search by the phone number they have
  // in front of them as often as by name.
  if ((client.phone ?? '').replace(/\D/g, '').includes(needle.replace(/\D/g, '')) && needle.replace(/\D/g, '').length >= 3) return 3;
  if ((client.email ?? '').toLowerCase().includes(needle)) return 4;
  return -1;
}

export default function ClientLookup({
  id,
  name,
  clients,
  required,
  placeholder,
  onPick,
}: {
  id?: string;
  name: string;
  clients: LookupClient[];
  required?: boolean;
  placeholder?: string;
  /** The chosen customer. Called with null when the text no longer matches one. */
  onPick: (client: LookupClient | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [picked, setPicked] = useState<LookupClient | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return clients
      .map((client) => ({ client, rank: score(client, needle) }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.client.name.localeCompare(b.client.name))
      .slice(0, 6)
      .map((entry) => entry.client);
  }, [clients, query]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function choose(client: LookupClient) {
    setPicked(client);
    setQuery(client.name);
    if (inputRef.current) inputRef.current.value = client.name;
    setOpen(false);
    setHighlighted(-1);
    onPick(client);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current <= 0 ? matches.length - 1 : current - 1));
    } else if (event.key === 'Enter' && highlighted >= 0) {
      event.preventDefault();
      choose(matches[highlighted]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlighted(-1);
    }
  }

  return (
    <div className="client-lookup" ref={wrapRef}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
        aria-controls={open && matches.length > 0 ? listboxId : undefined}
        aria-activedescendant={highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
          setHighlighted(-1);
          // Editing the name away from the customer you picked means the rest of
          // the form is no longer theirs — say so rather than leaving somebody
          // else's phone number sitting under a different name.
          if (picked && event.currentTarget.value !== picked.name) {
            setPicked(null);
            onPick(null);
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {picked ? (
        <p className="client-lookup-note">
          Filled from your customer list. Edit any field and this plan uses what you typed.
        </p>
      ) : null}
      {open && matches.length > 0 ? (
        <div id={listboxId} className="client-lookup-list" role="listbox">
          {matches.map((client, index) => (
            <button
              key={client.id}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === highlighted}
              className={index === highlighted ? 'active' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(client)}
            >
              <span>{client.name}</span>
              <small>{[client.phone, client.email, client.address].filter(Boolean).join(' · ') || 'No contact details saved'}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
