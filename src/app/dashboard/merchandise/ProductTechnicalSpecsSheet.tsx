'use client';

import { useState } from 'react';
import type { MerchandiseProduct } from '@/lib/merchandise/types';
import { ChevronDown, ChevronUp, ShieldCheck, Award, Sparkles, CheckCircle } from 'lucide-react';

interface Props {
  product: MerchandiseProduct;
  businessName: string;
  activeColorName: string;
  onDownloadProof: () => void;
}

export default function ProductTechnicalSpecsSheet({
  product,
  businessName,
  activeColorName,
  onDownloadProof,
}: Props) {
  const [showDetailedSpecs, setShowDetailedSpecs] = useState(false);

  const isBizCards = product.id === 'biz_cards';

  return (
    <div
      style={{
        marginTop: '1.25rem',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(11, 15, 23, 0.65)',
        backdropFilter: 'blur(10px)',
        padding: '1rem 1.25rem',
      }}
    >
      {/* 4 Commercial Confidence Badges */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ color: 'var(--gold-ink)', marginTop: '2px' }}>
            <Award size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.78rem', color: '#ffffff', display: 'block' }}>
              {isBizCards ? '16pt / 350 GSM Stock' : '2-Part Carbonless NCR'}
            </strong>
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
              {isBizCards ? 'Ultra-dense multi-ply cardstock' : 'White top sheet + yellow client duplicate'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ color: '#38bdf8', marginTop: '2px' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.78rem', color: '#ffffff', display: 'block' }}>
              {isBizCards ? 'Velvet Soft-Touch & Spot-UV' : 'Wrap-Around Writing Shield'}
            </strong>
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
              {isBizCards ? 'Scuff-resistant tactile finish' : 'Heavy cardstock cover prevents bleed-through'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ color: '#22c55e', marginTop: '2px' }}>
            <CheckCircle size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.78rem', color: '#ffffff', display: 'block' }}>
              Dynamic Booking QR
            </strong>
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
              Directs smartphone cameras to your quote page
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ color: '#a855f7', marginTop: '2px' }}>
            <ShieldCheck size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.78rem', color: '#ffffff', display: 'block' }}>
              100% Reprint Guarantee
            </strong>
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
              Exact match to your approved proof
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Detailed Specs Toggle */}
      <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => setShowDetailedSpecs((prev) => !prev)}
          className="focus-ring"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '0.72rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: 0,
          }}
        >
          <span>{showDetailedSpecs ? 'Hide' : 'View'} Engineering &amp; Production Specs</span>
          {showDetailedSpecs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>
          Domestic USA Manufacturing • 2–3 Day Turnaround
        </span>
      </div>

      {/* Collapsible Deep Specs Table */}
      {showDetailedSpecs && (
        <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.74rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <span style={{ color: 'var(--gold-ink)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.68rem', display: 'block', marginBottom: '4px' }}>
                Material Anatomy
              </span>
              <div style={{ color: 'var(--text)', lineHeight: 1.4 }}>
                {isBizCards ? (
                  <>
                    <div><strong>Grade:</strong> 16pt / 350 GSM Solid Bleached Sulfate</div>
                    <div><strong>Dimensions:</strong> Standard 3.5&quot; × 2.0&quot; US Trade Cut</div>
                    <div><strong>Lamination:</strong> Peach-skin velvet soft-touch barrier</div>
                  </>
                ) : (
                  <>
                    <div><strong>Structure:</strong> 2-Part NCR (White Original / Canary Duplicate)</div>
                    <div><strong>Dimensions:</strong> Standard 8.5&quot; × 5.5&quot; Half-Letter</div>
                    <div><strong>Binding:</strong> Heavy leatherette glued spine + perforation</div>
                  </>
                )}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <span style={{ color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.68rem', display: 'block', marginBottom: '4px' }}>
                Print Physics &amp; QC
              </span>
              <div style={{ color: 'var(--text)', lineHeight: 1.4 }}>
                <div><strong>Print Engine:</strong> Heidelberg 4-Color Offset Litho</div>
                <div><strong>Resolution:</strong> 2400 × 2400 DPI true raster screening</div>
                <div><strong>Tolerance:</strong> ±0.015&quot; laser optical registration cut</div>
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.65rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <span style={{ color: '#86efac', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.68rem', display: 'block', marginBottom: '4px' }}>
                Field Durability
              </span>
              <div style={{ color: 'var(--text)', lineHeight: 1.4 }}>
                <div><strong>Rigidity:</strong> Will not crease or soften in pockets</div>
                <div><strong>Moisture:</strong> Water-resistant lamination repels rain/coffee</div>
                <div><strong>Ink:</strong> Lightfast UV soy inks resist dashboard fading</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
