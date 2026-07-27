'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';

// The fictional business each template's live demo (/themes/[id]) is branded as,
// so the picker names a trade next to each look. Keyed by template id.
const DEMO_BRANDS: Record<string, { brand: string; trade: string }> = {
  carbon: { brand: 'Timberline Tree & Land', trade: 'Tree & land services' },
  professional: { brand: 'Emerald Edge Lawn & Landscape', trade: 'Lawn & landscape' },
  modern: { brand: 'Apex Roofing Co.', trade: 'Roofing' },
  handy: { brand: 'Neighborly Home Repair', trade: 'Handyman services' },
  coat: { brand: 'TrueCoat Painting Co.', trade: 'Painting' },
  fixit: { brand: 'Mainline Plumbing', trade: 'Plumbing' },
  reno: { brand: 'Blueprint Remodeling', trade: 'Kitchen & bath remodel' },
  shine: { brand: 'Lustre Exterior Cleaning', trade: 'Exterior cleaning' },
};

function hostFor(brand: string): string {
  const slug = brand.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').slice(0, 22);
  return `${slug}.letsgetquoted.com`;
}

// The demo's Website page: a live template gallery. Each look is one of the real
// mockup sites we built (/themes/[id]), rendered live in a framed browser so a
// prospect can flip between them and see the actual output — not a screenshot.
export default function DemoSitesPage() {
  const templates = AVAILABLE_TEMPLATES.filter((template) => DEMO_BRANDS[template.id]);
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? 'carbon');
  const current = templates.find((template) => template.id === selectedId) ?? templates[0];
  const demo = DEMO_BRANDS[selectedId];

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
        <div className="template-chip-row" role="tablist" aria-label="Website templates">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              role="tab"
              aria-selected={template.id === selectedId}
              className={`template-chip${template.id === selectedId ? ' active' : ''}`}
              onClick={() => setSelectedId(template.id)}
              style={{ '--chip-accent': template.accent } as CSSProperties}
            >
              <span className="template-chip-name">{template.name}</span>
              <span className="template-chip-trade">{DEMO_BRANDS[template.id].trade}</span>
            </button>
          ))}
        </div>

        {current ? (
          <p className="template-preview-caption">
            <strong>{current.name}</strong> — {current.description}. Shown as <strong>{demo.brand}</strong>.
          </p>
        ) : null}

        <div className="template-preview-frame">
          <div className="template-preview-bar">
            <span className="template-preview-dots" aria-hidden="true"><i /><i /><i /></span>
            <span className="template-preview-url">{demo ? hostFor(demo.brand) : ''}</span>
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
