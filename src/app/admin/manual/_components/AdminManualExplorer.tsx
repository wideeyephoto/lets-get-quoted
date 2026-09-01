'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ManualArticleSummary, ManualChapter } from '@/lib/admin-manual';
import { exportManualMarkdownAction } from '../actions';
import styles from '../manual.module.css';

interface AdminManualExplorerProps {
  chapters: ManualChapter[];
  summaries: ManualArticleSummary[];
}

const CATEGORY_PILLS = [
  { id: 'all', label: 'All Guides', icon: '📚' },
  { id: 'payments', label: 'Payments & Rails', icon: '💳' },
  { id: 'security', label: 'Security & MFA', icon: '🛡️' },
  { id: 'support', label: 'Support & Copilot', icon: '🤖' },
  { id: 'risk', label: 'Risk & Enforcement', icon: '⚖️' },
  { id: 'messaging', label: 'Messaging & TCPA', icon: '📱' },
  { id: 'operations', label: 'Platform Ops', icon: '⚙️' },
  { id: 'engineering', label: 'Engineering & Themes', icon: '🛠️' },
  { id: 'recovery', label: 'Disaster Recovery', icon: '🔄' },
];

const PINNED_RUNBOOK_SLUGS = [
  {
    slug: 'payment-investigation-reconciliation',
    title: 'Late-Success Payment Reconciler',
    meta: 'Stripe & Connect · Chapter 5',
    risk: 'production',
  },
  {
    slug: 'ai-operator-copilot-triage',
    title: 'AI Operator Blocker Triage',
    meta: 'Onboarding & KYC · Chapter 3',
    risk: 'general',
  },
  {
    slug: 'ad-budget-wallets-billing',
    title: 'Google Ads Auto-Refill Recovery',
    meta: 'Ad Wallets & CPC · Chapter 5',
    risk: 'production',
  },
  {
    slug: 'database-pooler-lock-triage',
    title: 'Postgres Pooler Exhaustion Triage',
    meta: 'Supabase SRE · Chapter 7',
    risk: 'production',
  },
  {
    slug: 'speed-to-lead-tcpa-compliance',
    title: 'TCPA Quiet Hours & Morning Queue',
    meta: 'State Mini-TCPA · Chapter 6',
    risk: 'general',
  },
];

