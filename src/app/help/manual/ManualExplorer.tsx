'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ManualArticleSummary, ManualAudience, ManualChapter } from '@/lib/help/user-manual';
import styles from './manual.module.css';

type ManualExplorerProps = {
  articles: ManualArticleSummary[];
  chapters: ManualChapter[];
};

const AUDIENCE_FILTERS: Array<'All roles' | ManualAudience> = ['All roles', 'Owner', 'Office staff', 'Crew'];

function searchableText(article: ManualArticleSummary, chapter?: ManualChapter): string {
  return [
    article.title,
    article.summary,
    article.keywords.join(' '),
    article.prerequisites.join(' '),
    article.audiences.join(' '),
    chapter?.title ?? '',
  ]
    .join(' ')
    .toLocaleLowerCase();
}

export function ManualExplorer({ articles, chapters }: ManualExplorerProps) {
  const [query, setQuery] = useState('');
  const [chapterId, setChapterId] = useState('all');
  const [audience, setAudience] = useState<(typeof AUDIENCE_FILTERS)[number]>('All roles');

  const chapterMap = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredArticles = articles.filter((article) => {
    const matchesQuery = !normalizedQuery || searchableText(article, chapterMap.get(article.chapterId)).includes(normalizedQuery);
    const matchesChapter = chapterId === 'all' || article.chapterId === chapterId;
    const matchesAudience = audience === 'All roles' || article.audiences.includes(audience);
    return matchesQuery && matchesChapter && matchesAudience;
  });

  const visibleChapters = chapters
    .map((chapter) => ({
      chapter,
      articles: filteredArticles
        .filter((article) => article.chapterId === chapter.id)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    }))
    .filter((entry) => entry.articles.length > 0);

  function clearFilters() {
    setQuery('');
    setChapterId('all');
    setAudience('All roles');
  }

  return (
    <section className={styles.library} aria-labelledby="manual-library-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Complete reference</p>
          <h2 id="manual-library-heading">Browse the manual</h2>
        </div>
        <p>Search by task, feature, or problem. Filter by chapter or by the role doing the work.</p>
      </div>

      <div className={styles.explorerControls}>
        <label className={styles.searchLabel}>
          <span className={styles.srOnly}>Search the dashboard user manual</span>
          <span className={styles.searchIcon} aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “send an invoice” or “crew access”"
            className={styles.searchInput}
          />
        </label>

        <div className={styles.selectRow}>
          <label className={styles.selectLabel}>
            <span>Chapter</span>
            <select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
              <option value="all">All chapters</option>
              {chapters.map((chapter) => (
                <option value={chapter.id} key={chapter.id}>
                  {chapter.number}. {chapter.shortTitle}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.selectLabel}>
            <span>Role</span>
            <select
              value={audience}
              onChange={(event) => setAudience(event.target.value as (typeof AUDIENCE_FILTERS)[number])}
            >
              {AUDIENCE_FILTERS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className={styles.resultSummary} aria-live="polite">
        <strong>{filteredArticles.length}</strong> {filteredArticles.length === 1 ? 'guide' : 'guides'} found
      </div>

      {visibleChapters.length > 0 ? (
        <div className={styles.chapterList}>
          {visibleChapters.map(({ chapter, articles: chapterArticles }) => (
            <section className={styles.chapterSection} key={chapter.id} aria-labelledby={`chapter-${chapter.id}`}>
              <div className={styles.chapterHeading}>
                <span className={styles.chapterNumber}>{String(chapter.number).padStart(2, '0')}</span>
                <div>
                  <h3 id={`chapter-${chapter.id}`}>{chapter.title}</h3>
                  <p>{chapter.summary}</p>
                </div>
                <span className={styles.chapterCount}>{chapterArticles.length}</span>
              </div>
              <div className={styles.articleGrid}>
                {chapterArticles.map((article) => (
                  <Link href={`/help/manual/${article.slug}`} className={styles.articleCard} key={article.slug}>
                    <span className={styles.articleMeta}>
                      Guide {chapter.number}.{article.order} <span aria-hidden="true">·</span> {article.readMinutes} min
                    </span>
                    <strong>{article.title}</strong>
                    <span className={styles.articleSummary}>{article.summary}</span>
                    <span className={styles.audienceList} aria-label={`For ${article.audiences.join(', ')}`}>
                      {article.audiences.map((role) => <span key={role}>{role}</span>)}
                    </span>
                    <span className={styles.cardArrow} aria-hidden="true">Read guide →</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <strong>No guides match those filters.</strong>
          <p>Try a broader term or reset the chapter and role.</p>
          <button type="button" onClick={clearFilters}>Clear filters</button>
        </div>
      )}
    </section>
  );
}
