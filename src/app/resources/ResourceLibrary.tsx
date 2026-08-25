'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ARTICLES, ARTICLE_CATEGORIES, formatArticleDate } from '@/lib/resources';
import forStyles from '../for/for.module.css';
import guideStyles from './guide.module.css';

const CATEGORY_ICONS: Record<string, string> = {
  'Pricing & profit': '💰',
  'Getting leads': '⚡',
  'Getting paid': '💳',
  'Reputation': '⭐️',
  'Operations & crew': '🛠',
  'Customer messaging': '📱',
};

// Searched text, built once at module scope — these are facts about static data.
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
        <div className={guideStyles.spotlightCard}>
          <div>
            <span className={guideStyles.spotlightBadge}>
              <span aria-hidden="true">★</span> Featured Contractor Playbook
            </span>
            <h2 className={guideStyles.spotlightTitle}>{spotlight.title}</h2>
            <p className={guideStyles.spotlightExcerpt}>{spotlight.excerpt}</p>
            <span className="resource-meta">
              {spotlight.category} · {spotlight.readMinutes} min read
            </span>
          </div>
          <div>
            <Link href={`/resources/${spotlight.slug}`} className="btn primary" style={{ whiteSpace: 'nowrap' }}>
              Read playbook →
            </Link>
          </div>
        </div>
      ) : null}

      <div className={forStyles.finder}>
        <div>
          <label className={forStyles.searchLabel} htmlFor={searchId}>
            Search the guides
          </label>
          <div className={forStyles.searchField}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" strokeLinecap="round" />
            </svg>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Deposits, margin, 10DLC, reviews, scheduling…"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '0 4px', fontSize: '1.1rem' }}
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        <div className={forStyles.cats} role="group" aria-label="Filter by topic">
          <button
            type="button"
            className={forStyles.cat}
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
          >
            All guides ({ARTICLES.length})
          </button>
          {ARTICLE_CATEGORIES.map((label) => (
            <button
              key={label}
              type="button"
              className={forStyles.cat}
              aria-pressed={category === label}
              onClick={() => setCategory(label)}
            >
              <span aria-hidden="true" style={{ marginRight: '4px' }}>
                {CATEGORY_ICONS[label] ?? '📄'}
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className={forStyles.count}>
        {filtering ? `${shown} of ${ARTICLES.length} guides` : `All ${ARTICLES.length} guides`}
      </p>
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
            <span className="fav-card-tag">
              <span aria-hidden="true" style={{ marginRight: '4px' }}>
                {CATEGORY_ICONS[article.category] ?? '📄'}
              </span>
              {article.category}
            </span>
            <h3>{article.title}</h3>
            <p>{article.excerpt}</p>
            <span className="resource-meta">
              {formatArticleDate(article.datePublished)} · {article.readMinutes} min read
            </span>
          </Link>
        ))}
      </div>

      {shown === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <p className={forStyles.count} style={{ fontSize: '1.05rem', marginBottom: '1rem' }}>
            No guides match &ldquo;{query}&rdquo;.
          </p>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setQuery('');
              setCategory('all');
            }}
          >
            Reset filters & show all guides
          </button>
        </div>
      ) : null}
    </>
  );
}
