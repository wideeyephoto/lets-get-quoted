'use client';

import { useState, useEffect, useTransition, type KeyboardEvent } from 'react';
import type { SiteServiceAreasContent } from '@/lib/site-content';
import { matchesServedCity } from '@/lib/service-area-match';
import {
  suggestNearbyCitiesAction,
  testIntakeLocationAction,
  type NearbyCityCandidate,
  type IntakeLocationTestResult,
} from './actions';
import styles from './SiteEditor.module.css';

const RADIUS_OPTIONS = [
  { value: 10, label: '10 miles' },
  { value: 15, label: '15 miles' },
  { value: 20, label: '20 miles' },
  { value: 25, label: '25 miles' },
  { value: 35, label: '35 miles' },
  { value: 50, label: '50 miles' },
];

type Props = {
  content: SiteServiceAreasContent;
  defaultZip?: string;
  defaultServiceArea?: string | null;
  onChange: (updated: SiteServiceAreasContent) => void;
};

export default function ServiceAreasField({
  content,
  defaultZip = '',
  defaultServiceArea = '',
  onChange,
}: Props) {
  const [baseLocation, setBaseLocation] = useState(
    content.baseZip || defaultZip || defaultServiceArea || '',
  );
  const [radius, setRadius] = useState<number>(content.radiusMiles || 35);
  const [candidatePool, setCandidatePool] = useState<NearbyCityCandidate[]>([]);
  const [dismissedCities, setDismissedCities] = useState<string[]>([]);
  const [isLoadingCandidates, startLoadingTransition] = useTransition();

  const [quickAddText, setQuickAddText] = useState('');
  const [testQuery, setTestQuery] = useState('');
  const [isTesting, startTestTransition] = useTransition();
  const [testResult, setTestResult] = useState<IntakeLocationTestResult | null>(null);

  const activeCities = (content.cities || []).map((c) => c.trim()).filter(Boolean);
  // A primitive signature keeps the effect stable across unrelated renders,
  // while still refreshing suggestions whenever the served-city list changes.
  const activeCitiesKey = JSON.stringify(activeCities);

  // Auto-fetch surrounding candidate cities whenever base location or radius changes
  useEffect(() => {
    const loc = baseLocation.trim() || defaultZip.trim() || defaultServiceArea?.trim() || '';
    if (!loc) return;
    const existingCities = JSON.parse(activeCitiesKey) as string[];

    const timer = setTimeout(() => {
      startLoadingTransition(async () => {
        try {
          const res = await suggestNearbyCitiesAction({
            baseLocation: loc,
            radiusMiles: radius,
            existingCities,
          });

          if (res.ok && res.candidates && res.candidates.length > 0) {
            setCandidatePool(res.candidates);
          } else if (res.ok && res.cities && res.cities.length > 0) {
            setCandidatePool(res.cities.map((c, i) => ({ name: c, miles: i * 2 + 1 })));
          }
        } catch {
          // background auto-suggest failure fallback
        }
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [baseLocation, radius, defaultZip, defaultServiceArea, activeCitiesKey]);

  // Compute the remaining candidates that haven't been added or dismissed
  const dismissedLowerSet = new Set(dismissedCities.map((c) => c.toLowerCase().trim()));
  const remainingCandidates = candidatePool.filter((candidate) => {
    const nameLower = candidate.name.toLowerCase().trim();
    if (dismissedLowerSet.has(nameLower)) return false;
    if (matchesServedCity(candidate.name, activeCities)) return false;
    if (typeof candidate.miles === 'number' && candidate.miles > radius) return false;
    return true;
  });

  // Always show exactly the top 3 unreviewed surrounding cities
  const next3Suggestions = remainingCandidates.slice(0, 3);

  function handleBaseLocationChange(val: string) {
    setBaseLocation(val);
    onChange({ ...content, baseZip: val });
  }

  function handleRadiusChange(val: number) {
    setRadius(val);
    onChange({ ...content, radiusMiles: val });
  }

  function addCity(city: string) {
    const clean = city.trim();
    if (!clean) return;
    if (matchesServedCity(clean, activeCities)) return;
    onChange({
      ...content,
      enabled: true,
      cities: [...activeCities, clean],
    });
  }

  function skipCity(city: string) {
    const clean = city.trim();
    if (!clean) return;
    setDismissedCities((prev) => [...prev, clean]);
  }

  function addAll3() {
    if (next3Suggestions.length === 0) return;
    const toAdd = next3Suggestions
      .map((c) => c.name.trim())
      .filter((name) => !matchesServedCity(name, activeCities));

    if (toAdd.length === 0) return;

    onChange({
      ...content,
      enabled: true,
      cities: [...activeCities, ...toAdd],
    });
  }

  function removeCity(index: number) {
    onChange({
      ...content,
      cities: activeCities.filter((_, idx) => idx !== index),
    });
  }

  function handleQuickAddCommit() {
    const raw = quickAddText.trim();
    if (!raw) return;

    const entries = raw
      .split(/[,\n]/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (entries.length === 0) return;

    const currentList = [...activeCities];
    const newItems: string[] = [];

    for (const item of entries) {
      if (!matchesServedCity(item, currentList) && !matchesServedCity(item, newItems)) {
        newItems.push(item);
      }
    }

    if (newItems.length > 0) {
      onChange({
        ...content,
        enabled: true,
        cities: [...currentList, ...newItems],
      });
    }
    setQuickAddText('');
  }

  function handleQuickAddKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuickAddCommit();
    }
  }

  function sortAlphabetical() {
    const sorted = [...activeCities].sort((a, b) => a.localeCompare(b));
    onChange({ ...content, cities: sorted });
  }

  function clearAllCities() {
    if (activeCities.length === 0) return;
    if (!window.confirm('Clear all cities from your service area list?')) return;
    onChange({ ...content, cities: [] });
  }

  function handleTestIntake() {
    const q = testQuery.trim();
    if (!q) return;

    startTestTransition(async () => {
      try {
        const res = await testIntakeLocationAction({
          testLocation: q,
          servedCities: activeCities,
        });
        setTestResult(res);
      } catch (err) {
        setTestResult({
          ok: false,
          matched: false,
          locationLabel: q,
          message: err instanceof Error ? err.message : 'Error testing location.',
        });
      }
    });
  }

  function handleAddTestedLocation(place: string) {
    addCity(place);
    if (testResult) {
      setTestResult({
        ...testResult,
        matched: true,
        message: `Added "${place}"! Homeowner quote requests and Smart Intake will now accept this location.`,
      });
    }
  }

  return (
    <div className={styles.serviceAreasBox}>
      <label className={styles.formField}>
        <span>Section title</span>
        <input
          value={content.title}
          onChange={(event) => onChange({ ...content, title: event.target.value })}
        />
      </label>

      <label className={styles.formField}>
        <span>Intro / Area description</span>
        <input
          id="bf-area-intro"
          value={content.intro}
          onChange={(event) => onChange({ ...content, intro: event.target.value })}
        />
        <small className={styles.fieldHint}>Also displayed as your service area text in the website footer.</small>
      </label>

      {/* Base Location & Radius Config */}
      <div className={styles.serviceAreaRadiusBar}>
        <label className={styles.formField} style={{ margin: 0 }}>
          <span style={{ fontSize: '0.76rem' }}>Base ZIP code or City</span>
          <input
            value={baseLocation}
            placeholder={defaultZip || 'e.g. 48067 or Royal Oak, MI'}
            onChange={(e) => handleBaseLocationChange(e.target.value)}
            style={{ minHeight: '38px', fontSize: '0.84rem' }}
          />
        </label>

        <label className={styles.formField} style={{ margin: 0 }}>
          <span style={{ fontSize: '0.76rem' }}>Service Radius</span>
          <select
            className={styles.serviceAreaRadiusSelect}
            value={radius}
            onChange={(e) => handleRadiusChange(Number(e.target.value))}
          >
            {RADIUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ alignSelf: 'center', fontSize: '0.74rem', color: 'var(--muted-2)', paddingTop: '1rem' }}>
          {isLoadingCandidates ? '✨ Updating nearby towns…' : `${candidatePool.length > 0 ? `${candidatePool.length} towns in cluster` : ''}`}
        </div>
      </div>

      {/* Dynamic Always-3 Surrounding Cities Pipeline */}
      {next3Suggestions.length > 0 ? (
        <div className={styles.always3Container}>
          <div className={styles.always3Header}>
            <div className={styles.always3TitleGroup}>
              <span aria-hidden="true">✨</span>
              <span>Surrounding towns to add ({remainingCandidates.length} remaining)</span>
            </div>
            <button
              type="button"
              className={styles.always3AddAllBtn}
              onClick={addAll3}
              title="Add all 3 visible suggestions"
            >
              + Add all 3
            </button>
          </div>

          <div className={styles.always3Grid}>
            {next3Suggestions.map((candidate) => (
              <div key={candidate.name} className={styles.always3Card}>
                <div className={styles.always3CardTop}>
                  <strong className={styles.always3CardName} title={candidate.name}>
                    {candidate.name}
                  </strong>
                  {typeof candidate.miles === 'number' && (
                    <span className={styles.always3Distance}>
                      {candidate.miles} mi
                    </span>
                  )}
                </div>

                <div className={styles.always3CardActions}>
                  <button
                    type="button"
                    className={styles.always3AddBtn}
                    onClick={() => addCity(candidate.name)}
                    title={`Add ${candidate.name} to active service area`}
                  >
                    + Add
                  </button>
                  <button
                    type="button"
                    className={styles.always3SkipBtn}
                    onClick={() => skipCity(candidate.name)}
                    title={`Skip ${candidate.name} (not served)`}
                  >
                    Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : candidatePool.length > 0 ? (
        <div className={styles.always3Completed}>
          <span>✓ You&apos;ve reviewed all surrounding towns within {radius} miles.</span>
          {dismissedCities.length > 0 && (
            <button
              type="button"
              className={styles.always3ResetBtn}
              onClick={() => setDismissedCities([])}
            >
              Reset {dismissedCities.length} skipped
            </button>
          )}
        </div>
      ) : null}

      {/* Active City Place Chips */}
      <div className={styles.cityChipsContainer}>
        <div className={styles.cityChipsHeader}>
          <strong style={{ fontSize: '0.86rem', color: 'var(--text)' }}>
            Active service locations ({activeCities.length})
          </strong>
          <div className={styles.cityChipsActions}>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', minHeight: '26px' }}
              onClick={sortAlphabetical}
              disabled={activeCities.length <= 1}
              title="Sort cities alphabetically"
            >
              Sort A–Z
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', minHeight: '26px' }}
              onClick={clearAllCities}
              disabled={activeCities.length === 0}
              title="Remove all cities"
            >
              Clear
            </button>
          </div>
        </div>

        <div className={styles.cityChipsGrid}>
          {activeCities.length === 0 ? (
            <p className={styles.fieldHint} style={{ margin: 'auto', fontStyle: 'italic' }}>
              No cities added yet. Click &ldquo;+ Add&rdquo; on surrounding towns above or enter one below.
            </p>
          ) : (
            activeCities.map((city, idx) => (
              <span key={`${idx}-${city}`} className={styles.cityChip}>
                <span>{city}</span>
                <button
                  type="button"
                  className={styles.cityChipRemove}
                  onClick={() => removeCity(idx)}
                  aria-label={`Remove ${city}`}
                  title={`Remove ${city}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>

        {/* Quick Add City Input (Supports comma-separated paste) */}
        <div className={styles.cityQuickAddRow}>
          <input
            className={styles.cityQuickAddInput}
            value={quickAddText}
            placeholder="Add town (e.g. Royal Oak, MI) — or paste comma-separated list..."
            onChange={(e) => setQuickAddText(e.target.value)}
            onKeyDown={handleQuickAddKeyDown}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={handleQuickAddCommit}
            disabled={!quickAddText.trim()}
            style={{ fontWeight: 700, minHeight: '38px' }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Live Homeowner Intake Coverage Tester */}
      <div className={styles.intakeTesterCard}>
        <div className={styles.intakeTesterHeader}>
          <span aria-hidden="true">🧪</span>
          <span>Live Homeowner Intake Coverage Tester</span>
        </div>
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          Test any town or ZIP code to verify whether your online quote forms, Smart Intake, and AI phone assistant will accept or flag the customer.
        </p>
        <div className={styles.intakeTesterInputGroup}>
          <input
            className={styles.intakeTesterInput}
            value={testQuery}
            placeholder="Enter test town or ZIP (e.g. 48073 or Clawson)..."
            onChange={(e) => {
              setTestQuery(e.target.value);
              if (testResult) setTestResult(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleTestIntake();
              }
            }}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={handleTestIntake}
            disabled={isTesting || !testQuery.trim()}
            style={{ minHeight: '36px', fontSize: '0.8rem', fontWeight: 700 }}
          >
            {isTesting ? 'Testing…' : 'Test Area'}
          </button>
        </div>

        {testResult && (
          <div>
            {testResult.matched ? (
              <div className={styles.intakeTestSuccess}>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>In Service Area</strong>
                  <p style={{ margin: '2px 0 0' }}>{testResult.message}</p>
                </div>
              </div>
            ) : (
              <div className={styles.intakeTestWarn}>
                <div>
                  <strong>Outside Service Area</strong>
                  <p style={{ margin: '2px 0 0' }}>{testResult.message}</p>
                </div>
                {testResult.resolvedPlace && (
                  <button
                    type="button"
                    className={styles.intakeTestQuickAdd}
                    onClick={() => handleAddTestedLocation(testResult.resolvedPlace!)}
                  >
                    + Add &ldquo;{testResult.resolvedPlace}&rdquo;
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* System Integration Info Cues */}
      <div className={styles.intakeTrustPillGroup}>
        <span className={styles.intakeTrustPill}>
          <span aria-hidden="true">📋</span> Powers Quote Form Validation
        </span>
        <span className={styles.intakeTrustPill}>
          <span aria-hidden="true">📞</span> Grounds AI Voice Receptionist
        </span>
        <span className={styles.intakeTrustPill}>
          <span aria-hidden="true">🔍</span> Injects Google Local SEO Keywords
        </span>
      </div>
    </div>
  );
}