export default function AdminManualExplorer({ chapters, summaries }: AdminManualExplorerProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState('all');
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isExporting, setIsExporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
      const matchesPermission = item.requiredPermission
        ? item.requiredPermission.toLowerCase().includes(q)
        : false;

      return (
        matchesTitle ||
        matchesSummary ||
        matchesChapter ||
        matchesKeywords ||
        matchesRoutes ||
        matchesPermission
      );
    });
  }, [summaries, query, selectedChapter, selectedRisk]);

  const isFiltered = query.trim().length > 0 || selectedChapter !== 'all' || selectedRisk !== 'all';

  // Global Keyboard Shortcuts: '/' focus, 'Escape' blur/clear, 'j'/'k' navigation, 'Enter' open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (e.key === 'Escape') {
        setQuery('');
        setSelectedIndex(-1);
        searchInputRef.current?.blur();
        return;
      }

      if (!isInput) {
        if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
          e.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        } else if (e.key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((idx) => {
            const max = filteredSummaries.length - 1;
            return idx < max ? idx + 1 : 0;
          });
        } else if (e.key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((idx) => {
            const max = filteredSummaries.length - 1;
            return idx > 0 ? idx - 1 : max;
          });
        } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < filteredSummaries.length) {
          e.preventDefault();
          const target = filteredSummaries[selectedIndex];
          if (target) {
            router.push(`/admin/manual/${target.slug}`);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredSummaries, selectedIndex, router]);

  // Offline Markdown Bundle Download
  const handleExportOfflineBundle = async () => {
    setIsExporting(true);
    const res = await exportManualMarkdownAction();
    setIsExporting(false);

    if (res.success && res.markdown) {
      const blob = new Blob([res.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `letsgetquoted-operations-manual-${new Date().toISOString().split('T')[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className={styles.explorer}>
      {/* Pinned Quick & Emergency Runbooks */}
      {!isFiltered && (
        <section className={styles.pinnedSection} aria-label="Pinned Emergency Runbooks">
          <div className={styles.pinnedHeader}>
            <span>⚡ Frequently Accessed & Incident Runbooks</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleExportOfflineBundle}
                disabled={isExporting}
                className={styles.offlineExportBtn}
                title="Download single-file markdown manual for air-gapped disaster recovery"
              >
                {isExporting ? 'Exporting...' : '💾 Export Offline Bundle'}
              </button>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>1-Click Triage</span>
            </div>
          </div>
          <div className={styles.pinnedGrid}>
            {PINNED_RUNBOOK_SLUGS.map((pinned) => (
              <Link
                key={pinned.slug}
                href={`/admin/manual/${pinned.slug}`}
                className={styles.pinnedCard}
              >
                <span className={styles.pinnedCardTitle}>{pinned.title}</span>
                <span className={styles.pinnedCardMeta}>{pinned.meta}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Category Filter Pills */}
      <div className={styles.categoryPillList} role="tablist" aria-label="Category quick filter">
        {CATEGORY_PILLS.map((pill) => {
          const isActive = selectedChapter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              className={`${styles.categoryPill} ${isActive ? styles.categoryPillActive : ''}`}
              onClick={() => {
                setSelectedChapter(pill.id);
                setSelectedIndex(-1);
              }}
            >
              <span>{pill.icon}</span>
              <span>{pill.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Search Bar */}
      <div className={styles.searchBar}>
        <div className={styles.searchInputWrapper}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search tasks, error codes (6240, 53300, 429), routes (/admin/*), or permissions..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(-1);
            }}
            className={styles.searchInput}
            aria-label="Search manual articles"
          />
          <div className={styles.searchActions}>
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedIndex(-1);
                }}
                className={styles.clearSearchBtn}
                title="Clear search"
              >
                ✕
              </button>
            ) : (
              <kbd className={styles.shortcutBadge}>/</kbd>
            )}
          </div>
        </div>

        <select
          value={selectedChapter}
          onChange={(e) => {
            setSelectedChapter(e.target.value);
            setSelectedIndex(-1);
          }}
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
          onChange={(e) => {
            setSelectedRisk(e.target.value);
            setSelectedIndex(-1);
          }}
          className={styles.filterSelect}
          aria-label="Filter by risk level"
        >
          <option value="all">All Risk Levels</option>
          <option value="general">General (Standard / Read-Only)</option>
          <option value="production">Production Impact / Sensitive</option>
        </select>
      </div>

      {/* Results View */}
      {isFiltered ? (
        <div className={styles.chapterSection}>
          <div className={styles.chapterHeader}>
            <div>
              <h2 className={styles.chapterTitle}>Search & Filtered Results</h2>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Use <kbd className={styles.keyKbd}>j</kbd>/<kbd className={styles.keyKbd}>k</kbd> to cycle, <kbd className={styles.keyKbd}>Enter</kbd> to open
              </span>
            </div>
            <span className={styles.chapterMeta}>
              Found {filteredSummaries.length} permitted guide
              {filteredSummaries.length === 1 ? '' : 's'}
            </span>
          </div>

          {filteredSummaries.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '1rem 0' }}>
              No operating guides matched &quot;{query}&quot;. Check spelling or clear filters.
            </p>
          ) : (
            <div className={styles.articleGrid}>
              {filteredSummaries.map((art, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <Link
                    key={art.slug}
                    href={`/admin/manual/${art.slug}`}
                    className={`${styles.articleCard} ${isSelected ? styles.articleCardSelected : ''}`}
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
                      <span>{art.chapterTitle}</span>
                      <span>Owner: {art.owner}</span>
                    </div>
                  </Link>
                );
              })}
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
                <span className={styles.chapterMeta}>
                  {chapter.articles.length} guides · Owner: {chapter.owner}
                </span>
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
