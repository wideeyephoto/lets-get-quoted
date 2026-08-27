'use client';

import React, { useState, useId } from 'react';
import Link from 'next/link';
import {
  CHANGELOG_CATEGORIES,
  CHANGELOG_RELEASES,
  type ChangelogCategory,
} from '@/lib/changelog';
import styles from './changelog.module.css';

export default function ChangelogFeed() {
  const searchId = useId();
  const [activeCategory, setActiveCategory] = useState<ChangelogCategory>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const query = searchQuery.trim().toLowerCase();

  const filteredReleases = CHANGELOG_RELEASES.filter((release) => {
    const matchesCategory =
      activeCategory === 'All' || release.category === activeCategory;
    if (!matchesCategory) return false;

    if (!query) return true;

    const searchable = `${release.title} ${release.summary} ${release.version} ${release.highlights
      .map((h) => `${h.title} ${h.description}`)
      .join(' ')}`.toLowerCase();

    return searchable.includes(query);
  });

  return (
    <div className={styles.timeline}>
      <div className={styles.filterBar}>
        <div className={styles.categoryGroup} role="group" aria-label="Filter updates by category">
          {CHANGELOG_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`${styles.categoryPill} ${
                activeCategory === category ? styles.categoryPillActive : ''
              }`}
              onClick={() => setActiveCategory(category)}
              aria-pressed={activeCategory === category}
            >
              {category}
            </button>
          ))}
        </div>

        <div className={styles.searchWrap}>
          <svg
            className={styles.searchIcon}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            id={searchId}
            type="search"
            className={styles.searchInput}
            placeholder="Search updates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search changelog updates"
          />
        </div>
      </div>

      {filteredReleases.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No releases match your search criteria.</p>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setActiveCategory('All');
              setSearchQuery('');
            }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        filteredReleases.map((release) => (
          <article key={release.id} className={styles.releaseEntry}>
            <div className={styles.releaseMetaCol}>
              <span className={styles.versionTag}>{release.version}</span>
              <time className={styles.dateDisplay} dateTime={release.date}>
                {new Date(release.date + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
            </div>

            <div className={styles.releaseCard}>
              <div className={styles.badgeRow}>
                {release.badge === 'Major Release' && (
                  <span className={styles.majorBadge}>★ Major Release</span>
                )}
                <span className={styles.categoryLabel}>{release.category}</span>
              </div>

              <h2 className={styles.releaseTitle}>{release.title}</h2>
              <p className={styles.releaseSummary}>{release.summary}</p>

              <div className={styles.highlightsGrid}>
                {release.highlights.map((highlight, idx) => (
                  <div key={idx} className={styles.highlightItem}>
                    <div className={styles.highlightHead}>
                      {highlight.badge === 'New' && (
                        <span className={styles.pillNew}>New</span>
                      )}
                      {highlight.badge === 'Improved' && (
                        <span className={styles.pillImproved}>Improved</span>
                      )}
                      <strong className={styles.highlightTitle}>{highlight.title}</strong>
                    </div>
                    <p className={styles.highlightText}>{highlight.description}</p>
                  </div>
                ))}
              </div>

              <div className={styles.actionBand}>
                {release.primaryAction && (
                  <Link
                    href={release.primaryAction.href}
                    className="btn primary"
                  >
                    {release.primaryAction.label} →
                  </Link>
                )}
                {release.secondaryAction && (
                  <Link
                    href={release.secondaryAction.href}
                    className="btn secondary"
                  >
                    {release.secondaryAction.label}
                  </Link>
                )}
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
