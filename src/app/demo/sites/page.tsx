'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { COLOR_SCHEMES } from '@/lib/site-content';
import ThemeIcon from '@/app/dashboard/sites/ThemeIcon';
import themeStyles from '@/app/dashboard/sites/SiteEditor.module.css';
import DemoVideoStudio from './DemoVideoStudio';

// Preset accent swatches — mirrors the website builder's palette so the demo
// customizer feels identical to the real thing.
const ACCENT_PRESETS = [
  '#2563eb', '#0d9488', '#059669', '#65a30d', '#f59e0b', '#ea580c',
  '#dc2626', '#e11d48', '#7c3aed', '#4f46e5', '#475569', '#1f2937',
];

// Each theme's native demo accent (mirrors THEME_DEMOS in /themes/[template]),
// so switching themes starts the accent from a color that already looks right.
const DEFAULT_ACCENTS: Record<string, string> = {
  carbon: '#5aa469', professional: '#2f9e5c', modern: '#2f6fd0', handy: '#10b0b8',
  coat: '#4a5fd0', fixit: '#1a9dd4', reno: '#b8843a', shine: '#12b3c2',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export default function DemoSitesPage() {
  const templates = AVAILABLE_TEMPLATES;
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? 'carbon');
  const [scheme, setScheme] = useState('');
  const [accent, setAccent] = useState(DEFAULT_ACCENTS[templates[0]?.id ?? 'carbon'] ?? '#ff7a21');
  // The iframe reloads on this; debounced so dragging the color picker doesn't
  // reload on every frame.
  const [appliedAccent, setAppliedAccent] = useState(accent);

  useEffect(() => {
    if (!HEX.test(accent)) return;
    const t = setTimeout(() => setAppliedAccent(accent), 260);
    return () => clearTimeout(t);
  }, [accent]);

  const current = templates.find((template) => template.id === selectedId) ?? templates[0];
  const previewHost = current ? `${current.name.toLowerCase()}.letsgetquoted.com` : 'preview.letsgetquoted.com';
  const previewSrc = `/themes/${selectedId}?scheme=${encodeURIComponent(scheme)}&accent=${encodeURIComponent(appliedAccent)}`;

  function pickTheme(id: string) {
    const nextAccent = DEFAULT_ACCENTS[id] ?? '#ff7a21';
    setSelectedId(id);
    setScheme('');
    setAccent(nextAccent);
    setAppliedAccent(nextAccent);
  }
  function pickAccent(hex: string) {
    setAccent(hex);
    setAppliedAccent(hex);
  }

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero workspace-hero-solo panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Website</p>
          <h1 className="workspace-title">Make it yours &mdash; live</h1>
          <p className="workspace-lead">
            Pick a template, switch the color scheme, and tap an accent color. The real site preview below updates
            instantly &mdash; this is exactly how fast it is to brand your own site in the builder.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card demo-builder">
        <div className="demo-builder-controls">
          <div className={themeStyles.cardGroupLabel}>Theme</div>
          <div className={`${themeStyles.themeGrid} demo-theme-grid`} role="tablist" aria-label="Website templates">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                role="tab"
                aria-selected={template.id === selectedId}
                className={`${themeStyles.themeOption}${template.id === selectedId ? ` ${themeStyles.selectedTheme}` : ''}`}
                onClick={() => pickTheme(template.id)}
              >
                <ThemeIcon name={template.name} accent={template.accent} fontVar={template.fontVar} abbr={template.abbr} />
                <span className={themeStyles.themeOptionInfo}><strong>{template.name}</strong></span>
              </button>
            ))}
          </div>

          <div className={themeStyles.cardGroupLabel}>Color scheme</div>
          <div className={themeStyles.schemeSwatches} role="group" aria-label="Full color schemes">
            <button
              type="button"
              className={`${themeStyles.schemeSwatch}${!scheme ? ` ${themeStyles.schemeSwatchActive}` : ''}`}
              onClick={() => setScheme('')}
              aria-pressed={!scheme}
            >
              <span className={themeStyles.schemeChip} style={{ background: 'linear-gradient(135deg, #3b4250 0 50%, #e9ebef 50% 100%)' }} />
              <small>Theme default</small>
            </button>
            {COLOR_SCHEMES.map((s) => {
              const selected = scheme === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  className={`${themeStyles.schemeSwatch}${selected ? ` ${themeStyles.schemeSwatchActive}` : ''}`}
                  onClick={() => setScheme(s.key)}
                  title={s.label}
                  aria-label={`${s.label}${selected ? ' (selected)' : ''}`}
                  aria-pressed={selected}
                >
                  <span className={themeStyles.schemeChip} style={{ background: `linear-gradient(135deg, ${s.bg} 0 38%, ${s.deep} 38% 66%, ${s.accent} 66% 100%)` }} />
                  <small>{s.label.split(' — ')[0]}</small>
                </button>
              );
            })}
          </div>

          <div className={themeStyles.cardGroupLabel}>Accent color</div>
          <div className={themeStyles.colorControl}>
            <input type="color" value={HEX.test(accent) ? accent : '#000000'} onChange={(event) => setAccent(event.target.value)} aria-label="Accent color picker" />
            <input value={accent} onChange={(event) => setAccent(event.target.value)} aria-label="Accent color hex" />
          </div>
          <div className={themeStyles.accentSwatches} role="group" aria-label="Preset accent colors">
            {ACCENT_PRESETS.map((hex) => {
              const selected = accent.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  className={`${themeStyles.accentSwatch}${selected ? ` ${themeStyles.accentSwatchActive}` : ''}`}
                  style={{ background: hex }}
                  onClick={() => pickAccent(hex)}
                  title={hex}
                  aria-label={`Accent ${hex}${selected ? ' (selected)' : ''}`}
                  aria-pressed={selected}
                />
              );
            })}
          </div>

          <div className="template-preview-cta demo-builder-cta">
            <p>Changed it in seconds? That&apos;s the builder. Create a free account to make it your own and publish.</p>
            <Link href="/login" className="btn primary">Create free account</Link>
          </div>
        </div>

        <div className="demo-builder-preview">
          <div className="template-preview-frame demo-builder-frame">
            <div className="template-preview-bar">
              <span className="template-preview-dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="template-preview-url">{previewHost}</span>
            </div>
            <iframe
              key={`${selectedId}-${scheme}-${appliedAccent}`}
              src={previewSrc}
              title={`${current?.name ?? 'Template'} live preview`}
              className="template-preview-iframe"
              loading="lazy"
            />
          </div>
          {current ? (
            <p className="template-preview-caption">
              <strong>{current.name}</strong> — {current.description}.
            </p>
          ) : null}
        </div>
      </section>

      {/* Under the customizer, because it is the next thing you would do:
          the colours make it yours, the video makes it convincing. */}
      <DemoVideoStudio />
    </main>
  );
}
