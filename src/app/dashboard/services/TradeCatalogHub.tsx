'use client';

import React, { useState } from 'react';
import {
  TRADE_STARTER_CATALOGS,
  MASTER_TRADE_SKUS,
  GOOD_BETTER_BEST_ASSEMBLIES,
  calculateMultiTierProposal,
  generateTradeSafetyAndToolManifest,
  generateTradeScopeContract,
  type TradeStarterCatalog,
  type MultiTierProposalResult,
} from '@/lib/trade-catalogs';

interface TradeCatalogHubProps {
  onLoadStarterPack: (formData: FormData) => Promise<void>;
}

export default function TradeCatalogHub({ onLoadStarterPack }: TradeCatalogHubProps) {
  const [activeTab, setActiveTab] = useState<'starter_packs' | 'estimator_calculator' | 'sku_catalog'>('starter_packs');
  const [selectedTrade, setSelectedTrade] = useState<string>('roofing');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Estimator Calculator State
  const [calcUnits, setCalcUnits] = useState<number>(25); // e.g. 25 squares or 2500 sqft
  const [calcPitch, setCalcPitch] = useState<number>(1.15);
  const [calcLaborRate, setCalcLaborRate] = useState<number>(75);
  const [calcRegion, setCalcRegion] = useState<string>('national_baseline');
  const [calcWaste, setCalcWaste] = useState<number>(10);

  const starterCatalogs = Object.values(TRADE_STARTER_CATALOGS);
  const filteredCatalogs = starterCatalogs.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSkus = MASTER_TRADE_SKUS.filter((sku) =>
    sku.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sku.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sku.tradeId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const proposalResult: MultiTierProposalResult = calculateMultiTierProposal({
    tradeId: selectedTrade,
    dimensionUnits: calcUnits,
    hourlyLaborRate: calcLaborRate,
    stateOrRegion: calcRegion,
    wasteFactorPct: calcWaste,
    pitchMultiplier: calcPitch,
  });

  const safetyManifest = generateTradeSafetyAndToolManifest(selectedTrade);
  const scopeContract = generateTradeScopeContract(selectedTrade, 'better');

  return (
    <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
      {/* Navigation Pill Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle, #e2e8f0)', paddingBottom: '0.75rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('starter_packs')}
          className={`btn ${activeTab === 'starter_packs' ? 'primary' : 'secondary'}`}
          style={{ fontSize: '0.875rem' }}
        >
          📦 21 Trade Starter Packs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('estimator_calculator')}
          className={`btn ${activeTab === 'estimator_calculator' ? 'primary' : 'secondary'}`}
          style={{ fontSize: '0.875rem' }}
        >
          📐 Good / Better / Best Estimator
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sku_catalog')}
          className={`btn ${activeTab === 'sku_catalog' ? 'primary' : 'secondary'}`}
          style={{ fontSize: '0.875rem' }}
        >
          🔍 Distributor Master SKUs
        </button>
      </div>

      {/* Tab 1: Starter Packs */}
      {activeTab === 'starter_packs' && (
        <section className="panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Pre-Configured Trade Price Books</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
                1-tap load industry rates, labor allowances, and profit margins into your live price book.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search trades (e.g. roofing, plumbing, solar)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                minWidth: '260px',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {filteredCatalogs.map((cat) => (
              <div
                key={cat.id}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--border-subtle, #e2e8f0)',
                  borderRadius: '10px',
                  background: 'var(--surface-subtle, #f8fafc)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '1.4rem' }}>{cat.icon}</span>
                    <strong style={{ fontSize: '1rem' }}>{cat.name}</strong>
                  </div>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted, #64748b)', margin: 0, lineHeight: 1.4 }}>
                    {cat.description}
                  </p>
                  <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: '#475569', background: '#fff', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <strong>Sample Items:</strong> {cat.items.slice(0, 2).map((i) => i.name).join(', ')}…
                  </div>
                </div>

                <form action={onLoadStarterPack}>
                  <input type="hidden" name="tradeId" value={cat.id} />
                  <button type="submit" className="btn primary" style={{ width: '100%', fontSize: '0.825rem' }}>
                    Load {cat.name} ({cat.items.length} Items)
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tab 2: Good / Better / Best Estimator Assembly */}
      {activeTab === 'estimator_calculator' && (
        <section className="panel" style={{ padding: '1.25rem' }}>
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Dynamic Multi-Tier Proposal Generator</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
              Enter dimensions and job specs to instantly compute 3-tiered customer quote options with exact margins and scope language.
            </p>
          </div>

          {/* Controls Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              background: 'var(--surface-subtle, #f8fafc)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle, #e2e8f0)',
              marginBottom: '1.5rem',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Select Trade Assembly
              </label>
              <select
                value={selectedTrade}
                onChange={(e) => setSelectedTrade(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                {Object.keys(GOOD_BETTER_BEST_ASSEMBLIES).map((tId) => (
                  <option key={tId} value={tId}>
                    {GOOD_BETTER_BEST_ASSEMBLIES[tId].name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Dimension Quantity (Sq Ft / Squares)
              </label>
              <input
                type="number"
                value={calcUnits}
                onChange={(e) => setCalcUnits(Math.max(1, Number(e.target.value)))}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Pitch / Complexity Multiplier
              </label>
              <select
                value={calcPitch}
                onChange={(e) => setCalcPitch(Number(e.target.value))}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value={1.0}>Flat / Walkable (1.00x)</option>
                <option value={1.15}>Medium Pitch 4:12 - 7:12 (1.15x)</option>
                <option value={1.30}>Steep Pitch 8:12 - 10:12 (1.30x)</option>
                <option value={1.45}>Mansard / Complex 12:12+ (1.45x)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Regional Cost Index
              </label>
              <select
                value={calcRegion}
                onChange={(e) => setCalcRegion(e.target.value)}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="national_baseline">National Baseline (1.00x)</option>
                <option value="northeast_metro">Northeast Metro (NY/NJ/MA) · +28% Labor</option>
                <option value="west_coast">West Coast Metro (CA/WA/OR) · +32% Labor</option>
                <option value="midwest">Midwest / Great Lakes (OH/IL/MI) · -4% Labor</option>
                <option value="south_southeast">Southeast / Sunbelt (TX/FL/GA) · -8% Labor</option>
                <option value="mountain_west">Mountain West (CO/UT/AZ) · +5% Labor</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                Labor Rate ($/hr)
              </label>
              <input
                type="number"
                value={calcLaborRate}
                onChange={(e) => setCalcLaborRate(Math.max(20, Number(e.target.value)))}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>
          </div>

          {/* 3 Tier Proposals Comparison Card Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {(['good', 'better', 'best'] as const).map((tierKey) => {
              const tier = proposalResult.tiers[tierKey];
              const isPopular = tierKey === 'better';
              return (
                <div
                  key={tierKey}
                  style={{
                    border: isPopular ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    background: isPopular ? '#eff6ff' : '#ffffff',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  {isPopular && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#2563eb',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 10px',
                        borderRadius: '20px',
                        letterSpacing: '0.05em',
                      }}
                    >
                      ★ MOST POPULAR
                    </div>
                  )}

                  <div>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontWeight: 700 }}>
                      {tier.tierTitle}
                    </span>
                    <h4 style={{ margin: '0.35rem 0 0.5rem 0', fontSize: '1.15rem' }}>{tier.packageName}</h4>
                    <p style={{ fontSize: '0.825rem', color: '#475569', lineHeight: 1.4, margin: '0 0 1rem 0' }}>
                      {tier.description}
                    </p>

                    <div style={{ background: '#fff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
                        ${tier.financials.recommendedRetailPrice.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                        Estimated Profit: <strong>${tier.financials.grossProfit.toLocaleString()}</strong> ({tier.financials.grossMarginPct}% Margin)
                      </div>
                    </div>

                    <div style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                      <strong style={{ display: 'block', marginBottom: '0.35rem', color: '#334155' }}>Key Specifications:</strong>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#475569', lineHeight: 1.5 }}>
                        {tier.features.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                    <div>Est. Labor: <strong>{tier.quantities.laborHours} Man-Hours</strong></div>
                    <div>Material Cost: <strong>${tier.financials.adjustedMaterialCost.toLocaleString()}</strong></div>
                    <div>Warranty: <strong>{tier.warrantyYears} Years Protection</strong></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scope Protections & Safety Manifest */}
          <div style={{ marginTop: '1.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#0f172a' }}>🛡️ Contract Scope Exclusions</h5>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.775rem', color: '#475569', lineHeight: 1.4 }}>
                {scopeContract.standardExclusions.map((ex, i) => (
                  <li key={i}>{ex}</li>
                ))}
              </ul>
            </div>
            <div>
              <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#0f172a' }}>🧰 Crew Safety & Tool Checklist</h5>
              <div style={{ fontSize: '0.775rem', color: '#475569', lineHeight: 1.4 }}>
                <div><strong>PPE:</strong> {safetyManifest.ppeRequirements.join(', ')}</div>
                <div style={{ marginTop: '0.35rem' }}><strong>Safety:</strong> {safetyManifest.safetyEquipment.join(', ')}</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tab 3: Distributor SKU Master */}
      {activeTab === 'sku_catalog' && (
        <section className="panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Master Supply Chain SKU Cross-Reference</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted, #64748b)' }}>
                Pre-mapped distributor part numbers for direct API PO dispatch to ABC Supply, Beacon, Ferguson, and Home Depot Pro.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search SKUs or part numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #cbd5e1)',
                minWidth: '240px',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                  <th style={{ padding: '0.6rem' }}>SKU / MPN</th>
                  <th style={{ padding: '0.6rem' }}>Item Description</th>
                  <th style={{ padding: '0.6rem' }}>Trade</th>
                  <th style={{ padding: '0.6rem' }}>Distributors</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ padding: '0.6rem', textAlign: 'right' }}>Labor Allowance</th>
                </tr>
              </thead>
              <tbody>
                {filteredSkus.map((sku) => (
                  <tr key={sku.sku} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '0.6rem', fontFamily: 'monospace', fontWeight: 600 }}>
                      {sku.sku}
                      <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 400 }}>MPN: {sku.mpn}</div>
                    </td>
                    <td style={{ padding: '0.6rem' }}>
                      <strong>{sku.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {Object.entries(sku.specifications).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem', textTransform: 'capitalize' }}>{sku.tradeId}</td>
                    <td style={{ padding: '0.6rem' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {sku.distributors.map((d) => (
                          <span
                            key={d}
                            style={{
                              background: '#e0f2fe',
                              color: '#0369a1',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {d.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem', textAlign: 'right', fontWeight: 700 }}>
                      ${sku.unitCost.toFixed(2)} / {sku.unit}
                    </td>
                    <td style={{ padding: '0.6rem', textAlign: 'right' }}>
                      {sku.laborHoursPerUnit} hrs / {sku.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
