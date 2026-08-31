'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ManualArticleSummary, ManualChapter } from '@/lib/admin-manual';
import styles from '../manual.module.css';

interface AdminManualExplorerProps {
  chapters: ManualChapter[];
  summaries: ManualArticleSummary[];
}

export default function AdminManualExplorer({ chapters, summaries }: AdminManualExplorerProps) {
  const [query, setQuery] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState('all');

  const filteredSummaries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return summaries.filter((item) => {
      if (selectedChapter !== 'all' && item.chapterId !== selectedChapter) {
        return false;
      }
      if (selectedRisk !== 'all' && item.riskLevel !== selectedRisk) {
        return false;
      }
      if (!q) return true;

      const matchesTitle = item.title.toLowerCase().includes(q);
      const matchesSummary = item.summary.toLowerCase().includes(q);
      const matchesChapter = item.chapterTitle.toLowerCase().includes(q);
      const matchesKeywords = item.keywords.some((k) => k.toLowerCase().includes(q));
      const matchesRoutes = item.routes.some(
        (r) => r.label.toLowerCase().includes(q) || r.href.toLowerCase().includes(q),
      );

      return matchesTitle || matchesSummary || matchesChapter || matchesKeywords || matchesRoutes;
    });
  }, [summaries, query, selectedChapter, selectedRisk]);

  const isFiltered = query.trim().length > 0 || selectedChapter !== 'all' || selectedRisk !== 'all';

  return (
    <div className={styles.explorer}>
      <div className={styles.searchBar}>
        <input
          type="search"
          placeholder="Search by task, symptom, page (/admin/*), permission, or keyword..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.searchInput}
          aria-label="Search manual articles"
        />

        <select
          value={selectedChapter}
          onChange={(e) => setSelectedChapter(e.target.value)}
          className={styles.filterSelect}
          aria-label="Filter by chapter"
        >
          <option value="all">All Chapters ({chapters.length})</option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              Ch. {ch.number}: {ch.shortTitle}
            </option>
          ))}
        </select>

        <select
          value={selectedRisk}
          onChange={(e) => setSelectedRisk(e.target.value)}
          className={styles.filterSelect}
          aria-label="Filter by risk level"
        >
          <option value="all">All Risk Levels</option>
          <option value="general">General (Read-Only/Standard)</option>
          <option value="production">Production Impact / Sensitive</option>
        </select>
      </div>

      {isFiltered ? (
        <div className={styles.chapterSection}>
          <div className={styles.chapterHeader}>
            <h2 className={styles.chapterTitle}>Search Results</h2>
            <span className={styles.chapterMeta}>
              Found {filteredSummaries.length} permitted guide{filteredSummaries.length === 1 ? '' : 's'}
            </span>
          </div>

          {filteredSummaries.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '1rem 0' }}>
              No operating guides matched &quot;{query}&quot;. Check spelling or clear filters.
            </p>
          ) : (
            <div className={styles.articleGrid}>
              {filteredSummaries.map((art) => (
                <Link
                  key={art.slug}
                  href={`/admin/manual/${art.slug}`}
                  className={styles.articleCard}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardBadgeRow}>
                      <span
                        className={`${styles.badge} ${
                          art.riskLevel === 'production' ? styles.badgeProduction : styles.badgeGeneral
                        }`}
                      >
                        {art.riskLevel}
                      </span>
                      {art.requiresMfa && (
                        <span className={`${styles.badge} ${styles.badgeMfa}`}>MFA</span>
                      )}
                      {art.requiredPermission && (
                        <span className={styles.badge}>{art.requiredPermission}</span>
                      )}
                    </div>
                    <h3 className={styles.cardTitle}>{art.title}</h3>
                    <p className={styles.cardSummary}>{art.summary}</p>
                  </div>
                  <div className={styles.cardFoot}>
                    <span>{art.chapterTitle}</span>
                    <span>Owner: {art.owner}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {chapters.map((chapter) => (
            <section key={chapter.id} className={styles.chapterSection}>
              <div className={styles.chapterHeader}>
                <div>
                  <h2 className={styles.chapterTitle}>
                    Chapter {chapter.number}: {chapter.title}
                  </h2>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.2rem 0 0' }}>
                    {chapter.summary}
                  </p>
                </div>
                <span className={styles.chapterMeta}>Owner: {chapter.owner}</span>
              </div>

              <div className={styles.articleGrid}>
                {chapter.articles.map((art) => (
                  <Link
                    key={art.slug}
                    href={`/admin/manual/${art.slug}`}
                    className={styles.articleCard}
                  >
                    <div className={styles.cardTop}>
                      <div className={styles.cardBadgeRow}>
                        <span
                          className={`${styles.badge} ${
                            art.riskLevel === 'production'
                              ? styles.badgeProduction
                              : styles.badgeGeneral
                          }`}
                        >
                          {art.riskLevel}
                        </span>
                        {art.requiresMfa && (
                          <span className={`${styles.badge} ${styles.badgeMfa}`}>MFA</span>
                        )}
                        {art.requiredPermission && (
                          <span className={styles.badge}>{art.requiredPermission}</span>
                        )}
                      </div>
                      <h3 className={styles.cardTitle}>{art.title}</h3>
                      <p className={styles.cardSummary}>{art.summary}</p>
                    </div>
                    <div className={styles.cardFoot}>
                      <span>{art.routes.length > 0 ? art.routes[0]?.label : 'Console'}</span>
                      <span>Verified: {art.lastVerified}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
