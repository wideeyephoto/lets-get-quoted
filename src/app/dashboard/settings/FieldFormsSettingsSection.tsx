'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { FormCategory, FormTemplate } from '@/lib/forms/types';

const CATEGORY_TABS: Array<{ id: FormCategory | 'all'; label: string; icon: string }> = [
  { id: 'all', label: 'All Templates', icon: '📁' },
  { id: 'inspection', label: 'Inspections', icon: '🔍' },
  { id: 'commissioning', label: 'Commissioning', icon: '⚡' },
  { id: 'qa', label: 'QA Checklists', icon: '✅' },
  { id: 'completion_certificate', label: 'Certificates', icon: '📜' },
  { id: 'safety', label: 'Safety & JHA', icon: '🦺' },
];

export default function FieldFormsSettingsSection({
  templates,
}: {
  templates: FormTemplate[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<FormCategory | 'all'>('all');

  const presetCount = templates.filter((t) => t.isPreset).length;
  const customCount = templates.filter((t) => !t.isPreset).length;

  const filteredTemplates = templates.filter((t) => {
    if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
    return true;
  });

  return (
    <section className="panel workspace-section-card" id="forms" style={{ marginTop: '1.5rem' }}>
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Trust &amp; Quality</p>
        <h2>Field forms, checklists &amp; QA</h2>
      </div>

      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        Standardized inspection checklists, equipment commissioning forms, safety audits (JHA), and customer completion certificates. Attached directly to job records and signed by your crew or homeowners in the field.
      </p>

      {/* Stats summary banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
            background: 'var(--surface-card, rgba(255,255,255,0.02))',
          }}
        >
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--mute-t55, #94a3b8)', fontWeight: 600 }}>Total Library</span>
          <p style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-primary, currentColor)' }}>{templates.length} Forms</p>
        </div>
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
            background: 'var(--surface-card, rgba(255,255,255,0.02))',
          }}
        >
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cedge-sky, #0284c7)', fontWeight: 600 }}>Trade Presets</span>
          <p style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--cedge-sky, #0284c7)' }}>{presetCount} Ready</p>
        </div>
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
            background: 'var(--surface-card, rgba(255,255,255,0.02))',
          }}
        >
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cedge-purple, #a855f7)', fontWeight: 600 }}>Customized</span>
          <p style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 700, color: 'var(--cedge-purple, #a855f7)' }}>{customCount} Active</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="workspace-inline-row" style={{ marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link href="/dashboard/forms/builder" className="btn primary" style={{ fontSize: '0.85rem' }}>
          + New form template
        </Link>
        <Link href="/dashboard/forms" className="btn secondary" style={{ fontSize: '0.85rem' }}>
          Open full forms manager &rarr;
        </Link>
      </div>

      {/* Category filter pills */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
          marginBottom: '1rem',
        }}
      >
        {CATEGORY_TABS.map((tab) => {
          const isActive = selectedCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '0.3rem 0.65rem',
                borderRadius: '999px',
                border: '1px solid',
                borderColor: isActive ? 'var(--cedge-orange-78, #ea580c)' : 'var(--border-default, rgba(255,255,255,0.1))',
                background: isActive ? 'rgba(234, 88, 12, 0.12)' : 'transparent',
                color: isActive ? 'var(--cedge-orange-78, #ea580c)' : 'var(--mute-t55, #94a3b8)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Template list */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '0.75rem',
        }}
      >
        {filteredTemplates.slice(0, 6).map((t) => {
          const totalFields = t.sections.reduce((sum, s) => sum + s.fields.length, 0);

          return (
            <div
              key={t.id}
              style={{
                border: '1px solid var(--border-default, rgba(255,255,255,0.08))',
                borderRadius: '8px',
                padding: '0.9rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: 'var(--surface-secondary, rgba(255,255,255,0.015))',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      background: t.isPreset ? 'rgba(2, 132, 199, 0.12)' : 'rgba(168, 85, 247, 0.12)',
                      color: t.isPreset ? '#0284c7' : '#a855f7',
                    }}
                  >
                    {t.isPreset ? 'Preset' : 'Custom'}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--mute-t55, #94a3b8)', textTransform: 'capitalize' }}>
                    {t.trade !== 'all' ? `${t.trade} · ` : ''}{t.category.replace('_', ' ')}
                  </span>
                </div>

                <h4 style={{ margin: '0.25rem 0 0.35rem', fontSize: '0.92rem', fontWeight: 600, color: 'var(--ink-primary, currentColor)' }}>
                  {t.title}
                </h4>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--mute-t55, #94a3b8)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.description}
                </p>
              </div>

              <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.05))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--mute-t55, #94a3b8)' }}>
                <span>{totalFields} items {t.requireCustomerSignature ? '· ✍️ E-Sign' : ''}</span>
                <Link
                  href={`/dashboard/forms/${t.id}`}
                  style={{
                    color: 'var(--cedge-orange-78, #ea580c)',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  {t.isPreset ? 'Customize &rarr;' : 'Edit &rarr;'}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTemplates.length > 6 && (
        <div style={{ marginTop: '0.85rem', textAlign: 'center' }}>
          <Link
            href="/dashboard/forms"
            style={{
              fontSize: '0.82rem',
              color: 'var(--cedge-orange-78, #ea580c)',
              fontWeight: 600,
              textDecoration: 'underline',
            }}
          >
            View all {filteredTemplates.length} templates in forms manager &rarr;
          </Link>
        </div>
      )}
    </section>
  );
}
