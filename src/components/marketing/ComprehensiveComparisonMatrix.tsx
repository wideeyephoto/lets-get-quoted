'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import {
  COMPARE_PLATFORMS,
  MATRIX_CATEGORIES,
  ALL_SERVICES_MATRIX,
  type PlatformKey,
  type MatrixRow,
  type MatrixCategory,
} from '@/app/compare/compare-data';
import styles from './comprehensive-comparison-matrix.module.css';

export default function ComprehensiveComparisonMatrix() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyAdvantages, setOnlyAdvantages] = useState<boolean>(false);

  // Filter rows based on category, search, and advantage toggle
  const filteredRows = useMemo(() => {
    return ALL_SERVICES_MATRIX.filter((row) => {
      // Category filter
      if (selectedCategory !== 'all' && row.category !== selectedCategory) {
        return false;
      }

      // Advantage toggle (LGQ has positive and at least one competitor has negative/neutral)
      if (onlyAdvantages) {
        const lgqCell = row.cells.lgq;
        const hasAdvantage =
          lgqCell.status === 'positive' &&
          (row.cells.jobber.status !== 'positive' ||
            row.cells.housecall.status !== 'positive' ||
            row.cells.servicetitan.status !== 'positive' ||
            row.cells.angi.status !== 'positive' ||
            row.cells.thumbtack.status !== 'positive');
        if (!hasAdvantage) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesFeature = row.feature.toLowerCase().includes(q);
        const matchesDesc = (row.description || '').toLowerCase().includes(q);
        const matchesValues = Object.values(row.cells).some(
          (cell) =>
            cell.value.toLowerCase().includes(q) ||
            (cell.subtext || '').toLowerCase().includes(q)
        );
        if (!matchesFeature && !matchesDesc && !matchesValues) {
          return false;
        }
      }

      return true;
    });
  }, [selectedCategory, searchQuery, onlyAdvantages]);

  // Group filtered rows by category for section headers
  const groupedRows = useMemo(() => {
    const groups: { category: MatrixCategory; rows: MatrixRow[] }[] = [];
    const categoryMap = new Map<string, MatrixCategory>();
    MATRIX_CATEGORIES.forEach((cat) => {
      if (cat.id !== 'all') categoryMap.set(cat.id, cat);
    });

    const categoryRowsMap = new Map<string, MatrixRow[]>();
    filteredRows.forEach((row) => {
      if (!categoryRowsMap.has(row.category)) {
        categoryRowsMap.set(row.category, []);
      }
      categoryRowsMap.get(row.category)!.push(row);
    });

    categoryMap.forEach((cat, catId) => {
      const rows = categoryRowsMap.get(catId);
      if (rows && rows.length > 0) {
        groups.push({ category: cat, rows });
      }
    });

    return groups;
  }, [filteredRows]);

  const renderStatusIcon = (status: 'positive' | 'neutral' | 'negative') => {
    if (status === 'positive') {
      return <span className={`${styles.statusIcon} ${styles.iconPositive}`}>✓</span>;
    }
    if (status === 'negative') {
      return <span className={`${styles.statusIcon} ${styles.iconNegative}`}>✕</span>;
    }
    return <span className={`${styles.statusIcon} ${styles.iconNeutral}`}>–</span>;
  };

  const getStatusClass = (status: 'positive' | 'neutral' | 'negative') => {
    if (status === 'positive') return styles.statusPositive;
    if (status === 'negative') return styles.statusNegative;
    return styles.statusNeutral;
  };

  return (
    <section className={styles.matrixSection} aria-label="Comprehensive platform comparison matrix">
      <div className={styles.headerWrap}>
        <span className={styles.kicker}>✦ Complete Feature-by-Feature Matrix</span>
        <h2 className={styles.title}>
          All contractor platforms. <em>Side-by-side.</em>
        </h2>
        <p className={styles.subtitle}>
          Compare features, hidden subscription costs, marketing capabilities, and operational tools across
          the entire contractor software landscape.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className={styles.controlsBar}>
        <div className={styles.categoryPills} role="tablist" aria-label="Comparison categories">
          {MATRIX_CATEGORIES.map((cat) => {
            const count =
              cat.id === 'all'
                ? ALL_SERVICES_MATRIX.length
                : ALL_SERVICES_MATRIX.filter((r) => r.category === cat.id).length;
            const isActive = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedCategory(cat.id)}
                className={`${styles.categoryPill} ${isActive ? styles.categoryPillActive : ''}`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className={styles.pillCount}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.searchAndFilter}>
          <div className={styles.searchBox}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search features (e.g. website, Stripe)..."
              className={styles.searchInput}
              aria-label="Search comparison features"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className={styles.searchClear}
                aria-label="Clear search query"
              >
                ×
              </button>
            )}
          </div>

          <label className={styles.toggleOnlyAdvantage}>
            <input
              type="checkbox"
              checked={onlyAdvantages}
              onChange={(e) => setOnlyAdvantages(e.target.checked)}
            />
            <span>LGQ Advantages Only</span>
          </label>
        </div>
      </div>

      {/* Comparison Table Container */}
      <div className={styles.tableContainer}>
        <div className={styles.mobileScrollHint} aria-hidden="true">
          <span>⟵ Scroll horizontally to compare all 6 services ⟶</span>
        </div>

        <div className={styles.tableScrollArea}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th className={styles.featureHeaderCol} scope="col">
                  <div className={styles.colHeaderTitle}>Features &amp; Capabilities</div>
                  <div className={styles.colHeaderDesc}>Y-Axis Feature Breakdown</div>
                </th>

                {COMPARE_PLATFORMS.map((platform) => {
                  if (platform.isFlagship) {
                    return (
                      <th key={platform.key} className={styles.lgqHeaderCol} scope="col">
                        <div className={styles.lgqCrownTag}>✦ Winner</div>
                        <div className={styles.lgqHeaderName}>{platform.name}</div>
                        <div className={styles.lgqHeaderBadge}>{platform.badge}</div>
                        <div className={styles.lgqHeaderPrice}>{platform.summaryPrice}</div>
                        <Link href={APP_SIGNUP_URL} className={styles.lgqHeaderCta}>
                          Start Free ($0/mo) →
                        </Link>
                      </th>
                    );
                  }

                  return (
                    <th key={platform.key} className={styles.compHeaderCol} scope="col">
                      <div className={styles.compHeaderName}>{platform.name}</div>
                      <div className={styles.compHeaderBadge}>{platform.badge}</div>
                      <div className={styles.compHeaderPrice}>{platform.summaryPrice}</div>
                      {platform.slug && (
                        <Link href={`/compare/${platform.slug}`} className={styles.compHeaderLink}>
                          Deep Dive →
                        </Link>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {groupedRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.emptyState}>
                      <h4>No matching features found</h4>
                      <p>Try clearing your search query or selecting another category.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategory('all');
                          setOnlyAdvantages(false);
                        }}
                        className={styles.resetBtn}
                      >
                        Reset All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                groupedRows.map((group) => (
                  <React.Fragment key={group.category.id}>
                    {/* Category Divider Header Row */}
                    <tr className={styles.categoryRow}>
                      <td colSpan={7}>
                        <div className={styles.categoryHeading}>
                          <span className={styles.categoryIcon}>{group.category.icon}</span>
                          <span>{group.category.label}</span>
                          <span className={styles.categoryDesc}>— {group.category.description}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Category Data Rows */}
                    {group.rows.map((row) => (
                      <tr key={row.id}>
                        {/* Feature Column (Sticky Y-Axis Label) */}
                        <td className={styles.featureCell} scope="row">
                          <div className={styles.featureName}>{row.feature}</div>
                          {row.description && (
                            <div className={styles.featureDesc}>{row.description}</div>
                          )}
                        </td>

                        {/* Platform Cells */}
                        {COMPARE_PLATFORMS.map((platform) => {
                          const cell = row.cells[platform.key as PlatformKey];
                          const isLgq = platform.isFlagship;

                          return (
                            <td
                              key={platform.key}
                              className={isLgq ? styles.lgqCell : styles.compCell}
                            >
                              <div className={styles.cellValueBox}>
                                <div
                                  className={`${styles.cellStatusRow} ${getStatusClass(cell.status)}`}
                                >
                                  {renderStatusIcon(cell.status)}
                                  <span>{cell.value}</span>
                                </div>
                                {cell.subtext && (
                                  <div className={styles.cellSubtext}>{cell.subtext}</div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Matrix Footer Action Bar */}
        <div className={styles.matrixFooter}>
          <div className={styles.footerNotes}>
            <strong>Transparent &amp; Fair Comparison:</strong> Pricing and feature data compiled from published
            competitor rate sheets, user agreements, and verified customer migrations as of 2026.
          </div>
          <div className={styles.footerActions}>
            <Link href={APP_SIGNUP_URL} className={styles.footerCtaPrimary}>
              Create Free Account ($0/mo) →
            </Link>
            <Link href="/pricing" className={styles.footerCtaSecondary}>
              See Detailed Pricing Plans →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
