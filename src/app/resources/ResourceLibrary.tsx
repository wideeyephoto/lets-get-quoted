'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ARTICLES, ARTICLE_CATEGORIES, formatArticleDate } from '@/lib/resources';
import styles from './resources.module.css';

const CATEGORY_ICONS: Record<string, string> = {
  'Pricing & profit': '💰',
  'Getting leads': '⚡',
  'Getting paid': '💳',
  'Reputation': '⭐️',
  'Operations & crew': '🛠',
  'Customer messaging': '📱',
};

// Searched text, built once at module scope — static data facts.
const INDEX = new Map(
  ARTICLES.map((article) => [
    article.slug,
    `${article.title} ${article.excerpt} ${article.category} ${article.body.map((b) => (b.type === 'ul' ? b.items.join(' ') : b.text)).join(' ')}`.toLowerCase(),
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

  const spotlight = ARTICLES.find((a) => a.slug === 'good-better-best-quoting-guide') || ARTICLES[0];

  return (
    <>
      {/* Featured Spotlight Card when browsing all */}
      {!filtering && spotlight ? (
        <article className={styles.spotlightCard} aria-labelledby="spotlight-title">
          <div>
            <div className={styles.spotlightBadge}>
              <span aria-hidden="true">★</span> Featured Contractor Playbook
            </div>
            <h2 id="spotlight-title" className={styles.spotlightTitle}>
              {spotlight.title}
            </h2>
            <p className={styles.spotlightExcerpt}>{spotlight.excerpt}</p>
            <div className={styles.spotlightMeta}>
              <span className={styles.spotlightMetaTag}>
                <span aria-hidden="true">{CATEGORY_ICONS[spotlight.category] ?? '📄'}</span>
                {spotlight.category}
              </span>
              <span>·</span>
              <span>{spotlight.readMinutes} min read</span>
              <span>·</span>
              <span>Updated {formatArticleDate(spotlight.datePublished)}</span>
            </div>
          </div>
          <div className={styles.spotlightAction}>
            <Link href={`/resources/${spotlight.slug}`} className={styles.btnPrimary}>
              Read playbook <span aria-hidden="true">→</span>
            </Link>
          </div>
        </article>
      ) : null}

      {/* Sticky Command Bar: Search & Category Filter */}
      <section className={styles.finderShell} aria-label="Search and filter contractor guides">
        <div className={styles.searchRow}>
          <div className={styles.searchField}>
            <svg
              className={styles.searchIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" strokeLinecap="round" />
            </svg>
            <label htmlFor={searchId} className="sr-only">
              Search contractor guides
            </label>
            <input
              id={searchId}
              type="search"
              className={styles.searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search guides: deposits, profit margin, 10DLC, e-signatures, reviews..."
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={() => setQuery('')}
                aria-label="Clear search"
                title="Clear search"
              >
                ✕ Clear
              </button>
            ) : null}
          </div>
        </div>

        {/* Category Pill Filters */}
        <div className={styles.categoryStrip} role="group" aria-label="Filter guides by topic">
          <button
            type="button"
            className={`${styles.categoryPill} ${category === 'all' ? styles.categoryPillActive : ''}`}
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            All guides <span className={styles.categoryCountBadge}>{ARTICLES.length}</span>
          </button>
          {ARTICLE_CATEGORIES.map((label) => {
            const count = ARTICLES.filter((a) => a.category === label).length;
            const isActive = category === label;
            return (
              <button
                key={label}
                type="button"
                className={`${styles.categoryPill} ${isActive ? styles.categoryPillActive : ''}`}
                aria-pressed={isActive}
                onClick={() => setCategory(label)}
              >
                <span className={styles.categoryIcon} aria-hidden="true">
                  {CATEGORY_ICONS[label] ?? '📄'}
                </span>
                {label}
                <span className={styles.categoryCountBadge}>{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Results Status Header */}
      <div className={styles.statusBar}>
        <span className={styles.resultsCount}>
          {filtering ? (
            <>
              Showing <strong>{shown}</strong> of <strong>{ARTICLES.length}</strong> guides
              {category !== 'all' ? ` in ${category}` : ''}
              {term ? ` matching "${query}"` : ''}
            </>
          ) : (
            <>Showing all <strong>{ARTICLES.length}</strong> contractor playbooks & guides</>
          )}
        </span>
        {filtering ? (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => {
              setQuery('');
              setCategory('all');
            }}
          >
            Reset all filters
          </button>
        ) : null}
      </div>

      {/* Resource Grid */}
      <div className={styles.grid}>
        {ARTICLES.map((article) => (
          <Link
            key={article.slug}
            href={`/resources/${article.slug}`}
            className={styles.card}
            hidden={!shows(article.slug, article.category)}
          >
            <div>
              <div className={styles.cardHeader}>
                <span className={styles.cardCategory}>
                  <span aria-hidden="true">{CATEGORY_ICONS[article.category] ?? '📄'}</span>
                  {article.category}
                </span>
                <span className={styles.cardReadTime}>{article.readMinutes} min read</span>
              </div>
              <h3 className={styles.cardTitle}>{article.title}</h3>
              <p className={styles.cardExcerpt}>{article.excerpt}</p>
            </div>
            <div className={styles.cardFooter}>
              <span>{formatArticleDate(article.datePublished)}</span>
              <span className={styles.cardLinkText}>
                Read guide <span aria-hidden="true">→</span>
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty State when zero results */}
      {shown === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden="true">
            🔍
          </div>
          <h3 className={styles.emptyTitle}>No matching contractor guides found</h3>
          <p className={styles.emptyDesc}>
            We couldn’t find any guides matching &ldquo;{query}&rdquo;
            {category !== 'all' ? ` in ${category}` : ''}. Try another search term or browse all categories.
          </p>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              setQuery('');
              setCategory('all');
            }}
          >
            Show all {ARTICLES.length} guides
          </button>
        </div>
      ) : null}
    </>
  );
}
