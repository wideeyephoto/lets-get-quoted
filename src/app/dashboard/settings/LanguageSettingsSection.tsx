'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  SUPPORTED_LOCALES,
  localeCookieString,
  type Locale,
} from '@/lib/i18n';
import { updateLanguagePreferenceAction } from './actions';

type Props = {
  initialLocale: Locale;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function LanguageSettingsSection({ initialLocale }: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [save, setSave] = useState<SaveState>('idle');
  const [, startSaving] = useTransition();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  function choose(next: Locale) {
    if (next === locale) return;
    const previous = locale;
    setLocale(next);
    setSave('saving');
    document.cookie = localeCookieString(next);

    startSaving(async () => {
      try {
        await updateLanguagePreferenceAction(next);
        setSave('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 2400);
      } catch {
        setLocale(previous);
        document.cookie = localeCookieString(previous);
        setSave('error');
      }
    });
  }

  return (
    <section className="panel workspace-section-card" id="language">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Preferences</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <h2>Language &amp; Region</h2>
          {save === 'saving' && <span className="field-hint" style={{ margin: 0 }}>Saving…</span>}
          {save === 'saved' && <span className="field-hint" style={{ margin: 0, color: 'var(--success, #16a34a)' }}>Saved</span>}
          {save === 'error' && <span className="field-hint" style={{ margin: 0, color: 'var(--danger, #dc2626)' }}>Could not save</span>}
        </div>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1.25rem' }}>
        Select the primary language for your contractor dashboard, navigation, and workspace controls.
      </p>

      <div
        role="radiogroup"
        aria-label="Language selection"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {SUPPORTED_LOCALES.map((option) => {
          const isSelected = locale === option.code;
          return (
            <button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => choose(option.code)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textAlign: 'left',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius, 8px)',
                border: isSelected
                  ? '2px solid var(--accent, #0284c7)'
                  : '1px solid var(--border-color, rgba(128, 128, 128, 0.2))',
                background: isSelected
                  ? 'var(--accent-subtle, rgba(2, 132, 199, 0.08))'
                  : 'var(--card-bg, rgba(255, 255, 255, 0.02))',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-color, inherit)' }}>
                  {option.nativeName}
                </span>
                {isSelected && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent, #0284c7)' }}>
                    ✓
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #888)' }}>
                {option.label}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)', marginTop: '0.35rem', opacity: 0.8 }}>
                {option.regionHint}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
