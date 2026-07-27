'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import ThemeIcon from '@/app/dashboard/sites/ThemeIcon';
import themeStyles from '@/app/dashboard/sites/SiteEditor.module.css';

// The demo's Website page: a live template gallery. Each look is one of the real
// mockup sites we built (/themes/[id]), rendered live in a framed browser so a
// prospect can flip between them and see the actual output — not a screenshot.
// Templates are shown as looks, not tied to any one trade.
export default function DemoSitesPage() {
  const templates = AVAILABLE_TEMPLATES;
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? 'carbon');
  const current = templates.find((template) => template.id === selectedId) ?? templates[0];
  const previewHost = current ? `${current.name.toLowerCase()}.letsgetquoted.com` : 'preview.letsgetquoted.com';

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero workspace-hero-solo panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Website</p>
          <h1 className="workspace-title">Pick a template — preview it live</h1>
          <p className="workspace-lead">
            Every plan includes a hosted, quote-ready website. Choose a look below to see a real example site
            render live, then build and publish your own in minutes — no code required.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card demo-template-picker">
        <div className={themeStyles.themeGrid} role="tablist" aria-label="Website templates">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              role="tab"
              aria-selected={template.id === selectedId}
              className={`${themeStyles.themeOption}${template.id === selectedId ? ` ${themeStyles.selectedTheme}` : ''}`}
              onClick={() => setSelectedId(template.id)}
            >
              <ThemeIcon name={template.name} accent={template.accent} fontVar={template.fontVar} abbr={template.abbr} />
              <span className={themeStyles.themeOptionInfo}><strong>{template.name}</strong></span>
            </button>
          ))}
        </div>

        {current ? (
          <p className="template-preview-caption">
            <strong>{current.name}</strong> — {current.description}.
          </p>
        ) : null}

        <div className="template-preview-frame">
          <div className="template-preview-bar">
            <span className="template-preview-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="template-preview-url">{previewHost}</span>
          </div>
          <iframe
            key={selectedId}
            src={`/themes/${selectedId}`}
            title={`${current?.name ?? 'Template'} live preview`}
            className="template-preview-iframe"
            loading="lazy"
          />
        </div>

        <div className="template-preview-cta">
          <p>This demo is read-only. Create a free account to build, brand, and publish your own site.</p>
          <Link href="/login" className="btn primary">Create free account</Link>
        </div>
      </section>
    </main>
  );
}
