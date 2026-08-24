'use client';

import { useState, type FormEvent } from 'react';
import { matchesServedCity } from '@/lib/service-area-match';
import styles from './themes.module.css';

type SiteServiceAreaMatcherProps = {
  cities: string[];
  serviceArea?: string | null;
  companyName?: string | null;
};

export default function SiteServiceAreaMatcher({
  cities,
  serviceArea,
  companyName,
}: SiteServiceAreaMatcherProps) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{
    checked: boolean;
    matched: boolean;
    location: string;
  }>({ checked: false, matched: false, location: '' });

  const allCities = (cities || []).filter(Boolean);
  const rawServiceArea = (serviceArea || '').trim();

  const handleCheck = (e: FormEvent) => {
    e.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    // Check direct matches against city list
    const cityMatch = matchesServedCity(cleanQuery, allCities);

    // Also check partial word matches or mention in general serviceArea text
    const textMatch =
      rawServiceArea.length > 0 &&
      cleanQuery.length >= 3 &&
      rawServiceArea.toLowerCase().includes(cleanQuery.toLowerCase());

    const isMatch = cityMatch || textMatch;

    setResult({
      checked: true,
      matched: isMatch,
      location: cleanQuery,
    });
  };

  const reset = () => {
    setQuery('');
    setResult({ checked: false, matched: false, location: '' });
  };

  if (allCities.length === 0 && !rawServiceArea) {
    return null;
  }

  const primaryCities = allCities.slice(0, 4).join(', ');

  return (
    <div className={styles.serviceMatcherBox} data-reveal>
      <div className={styles.serviceMatcherHeader}>
        <div className={styles.serviceMatcherIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div>
          <h3 className={styles.serviceMatcherTitle}>Check service availability</h3>
          <p className={styles.serviceMatcherSubtitle}>Enter your city or ZIP to verify coverage in your neighborhood</p>
        </div>
      </div>

      <form className={styles.serviceMatcherForm} onSubmit={handleCheck}>
        <div className={styles.serviceMatcherInputGroup}>
          <input
            type="text"
            className={styles.serviceMatcherInput}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (result.checked) setResult({ checked: false, matched: false, location: '' });
            }}
            placeholder="e.g. Royal Oak, 48067, or your town..."
            aria-label="Enter your town or ZIP code"
            maxLength={60}
          />
          <button type="submit" className={styles.serviceMatcherBtn}>
            Check Area
          </button>
        </div>
      </form>

      {result.checked && (
        <div
          className={`${styles.serviceMatcherResult} ${
            result.matched ? styles.serviceMatcherSuccess : styles.serviceMatcherInfo
          }`}
          role="status"
          aria-live="polite"
        >
          {result.matched ? (
            <div className={styles.serviceMatcherResultInner}>
              <span className={styles.serviceMatcherBadge} aria-hidden="true">✓ Covered</span>
              <p>
                <strong>Great news!</strong> {companyName || 'Our team'} provides full service in{' '}
                <span className={styles.serviceMatcherHighlight}>{result.location}</span>.
              </p>
              <a href="#quote" className={styles.serviceMatcherCta}>
                Get Instant Quote →
              </a>
            </div>
          ) : (
            <div className={styles.serviceMatcherResultInner}>
              <span className={styles.serviceMatcherBadgeInfo} aria-hidden="true">ℹ Proximity Area</span>
              <p>
                We primarily serve <strong>{primaryCities || 'our local area'}</strong>. Depending on the job scope, we frequently take on projects in nearby communities.
              </p>
              <div className={styles.serviceMatcherActions}>
                <a href="#quote" className={styles.serviceMatcherCtaOutline}>
                  Request Estimate
                </a>
                <button type="button" className={styles.serviceMatcherReset} onClick={reset}>
                  Check another location
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
