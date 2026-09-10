'use client';

import React from 'react';
import { Check } from 'lucide-react';
import {
  type SupportedCardQuantity,
  SUPPORTED_CARD_QUANTITIES,
  resolveCardPackPlan,
  CARD_RETAIL_SUBTOTAL_CENTS,
  centsToDollars,
} from '@/lib/merchandise/card-catalog-types';

interface CardQuantityPickerProps {
  selectedQuantity: SupportedCardQuantity;
  onChange: (quantity: SupportedCardQuantity) => void;
}

export default function CardQuantityPicker({
  selectedQuantity,
  onChange,
}: CardQuantityPickerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text)' }}>Select Quantity</label>
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Uncoated Mohawk Paper</span>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.65rem' }}
        role="radiogroup"
        aria-label="Business card quantity"
      >
        {SUPPORTED_CARD_QUANTITIES.filter((q) => q <= 250).map((qty) => {
          const isSelected = selectedQuantity === qty;
          const totalDollars = centsToDollars(CARD_RETAIL_SUBTOTAL_CENTS[qty]);
          const unitPrice = (totalDollars / qty).toFixed(2);
          const packPlan = resolveCardPackPlan(qty);

          return (
            <button
              key={qty}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(qty)}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                padding: '0.85rem',
                borderRadius: '12px',
                border: isSelected ? '2px solid var(--accent)' : '1px solid var(--line)',
                background: isSelected ? 'rgba(var(--tint), 0.08)' : 'var(--bg-3)',
                color: 'var(--text)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {qty === 100 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-0.5rem',
                    right: '0.5rem',
                    background: 'var(--accent)',
                    color: 'var(--on-accent)',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    padding: '0.12rem 0.45rem',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Recommended
                </span>
              )}
              {qty === 250 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-0.5rem',
                    right: '0.5rem',
                    background: 'var(--good, #3dd68c)',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    padding: '0.12rem 0.45rem',
                    borderRadius: '999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Best Value
                </span>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text)' }}>{qty} Cards</span>
                {isSelected && <Check size={16} style={{ color: 'var(--accent)' }} />}
              </div>

              <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text)' }}>${totalDollars.toFixed(2)}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>(${unitPrice}/ea)</span>
              </div>

              <span style={{ marginTop: '0.2rem', fontSize: '0.68rem', color: 'var(--muted-2)' }}>
                {packPlan?.packs.map((p) => `${p.packCount}×${p.packSize}pk`).join(' + ')}
              </span>
            </button>
          );
        })}
      </div>

      {/* 500 Cards Option */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.25rem' }}>
        <button
          type="button"
          onClick={() => onChange(selectedQuantity === 500 ? 100 : 500)}
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: selectedQuantity === 500 ? 'var(--accent)' : 'var(--muted)',
            transition: 'color 0.15s ease',
          }}
        >
          {selectedQuantity === 500
            ? '✓ Selected 500 cards ($129.00 — $0.26/ea volume tier)'
            : 'Need 500 cards for a larger crew? ($129.00 — $0.26/ea)'}
        </button>
      </div>
    </div>
  );
}
