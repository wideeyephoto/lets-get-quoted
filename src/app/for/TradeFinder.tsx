'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import type { Trade } from '@/lib/trades';
import {
  TRADE_CATEGORIES,
  categoryOf,
  searchIndexFor,
  tradesAlphabetical,
} from '@/lib/trade-categories';

/**
 * Finding your trade among forty-nine of them.
 *
 * The directory used to be one flat grid of forty-nine cards, each carrying
 * four example services — about 7,200px of page on a phone, in the order the
 * array happened to be written, with no way to jump. Scanning it was the only
 * way to use it.
 *
 * Three changes, in the order somebody actually works:
 *
 *   1. TYPE. The index covers each trade's services as well as its name, so
 *      "water heater" finds Plumbers and "mulch" finds Landscapers — which is
 *      how a contractor describes their work when the category name does not
 *      come to mind.
 *   2. NARROW. Six categories, named for what the contractor does rather than
 *      for a construction taxonomy.
 *   3. SCAN. What is left is A–Z by display name and one line per trade, so
 *      the whole directory is a screen or two rather than a scroll.
 *
 * The search index is built once, not per keystroke: forty-nine joins and
 * lower-casings on every character typed is work nobody asked for.
 */

type Filed = { trade: Trade; index: string; categoryId: string };

export default function TradeFinder({ children }: { children: React.ReactNode }) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const filed = useMemo<Filed[]>(
    () =>
      tradesAlphabetical().map((trade) => ({
        trade,
        index: searchIndexFor(trade),
        categoryId: categoryOf(trade.slug)?.id ?? '',
      })),
    [],
  );

  const term = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      filed.filter(
        (entry) =>
          (category === 'all' || entry.categoryId === category) &&
          (term === '' || entry.index.includes(term)),
      ),
    [filed, category, term],
  );

  /* Untouched means "show the page as written" — the shortlist above the full
     directory. The moment either control is used, the shortlist would be a
     second, unfiltered list of trades next to a filtered one, which is the
     confusing thing rather than the helpful one. */
  const filtering = term !== '' || category !== 'all';

  return (
    <>
      <div className="trade-finder">
        <div className="trade-search">
          <label htmlFor={searchId}>Search your trade</label>
          <div className="trade-search-field">
            <span className="trade-search-ic" aria-hidden="true">
              {/* A magnifier, drawn rather than typed, so it cannot land as a
                  tofu box on a device without the glyph. */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Plumbing, water heaters, mulch…"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="trade-cats" role="group" aria-label="Filter by category">
          {/* Buttons with aria-pressed, not links or a radio group: this filters
              a list already on the page, and nothing about it is a navigation. */}
          <button
            type="button"
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            All trades
          </button>
          {TRADE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              aria-pressed={category === cat.id}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* The shortlist, and only while nothing is being filtered. */}
      {!filtering ? children : null}

      <div className="trade-directory">
        <h3>
          {filtering
            ? `${matches.length} ${matches.length === 1 ? 'trade' : 'trades'} match`
            : `All ${filed.length} trades`}
        </h3>
        {/* Politely, and only the count — a screen reader should hear that the
            list changed without having forty-nine names read at it again. */}
        <p className="sr-only" role="status" aria-live="polite">
          {matches.length} of {filed.length} trades shown
        </p>

        {matches.length ? (
          <ul className="trade-list">
            {matches.map(({ trade }) => (
              <li key={trade.slug}>
                <Link href={`/for/${trade.slug}`}>
                  <b>{trade.name}</b>
                  <span>{trade.services.slice(0, 3).join(' · ')}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="trade-empty">
            Nothing matches “{query.trim()}”. Every feature is trade-agnostic, so it still works —{' '}
            <Link href="/demo">explore the demo &rarr;</Link>
          </p>
        )}
      </div>
    </>
  );
}
