'use client';

import React, { useState, useMemo } from 'react';
import type { PortalDocument, PortalJob } from '@/lib/client-portal';
import { InViewTracker } from './InViewTracker';

interface DocumentVaultProps {
  documents: PortalDocument[];
  jobs: PortalJob[];
}

function formatDay(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

export function DocumentVault({ documents, jobs }: DocumentVaultProps) {
  const [activeKind, setActiveKind] = useState<string>('all');
  const [activeJob, setActiveJob] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDocs = useMemo(() => {
    let result = documents;

    if (activeKind !== 'all') {
      result = result.filter(doc => doc.kind === activeKind);
    }

    if (activeJob !== 'all') {
      result = result.filter(doc => doc.jobRef === activeJob);
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(doc => 
        (doc.title && doc.title.toLowerCase().includes(q)) ||
        (doc.jobScope && doc.jobScope.toLowerCase().includes(q)) ||
        (doc.kindLabel && doc.kindLabel.toLowerCase().includes(q))
      );
    }

    result = [...result].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });

    return result;
  }, [documents, activeKind, activeJob, sortOrder, searchQuery]);

  const uniqueJobRefs = useMemo(() => {
    const refs = new Set<string>();
    for (const doc of documents) {
      if (doc.jobRef) refs.add(doc.jobRef);
    }
    return Array.from(refs);
  }, [documents]);

  if (documents.length === 0) {
    return null;
  }

  return (
    <section className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading compact-heading">
        <InViewTracker payload={{ step: 'portal_section_viewed', sectionName: 'vault' }} />
        <p className="eyebrow">Document & Media Vault</p>
        <h2>Project records, proof & certificates</h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
        {/* Filters Top Bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', justifyContent: 'space-between', alignItems: 'center' }}>
          
          {/* Kind Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {[
              { id: 'all', label: 'All' },
              { id: 'invoice', label: 'Invoices' },
              { id: 'receipt', label: 'Receipts' },
              { id: 'warranty', label: 'Warranties' },
              { id: 'photo/proof', label: 'Photos' },
              { id: 'change_order', label: 'Change Orders' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveKind(tab.id)}
                className={`btn ${activeKind === tab.id ? 'primary' : 'secondary'}`}
                style={{ 
                  padding: '0.3rem 0.75rem', 
                  fontSize: '0.8rem', 
                  borderRadius: '6px',
                  background: activeKind === tab.id ? 'var(--ink-base, #0f172a)' : 'var(--surface-color, #fff)',
                  color: activeKind === tab.id ? '#fff' : 'inherit',
                  border: activeKind === tab.id ? '1px solid var(--ink-base, #0f172a)' : '1px solid var(--edge-t16, #cbd5e1)'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right Controls */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--edge-t16, #cbd5e1)',
                background: 'var(--surface-color, #fff)',
                color: 'var(--ink-base, #000)'
              }}
            />
            <select
              value={activeJob}
              onChange={(e) => setActiveJob(e.target.value)}
              style={{
                padding: '0.35rem 0.6rem',
                fontSize: '0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--edge-t16, #cbd5e1)',
                background: 'var(--surface-color, #fff)',
                color: 'var(--ink-base, #000)'
              }}
            >
              <option value="all">All projects</option>
              {uniqueJobRefs.map(ref => (
                <option key={ref} value={ref}>{ref}</option>
              ))}
            </select>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
              style={{
                padding: '0.35rem 0.6rem',
                fontSize: '0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--edge-t16, #cbd5e1)',
                background: 'var(--surface-color, #fff)',
                color: 'var(--ink-base, #000)'
              }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
        </div>

        {/* Document Grid */}
        {filteredDocs.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.8rem' }}>
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: '10px',
                  border: '1px solid var(--edge-t16, #cbd5e1)',
                  background: 'var(--surface-color, #ffffff)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mute-t50, #64748b)', fontWeight: 600 }}>
                      {doc.kindLabel}
                    </span>
                    {doc.badge ? (
                      <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'var(--surface-subtle, #f1f5f9)', color: 'var(--ink-base, #334155)', fontWeight: 600 }}>
                        {doc.badge}
                      </span>
                    ) : null}
                  </div>
                  <strong style={{ fontSize: '0.88rem', display: 'block', lineHeight: 1.35 }}>
                    {doc.title}
                  </strong>
                  {doc.jobScope || doc.jobRef ? (
                    <span style={{ fontSize: '0.78rem', color: 'var(--mute-t50, #64748b)' }}>
                      {doc.jobScope || doc.jobRef}
                    </span>
                  ) : null}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--mute-t50, #64748b)' }}>{formatDay(doc.createdAt)}</span>
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target={doc.url.startsWith('http') ? '_blank' : undefined}
                      rel="noreferrer"
                      className="btn secondary"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }}
                    >
                      📄 View
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-color, #ffffff)', border: '1px solid var(--edge-t16, #cbd5e1)', borderRadius: '10px', color: 'var(--mute-t50, #64748b)' }}>
            No documents match your filters.
          </div>
        )}
      </div>
    </section>
  );
}
