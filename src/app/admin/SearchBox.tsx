'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchResult, SearchResults } from '@/lib/admin-search';
import styles from './admin.module.css';

const RECENT_KEY = 'admin_recent_searches';
const RECENT_MAX = 8;
const EMPTY_RESULTS: SearchResults = { accounts: [], clients: [], quickStops: [], payments: [] };
const SECTIONS: { key: keyof SearchResults }[] = [{ key: 'accounts' }, { key: 'clients' }, { key: 'quickStops' }, { key: 'payments' }];

function loadRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  const trimmed = term.trim();
  if (!trimmed || typeof window === 'undefined') return;
  try {
    const rest = loadRecent().filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([trimmed, ...rest].slice(0, RECENT_MAX)));
  } catch {
    // Best-effort convenience only — a full or blocked localStorage is fine to ignore.
  }
}

type ListItem = { href: string; label: string; sub?: string | null; term: string };

// Sidebar quick-search: debounced live lookup across every entity type, with
// keyboard navigation and localStorage recent searches. The full grouped
// results page (/admin/search) is the "see all" destination for a query this
// box can't fully show in a dropdown.
export default function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => setRecent(loadRecent()), []);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      fetch(`/api/admin/search?q=${encodeURIComponent(term)}`)
        .then((res) => res.json())
        .then((data: SearchResults) => {
          if (id === requestId.current) setResults(data);
        })
        .catch(() => {
          if (id === requestId.current) setResults(EMPTY_RESULTS);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const showingRecent = query.trim().length === 0;
  const list: ListItem[] = showingRecent
    ? recent.map((term) => ({ href: `/admin/search?q=${encodeURIComponent(term)}`, label: term, term }))
    : SECTIONS.flatMap((s) => results[s.key]).map((r: SearchResult) => ({ href: r.href, label: r.title, sub: r.subtitle, term: query.trim() }));

  const goTo = useCallback(
    (href: string, term: string) => {
      saveRecent(term);
      setOpen(false);
      setQuery('');
      setHighlight(-1);
      router.push(href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      if (!list.length) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h + 1) % list.length);
    } else if (e.key === 'ArrowUp') {
      if (!list.length) return;
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? list.length - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = highlight >= 0 ? list[highlight] : null;
      if (picked) {
        goTo(picked.href, picked.term);
      } else if (query.trim()) {
        goTo(`/admin/search?q=${encodeURIComponent(query.trim())}`, query.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.searchBox} ref={containerRef}>
      <input
        className={styles.searchBoxInput}
        type="search"
        value={query}
        placeholder="Search…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Search accounts, customers, Quick Stops, and payments"
      />
      {open && (list.length > 0 || loading) ? (
        <div className={styles.searchDropdown}>
          {showingRecent ? <p className={styles.searchDropdownLabel}>Recent</p> : null}
          {!list.length && loading ? <p className={styles.searchDropdownEmpty}>Searching…</p> : null}
          {list.map((item, i) => (
            <button
              key={`${item.href}-${i}`}
              type="button"
              className={`${styles.searchResult} ${i === highlight ? styles.searchResultActive : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => goTo(item.href, item.term)}
            >
              <span>{item.label}</span>
              {item.sub ? <span className={styles.searchResultSub}>{item.sub}</span> : null}
            </button>
          ))}
          {!showingRecent && query.trim() ? (
            <button
              type="button"
              className={styles.searchSeeAll}
              onClick={() => goTo(`/admin/search?q=${encodeURIComponent(query.trim())}`, query.trim())}
            >
              See all results →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
