'use client';

import React, { useState } from 'react';
import {
  TRADE_STARTER_CATALOGS,
  type TradeStarterCatalog,
} from '@/lib/trade-catalogs';

interface TradeCatalogHubProps {
  onLoadStarterPack: (formData: FormData) => Promise<void>;
  defaultOpen?: boolean;
}

export default function TradeCatalogHub({ onLoadStarterPack, defaultOpen = false }: TradeCatalogHubProps) {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);
  const [loadingTradeId, setLoadingTradeId] = useState<string | null>(null);

  const starterCatalogs: TradeStarterCatalog[] = Object.values(TRADE_STARTER_CATALOGS);
  const filteredCatalogs = starterCatalogs.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleLoad(e: React.FormEvent<HTMLFormElement>, tradeId: string) {
    e.preventDefault();
    setLoadingTradeId(tradeId);
    try {
      const formData = new FormData(e.currentTarget);
      await onLoadStarterPack(formData);
    } finally {
      setLoadingTradeId(null);
    }
  }

  return (
    <details
      className="panel workspace-section-card workspace-details"
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
      style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}
    >
      <summary className="workspace-details-summary">
        <span className="btn secondary">📦 Trade Starter Packs</span>
        <span className="workspace-details-copy">
          Load pre-built industry rates, descriptions, and margins for 21 trades into your price book.
        </span>
      </summary>

      <div style={{ marginTop: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text)' }}>
              Pre-Configured Trade Catalogs
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.825rem', color: 'var(--muted)' }}>
              Add trade services with realistic material costs, retail rates, and scope descriptions.
            </p>
          </div>
          <input
            type="text"
            placeholder="Search 21 trades (e.g. roofing, plumbing, HVAC)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #cbd5e1)',
              background: 'var(--surface-card, #ffffff)',
              color: 'var(--text)',
              minWidth: '260px',
              fontSize: '0.875rem',
            }}
          />
        </div>

        {filteredCatalogs.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '2rem 1rem' }}>
            No trade starter packs matching &ldquo;{searchQuery}&rdquo;.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {filteredCatalogs.map((cat) => {
              const isLoading = loadingTradeId === cat.id;
              return (
                <div
                  key={cat.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))',
                    borderRadius: '10px',
                    background: 'var(--surface-subtle, rgba(0, 0, 0, 0.02))',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '1.4rem' }}>{cat.icon}</span>
                      <strong style={{ fontSize: '1rem', color: 'var(--text)' }}>{cat.name}</strong>
                    </div>
                    <p style={{ fontSize: '0.825rem', color: 'var(--muted)', margin: 0, lineHeight: 1.4 }}>
                      {cat.description}
                    </p>
                    <div
                      style={{
                        marginTop: '0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text)',
                        background: 'var(--surface-card, #ffffff)',
                        padding: '0.4rem 0.6rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))',
                        lineHeight: 1.4,
                      }}
                    >
                      <strong style={{ color: 'var(--text)' }}>Sample Items:</strong>{' '}
                      <span style={{ color: 'var(--muted)' }}>
                        {cat.items.slice(0, 2).map((i) => i.name).join(', ')}…
                      </span>
                    </div>
                  </div>

                  <form onSubmit={(e) => handleLoad(e, cat.id)}>
                    <input type="hidden" name="tradeId" value={cat.id} />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="btn primary"
                      style={{ width: '100%', fontSize: '0.825rem' }}
                    >
                      {isLoading ? 'Loading…' : `+ Load ${cat.name} (${cat.items.length} Items)`}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
