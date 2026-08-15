'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ARTICLES, ARTICLE_CATEGORIES, formatArticleDate } from '@/lib/resources';
import styles from '../for/for.module.css';

/**
 * The library, with a category filter and a search box.
 *
 * SAME RULE AS TradeFinder, and for the same reason: every article link stays
 * in the HTML whatever the controls say. Filtering sets `hidden` on the cards
 * that do not match rather than unmounting them, so the page a crawler reads
 * contains all of them, in order, and a filtered-out card is out of the tab
 * order and out of the accessibility tree at the same time. Unmounting would
 * put the full set in the initial HTML and then take most of it away the moment
 * anybody pressed a category — a difference no crawler sees and every "view
 * source after clicking" audit does.
 *
 * The controls are borrowed wholesale from /for's stylesheet rather than
 * duplicated into a second module: they are the same three controls doing the
 * same job, and two copies is how they drift.
 *
 * FOUR ARTICLES DO NOT NEED A SEARCH BOX. That is true today and is not the
 * point — the shape is here so that the tenth and the fortieth arrive into a
 * library that already files them, and so the category names on the cards mean
 * something you can act on rather than being decoration.
 */

// Searched text, built once at module scope — these are facts about static data.
const INDEX = new Map(
  ARTICLES.map((article) => [
    article.slug,
    `${article.title} ${article.excerpt} ${article.category}`.toLowerCase(),
  ]),
);

export default function ResourceLibrary() {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const term = query.trim().toLowerCase();
  const shows = (slug: string, articleCategory: string) =>
    (category === 'all' || articleCategory === category) &&
    (term === '' || (INDEX.get(slug) ?? '').includes(term));

  const shown = ARTICLES.filter((article) => shows(article.slug, article.category)).length;
  const filtering = term !== '' || category !== 'all';

  return (
    <>
      <div className={styles.finder}>
        <div>
          <label className={styles.searchLabel} htmlFor={searchId}>
            Search the guides
          </label>
          <div className={styles.searchField}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" strokeLinecap="round" />
            </svg>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Deposits, margin, reviews…"
              autoComplete="off"
            />
          </div>
        </div>

        <div className={styles.cats} role="group" aria-label="Filter by topic">
          <button
            type="button"
            className={styles.cat}
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            All guides
          </button>
          {ARTICLE_CATEGORIES.map((label) => (
            <button
              key={label}
              type="button"
              className={styles.cat}
              aria-pressed={category === label}
              onClick={() => setCategory(label)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.count}>
        {filtering ? `${shown} of ${ARTICLES.length} guides` : `All ${ARTICLES.length} guides`}
      </p>
      {/* Politely, and only the count. */}
      <p className="sr-only" role="status" aria-live="polite">
        {shown} of {ARTICLES.length} guides shown
      </p>

      <div className="feature-grid fav-grid">
        {ARTICLES.map((article) => (
          <Link
            key={article.slug}
            href={`/resources/${article.slug}`}
            className="feature-card fav-card resource-card"
            hidden={!shows(article.slug, article.category)}
          >
            <span className="fav-card-tag">{article.category}</span>
            <h3>{article.title}</h3>
            <p>{article.excerpt}</p>
            <span className="resource-meta">
              {formatArticleDate(article.datePublished)} · {article.readMinutes} min read
            </span>
          </Link>
        ))}
      </div>

      {shown === 0 ? (
        <p className={styles.count}>
          Nothing matches that yet. <button type="button" className={styles.cat} onClick={() => { setQuery(''); setCategory('all'); }}>Show all guides</button>
        </p>
      ) : null}
    </>
  );
}
