'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormCategory, FormTemplate, TradeSpecialization } from '@/lib/forms/types';
import styles from '@/components/forms/forms.module.css';

const CATEGORY_TABS: Array<{ id: FormCategory | 'all'; label: string; icon: string }> = [
  { id: 'all', label: 'All Templates', icon: '📁' },
  { id: 'inspection', label: 'Inspections', icon: '🔍' },
  { id: 'commissioning', label: 'Commissioning', icon: '⚡' },
  { id: 'qa', label: 'QA Checklists', icon: '✅' },
  { id: 'completion_certificate', label: 'Completion Certificates', icon: '📜' },
  { id: 'safety', label: 'Safety & JHA', icon: '🦺' },
];

export default function FormsHubClient({
  initialTemplates,
  initialCategory,
  initialTrade,
  cloneAction,
  deleteAction,
  installPresetAction,
}: {
  initialTemplates: FormTemplate[];
  initialCategory?: FormCategory;
  initialTrade?: TradeSpecialization;
  cloneAction: (id: string) => Promise<{ success: boolean; id?: string; error?: string }>;
  deleteAction: (id: string) => Promise<{ success: boolean; error?: string }>;
  installPresetAction: (id: string) => Promise<{ success: boolean; id?: string; error?: string }>;
}) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<FormCategory | 'all'>(initialCategory || 'all');
  const [selectedTrade, setSelectedTrade] = useState<TradeSpecialization | 'all'>(initialTrade || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pending, startTransition] = useTransition();

  const filteredTemplates = initialTemplates.filter((t) => {
    if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
    if (selectedTrade !== 'all' && t.trade !== 'all' && t.trade !== selectedTrade) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    return true;
  });

  const presetCount = initialTemplates.filter((t) => t.isPreset).length;
  const customCount = initialTemplates.filter((t) => !t.isPreset).length;

  return (
    <main className={`wide-shell workspace-shell ${styles.container}`}>
      <div className={styles.backLinkRow}>
        <Link
          href="/dashboard/settings#forms"
          className={styles.backLink}
        >
          &larr; Back to Business settings
        </Link>
      </div>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <p className="eyebrow" style={{ margin: '0 0 0.35rem' }}>Field Operations &amp; Quality</p>
          <h1>
            <span>📋</span> Field Forms, QA &amp; Completion Certificates
          </h1>
          <p className={styles.headerDesc}>
            Build conditional field forms for diagnostics, equipment commissioning, safety audits, and customer completion certificates with digital signatures.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link href="/dashboard/forms/builder" className="btn primary">
            + New Form Template
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Library</span>
          <p className={styles.statValue}>{initialTemplates.length} Templates</p>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statLabel} ${styles.statLabelPreset}`}>Trade Presets</span>
          <p className={`${styles.statValue} ${styles.statValuePreset}`}>{presetCount} Ready to Use</p>
        </div>
        <div className={styles.statCard}>
          <span className={`${styles.statLabel} ${styles.statLabelCustom}`}>Customized Forms</span>
          <p className={`${styles.statValue} ${styles.statValueCustom}`}>{customCount} Active</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className={styles.filterBar}>
        <div className={styles.categoryPills}>
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`${styles.pill} ${selectedCategory === tab.id ? styles.pillActive : ''}`}
              onClick={() => setSelectedCategory(tab.id)}
            >
              <span>{tab.icon}</span> <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className={styles.filterControls}>
          <input
            type="text"
            placeholder="Search forms..."
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            aria-label="Filter by trade"
            className={styles.selectTrade}
            value={selectedTrade}
            onChange={(e) => setSelectedTrade(e.target.value as TradeSpecialization | 'all')}
          >
            <option value="all">All Trades</option>
            <option value="hvac">HVAC</option>
            <option value="electrical">Electrical</option>
            <option value="plumbing">Plumbing</option>
            <option value="roofing">Roofing</option>
            <option value="general">General Contracting</option>
            <option value="painting">Painting</option>
            <option value="solar">Solar PV</option>
            <option value="carpentry">Carpentry</option>
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      <div className={styles.grid}>
        {filteredTemplates.map((template) => {
          const totalFields = template.sections.reduce((sum, s) => sum + s.fields.length, 0);

          return (
            <div key={template.id} className={styles.card}>
              <div>
                <div className={styles.cardHead}>
                  <span className={`${styles.badge} ${template.isPreset ? styles.badgePreset : styles.badgeCustom}`}>
                    {template.isPreset ? 'Industry Preset' : 'Custom Form'}
                  </span>
                  <span className={`${styles.badge} ${styles.badgeCategory}`}>
                    {template.trade !== 'all' ? `${template.trade.toUpperCase()} · ` : ''}
                    {template.category.replace('_', ' ')}
                  </span>
                </div>

                <h3 className={styles.cardTitle}>{template.title}</h3>
                <p className={styles.cardDesc}>{template.description}</p>
              </div>

              <div className={styles.cardMeta}>
                <span>📑 {template.sections.length} Section{template.sections.length === 1 ? '' : 's'}</span>
                <span>📌 {totalFields} Field{totalFields === 1 ? '' : 's'}</span>
                {template.requireCustomerSignature && <span>✍️ Client Sign-off</span>}
                {template.requireTechSignature && <span>👷 Tech Sign-off</span>}
              </div>

              <div className={styles.cardFooter}>
                {template.isPreset ? (
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ flex: 1, fontSize: '0.82rem' }}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await installPresetAction(template.id);
                        if (res.success && res.id) {
                          router.push(`/dashboard/forms/${res.id}`);
                        }
                      });
                    }}
                  >
                    🛠️ Customize in Builder
                  </button>
                ) : (
                  <>
                    <Link
                      href={`/dashboard/forms/${template.id}`}
                      className="btn primary"
                      style={{ flex: 1, textAlign: 'center', fontSize: '0.82rem' }}
                    >
                      ✏️ Edit Form
                    </Link>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: '0.82rem' }}
                      title="Clone Template"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await cloneAction(template.id);
                          if (res.success && res.id) {
                            router.push(`/dashboard/forms/${res.id}`);
                          }
                        });
                      }}
                    >
                      📑 Clone
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ color: 'var(--bad, #ef4444)', fontSize: '0.82rem' }}
                      title="Archive Template"
                      onClick={() => {
                        if (confirm(`Are you sure you want to archive "${template.title}"?`)) {
                          startTransition(async () => {
                            await deleteAction(template.id);
                            router.refresh();
                          });
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {filteredTemplates.length === 0 && (
          <div className={styles.emptyState}>
            <p>No form templates match your current filter.</p>
          </div>
        )}
      </div>
    </main>
  );
}
