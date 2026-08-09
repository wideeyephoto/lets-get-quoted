'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { TRADES, type Trade } from '@/lib/trades';
import { TRADE_CATEGORIES, searchIndexFor } from '@/lib/trade-categories';
import styles from './for.module.css';

/**
 * The directory: all 49 trades, grouped, and every one of them in the HTML.
 *
 * THE LINKS ARE THE PAGE. /for is the hub that hands crawlers the 49 trade
 * pages, so the one thing this component must never do is make a link
 * conditional on somebody typing. It filters by setting `hidden` on entries that
 * do not match — the anchors stay in the document, in the same order, whatever
 * the controls say. Unmounting them (the previous version rendered `matches`)
 * put all 49 in the *initial* HTML and then took 40 of them out the moment a
 * category was pressed, which is a difference no crawler sees but every
 * "view source after clicking" audit does.
 *
 * `hidden` and not `display: none` in a class, because `hidden` also takes the
 * entry out of the accessibility tree and out of the tab order — a filtered-out
 * link that is still tabbable is the mobile-nav bug in miniature.
 *
 * FILED ONCE, AT MODULE SCOPE. The grouping and the search index are facts about
 * static data; building them per render (or per keystroke) is 49 joins and
 * lower-casings nobody asked for. tradeCategoryProblems() in
 * lib/trade-categories is what proves the mapping has no holes — a trade filed
 * in no category would simply be missing from below, silently.
 */

type Filed = { trade: Trade; index: string };

const BY_SLUG = new Map(TRADES.map((trade) => [trade.slug, trade] as const));

const GROUPS: { id: string; label: string; entries: Filed[] }[] = TRADE_CATEGORIES.map(
  (category) => ({
    id: category.id,
    label: category.label,
    entries: category.slugs
      .map((slug) => BY_SLUG.get(slug))
      .filter((trade): trade is Trade => Boolean(trade))
      .map((trade) => ({ trade, index: searchIndexFor(trade) }))
      // A–Z inside the group: the categories are the coarse cut, and within one
      // of them the only order a reader can predict is alphabetical.
      .sort((a, b) => a.trade.name.localeCompare(b.trade.name, 'en')),
  }),
);

const TOTAL = GROUPS.reduce((sum, group) => sum + group.entries.length, 0);

export default function TradeFinder() {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const term = query.trim().toLowerCase();
  const shows = (entry: Filed, groupId: string) =>
    (category === 'all' || groupId === category) && (term === '' || entry.index.includes(term));

  const shown = GROUPS.reduce(
    (sum, group) => sum + group.entries.filter((entry) => shows(entry, group.id)).length,
    0,
  );
  const filtering = term !== '' || category !== 'all';

  return (
    <>
      <div className={styles.finder}>
        <div>
          <label className={styles.searchLabel} htmlFor={searchId}>
            Search your trade
          </label>
          <div className={styles.searchField}>
            {/* A magnifier, drawn rather than typed, so it cannot land as a tofu
                box on a device without the glyph. */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" strokeLinecap="round" />
            </svg>
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

        {/* Buttons with aria-pressed, not links or a radio group: this narrows a
            list that is already on the page, and nothing about it is a
            navigation. */}
        <div className={styles.cats} role="group" aria-label="Filter by category">
          <button
            type="button"
            className={styles.cat}
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            All trades
          </button>
          {TRADE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={styles.cat}
              aria-pressed={category === cat.id}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.count}>
        {filtering ? `${shown} of ${TOTAL} trades` : `All ${TOTAL} trades`}
      </p>
      {/* Politely, and only the count — a screen reader should hear that the list
          changed without having forty-nine names read at it again. */}
      <p className="sr-only" role="status" aria-live="polite">
        {shown} of {TOTAL} trades shown
      </p>

      {GROUPS.map((group) => {
        const visible = group.entries.filter((entry) => shows(entry, group.id)).length;
        return (
          <section key={group.id} className={styles.group} hidden={visible === 0}>
            <h3>{group.label}</h3>
            <ul className={styles.tradeList}>
              {group.entries.map((entry) => (
                <li key={entry.trade.slug} hidden={!shows(entry, group.id)}>
                  <Link href={`/for/${entry.trade.slug}`}>
                    <b>{entry.trade.name}</b>
                    <span>{entry.trade.services.slice(0, 3).join(' · ')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {shown === 0 ? (
        <p className={styles.empty}>
          Nothing matches “{query.trim()}”. Every feature is trade-agnostic, so it still works —{' '}
          <Link href="/demo">explore the demo &rarr;</Link>
        </p>
      ) : null}
    </>
  );
}
