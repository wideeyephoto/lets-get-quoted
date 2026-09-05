'use client';

import React from 'react';
import type { BusinessCardTemplateId } from '@/lib/merchandise/types';

export interface BusinessCardMockupProps {
  templateId?: BusinessCardTemplateId;
  side: 'front' | 'back';
  activeColor: { id: string; name: string; hex: string; darkText?: boolean };
  accentColor: string;
  secondaryColor?: string;
  businessName: string;
  tagline?: string;
  phone?: string;
  website?: string;
  license?: string;
  includeQrCode?: boolean;
  renderBranding: (mode?: 'color' | 'dark' | 'white', scale?: number) => React.ReactNode;
  glareX?: number;
  showBleedGuides?: boolean;
  customStyle?: React.CSSProperties;
  scale?: number;
}

/**
 * Realistic vector QR code visual with authentic corner finder marks.
 */
function CardQrVisual({
  size = 72,
  accentColor,
  label = 'SCAN TO BOOK',
  sublabel = 'INSTANT',
}: {
  size?: number;
  accentColor: string;
  label?: string;
  sublabel?: string;
}) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: '#0f172a',
        borderRadius: '8px',
        border: `1.5px solid ${accentColor || 'rgba(255, 255, 255, 0.2)'}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
        boxSizing: 'border-box',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 3 Corner Finder Patterns */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 48 48"
        style={{ position: 'absolute', inset: 0, padding: '4px', boxSizing: 'border-box' }}
      >
        {/* Top-Left Finder */}
        <rect x="2" y="2" width="14" height="14" fill="none" stroke="#ffffff" strokeWidth="2.5" rx="1.5" />
        <rect x="5.5" y="5.5" width="7" height="7" fill={accentColor || '#38bdf8'} rx="1" />
        {/* Top-Right Finder */}
        <rect x="32" y="2" width="14" height="14" fill="none" stroke="#ffffff" strokeWidth="2.5" rx="1.5" />
        <rect x="35.5" y="5.5" width="7" height="7" fill={accentColor || '#38bdf8'} rx="1" />
        {/* Bottom-Left Finder */}
        <rect x="2" y="32" width="14" height="14" fill="none" stroke="#ffffff" strokeWidth="2.5" rx="1.5" />
        <rect x="5.5" y="35.5" width="7" height="7" fill={accentColor || '#38bdf8'} rx="1" />

        {/* Data Matrix Dots */}
        <rect x="20" y="4" width="3" height="3" fill="#ffffff" />
        <rect x="25" y="4" width="3" height="3" fill="#ffffff" />
        <rect x="20" y="9" width="3" height="3" fill="#ffffff" />
        <rect x="4" y="20" width="3" height="3" fill="#ffffff" />
        <rect x="4" y="25" width="3" height="3" fill="#ffffff" />
        <rect x="9" y="20" width="3" height="3" fill="#ffffff" />
        <rect x="20" y="20" width="8" height="8" fill={accentColor || '#38bdf8'} rx="1" />
        <rect x="34" y="22" width="3" height="3" fill="#ffffff" />
        <rect x="38" y="26" width="3" height="3" fill="#ffffff" />
        <rect x="22" y="34" width="3" height="3" fill="#ffffff" />
        <rect x="26" y="38" width="3" height="3" fill="#ffffff" />
        <rect x="34" y="34" width="4" height="4" fill="#ffffff" />
        <rect x="40" y="40" width="4" height="4" fill="#ffffff" />
      </svg>
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'rgba(15, 23, 42, 0.72)',
          borderRadius: '4px',
          backdropFilter: 'blur(1px)',
        }}
      >
        <span style={{ fontSize: '0.52rem', fontWeight: 900, letterSpacing: '0.04em', textAlign: 'center' }}>
          {label}
        </span>
        <span style={{ fontSize: '0.46rem', color: accentColor || '#38bdf8', fontWeight: 800 }}>
          {sublabel}
        </span>
      </div>
    </div>
  );
}

/**
 * 0.125" Bleed, Trim Line, and Safe Zone Overlays
 */
function BleedGuides() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 20,
        boxSizing: 'border-box',
      }}
    >
      {/* Outer Bleed Margin (0.125" / ~6px outside trim) */}
      <div
        style={{
          position: 'absolute',
          inset: '2px',
          border: '1.5px dashed #ef4444',
          borderRadius: '10px',
        }}
      />
      {/* Trim Cut Line */}
      <div
        style={{
          position: 'absolute',
          inset: '10px',
          border: '1.5px solid #06b6d4',
          borderRadius: '7px',
        }}
      />
      {/* Safe Zone Inset (where critical copy/logos reside) */}
      <div
        style={{
          position: 'absolute',
          inset: '18px',
          border: '1.5px dashed #22c55e',
          borderRadius: '5px',
        }}
      />
      {/* Corner Crop Marks */}
      <div style={{ position: 'absolute', top: '10px', left: '10px', width: '10px', height: '10px', borderTop: '2px solid #06b6d4', borderLeft: '2px solid #06b6d4' }} />
      <div style={{ position: 'absolute', top: '10px', right: '10px', width: '10px', height: '10px', borderTop: '2px solid #06b6d4', borderRight: '2px solid #06b6d4' }} />
      <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '10px', height: '10px', borderBottom: '2px solid #06b6d4', borderLeft: '2px solid #06b6d4' }} />
      <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '10px', height: '10px', borderBottom: '2px solid #06b6d4', borderRight: '2px solid #06b6d4' }} />

      {/* Guide Legend Tag */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.94)',
          color: '#ffffff',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.62rem',
          fontWeight: 800,
          whiteSpace: 'nowrap',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <span style={{ color: '#ef4444' }}>■ Bleed (0.125&quot;)</span>
        <span style={{ color: '#06b6d4' }}>■ Trim Line</span>
        <span style={{ color: '#22c55e' }}>■ Safe Zone</span>
      </div>
    </div>
  );
}

export default function BusinessCardMockup({
  templateId = 'executive',
  side,
  activeColor,
  accentColor,
  secondaryColor,
  businessName,
  tagline = 'Commercial & Residential Contractor',
  phone = '(555) 019-2834',
  website = 'buildpro.contractor',
  license = 'LIC# ROC-389142',
  includeQrCode = true,
  renderBranding,
  glareX = 50,
  showBleedGuides = false,
  customStyle = {},
  scale = 1,
}: BusinessCardMockupProps) {
  const cardW = 370;
  const cardH = 215;

  const baseContainerStyle: React.CSSProperties = {
    width: `${cardW}px`,
    height: `${cardH}px`,
    borderRadius: '12px',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '1.4rem',
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: 'center center',
    transition: 'box-shadow 0.2s ease, transform 0.3s ease',
    ...customStyle,
  };

  // Spot UV Gleam overlay
  const spotUvGleam = (
    <div
      style={{
        position: 'absolute',
        top: '-50%',
        left: `${glareX - 25}%`,
        width: '60px',
        height: '200%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)',
        transform: 'rotate(25deg)',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  );

  // =========================================================================
  // 1. THE EXECUTIVE TRADESMAN
  // =========================================================================
  if (templateId === 'executive') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: activeColor.hex,
            color: activeColor.darkText ? '#0f172a' : '#ffffff',
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15), 0 4px 0 0 ${accentColor}`,
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: accentColor }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.1)' }} />
          {spotUvGleam}

          <div style={{ position: 'relative', zIndex: 2 }}>
            {renderBranding(activeColor.darkText ? 'color' : 'white', 0.88)}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2 }}>
            <div>
              <strong style={{ fontSize: '0.96rem', display: 'block', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                {businessName}
              </strong>
              <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 600 }}>{tagline}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.06em', color: accentColor }}>
                {license}
              </span>
              <span style={{ display: 'block', fontSize: '0.62rem', opacity: 0.7, fontWeight: 700 }}>
                16PT VELVET SOFT-TOUCH
              </span>
            </div>
          </div>
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // Executive Back
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1, 0 4px 0 0 #94a3b8',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '1.05rem', color: '#0f172a', fontWeight: 900, letterSpacing: '-0.01em' }}>
            {businessName}
          </strong>
          <span
            style={{
              fontSize: '0.7rem',
              color: '#16a34a',
              fontWeight: 800,
              background: '#f0fdf4',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid #bbf7d0',
            }}
          >
            ⭐ 5.0 RATED CONTRACTOR
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.55, color: '#334155', minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800 }}>📞 {phone}</div>
            <div style={{ color: accentColor || '#2563eb', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🌐 {website}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '4px' }}>
              Direct Owner Scheduling • {license}
            </div>
          </div>

          {includeQrCode && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
              <CardQrVisual accentColor={accentColor} label="SCAN TO BOOK" sublabel="DIRECT" />
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: '0.68rem',
            color: '#64748b',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '6px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Licensed • Bonded • Fully Insured</span>
          <span style={{ fontWeight: 800, color: accentColor }}>Free On-Site Consultation</span>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 2. THE MODERN SPLIT (High Contrast Dual-Tone)
  // =========================================================================
  if (templateId === 'modern_split') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: activeColor.hex,
            color: activeColor.darkText ? '#0f172a' : '#ffffff',
            padding: 0,
            display: 'flex',
            flexDirection: 'row',
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15)`,
          }}
        >
          {spotUvGleam}
          {/* Left 35% Accent Block */}
          <div
            style={{
              width: '35%',
              height: '100%',
              background: accentColor,
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.25rem 0.75rem',
              boxSizing: 'border-box',
              position: 'relative',
              boxShadow: 'inset -2px 0 6px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ transform: 'scale(0.85)' }}>{renderBranding('white', 0.8)}</div>
            <span style={{ fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.12em', opacity: 0.9 }}>
              EST. PRO
            </span>
          </div>

          {/* Right 65% Main Details */}
          <div
            style={{
              width: '65%',
              height: '100%',
              padding: '1.4rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
            }}
          >
            <div>
              <strong style={{ fontSize: '1.08rem', display: 'block', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                {businessName}
              </strong>
              <span style={{ fontSize: '0.72rem', opacity: 0.8, fontWeight: 600, marginTop: '4px', display: 'block' }}>
                {tagline}
              </span>
            </div>
            <div style={{ borderTop: `2px solid ${accentColor}`, paddingTop: '8px' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800 }}>{license}</div>
              <div style={{ fontSize: '0.64rem', opacity: 0.75 }}>CERTIFIED TRADE CONTRACTOR</div>
            </div>
          </div>
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // Modern Split Back
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#ffffff',
          color: '#0f172a',
          padding: 0,
          display: 'flex',
          flexDirection: 'row',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1',
        }}
      >
        {/* Left accent strip */}
        <div style={{ width: '8px', height: '100%', background: accentColor }} />

        <div style={{ flex: 1, padding: '1.35rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0f172a' }}>{businessName}</strong>
              <span style={{ fontSize: '0.62rem', fontWeight: 800, color: accentColor, textTransform: 'uppercase' }}>
                PRO SERVICE
              </span>
            </div>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.7rem', color: '#64748b' }}>{tagline}</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>📞 {phone}</div>
              <div style={{ fontWeight: 700, color: accentColor }}>🌐 {website}</div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{license}</div>
            </div>
            {includeQrCode && <CardQrVisual accentColor={accentColor} label="QUICK BOOK" sublabel="ONLINE" />}
          </div>

          <div style={{ fontSize: '0.64rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Prompt, Professional &amp; Insured</span>
            <span style={{ fontWeight: 800 }}>Satisfaction Guaranteed</span>
          </div>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 3. THE INDUSTRIAL HEAVY-DUTY (Carbon Slate & Hazard Accent)
  // =========================================================================
  if (templateId === 'industrial') {
    const hazardStripe = `repeating-linear-gradient(-45deg, ${accentColor || '#f59e0b'}, ${accentColor || '#f59e0b'} 7px, #18181b 7px, #18181b 14px)`;

    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: '#18181b',
            color: '#f8fafc',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.1)',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '12px 12px',
          }}
        >
          {/* Top Hazard Accent Bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: hazardStripe }} />
          {spotUvGleam}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '4px' }}>
            <div>{renderBranding('white', 0.85)}</div>
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 900,
                background: 'rgba(255,255,255,0.12)',
                padding: '3px 8px',
                borderRadius: '3px',
                letterSpacing: '0.08em',
                color: accentColor || '#f59e0b',
              }}
            >
              HEAVY-DUTY GRADE
            </span>
          </div>

          <div style={{ borderLeft: `3px solid ${accentColor || '#f59e0b'}`, paddingLeft: '10px' }}>
            <strong style={{ fontSize: '1.18rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', lineHeight: 1.05 }}>
              {businessName}
            </strong>
            <span style={{ fontSize: '0.74rem', color: '#cbd5e1', fontWeight: 700, marginTop: '3px', display: 'block' }}>
              {tagline}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: accentColor || '#f59e0b' }}>{license}</span>
            <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#94a3b8' }}>COMMERCIAL &amp; INDUSTRIAL</span>
          </div>
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // Industrial Back
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#0f172a',
          color: '#f8fafc',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
          <div>
            <span style={{ fontSize: '0.62rem', fontWeight: 900, color: accentColor || '#f59e0b', letterSpacing: '0.08em' }}>
              ⚡ 24/7 PRIORITY DISPATCH
            </span>
            <strong style={{ display: 'block', fontSize: '0.98rem', fontWeight: 900 }}>{businessName}</strong>
          </div>
          <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8' }}>BONDED &amp; INSURED</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 900, color: '#ffffff' }}>📞 {phone}</div>
            <div style={{ fontWeight: 800, color: accentColor || '#38bdf8' }}>🌐 {website}</div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{license} • Certified Heavy Trade</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor={accentColor || '#f59e0b'} label="DISPATCH" sublabel="NOW" />}
        </div>

        {/* Bottom Hazard Accent Bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px', background: hazardStripe }} />
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 4. THE BLUEPRINT TECHNICAL (Architectural CAD Grid)
  // =========================================================================
  if (templateId === 'blueprint') {
    const blueprintGrid = {
      backgroundImage: 'linear-gradient(rgba(56, 189, 248, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.12) 1px, transparent 1px)',
      backgroundSize: '14px 14px',
    };

    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: '#07162c',
            color: '#e0f2fe',
            border: '1.5px solid rgba(56, 189, 248, 0.35)',
            boxShadow: '0 25px 50px -12px rgba(7, 22, 44, 0.7)',
            ...blueprintGrid,
          }}
        >
          {/* 4 Corner Crosshairs */}
          <span style={{ position: 'absolute', top: '6px', left: '8px', fontSize: '0.75rem', color: '#38bdf8', opacity: 0.6 }}>+</span>
          <span style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '0.75rem', color: '#38bdf8', opacity: 0.6 }}>+</span>
          <span style={{ position: 'absolute', bottom: '6px', left: '8px', fontSize: '0.75rem', color: '#38bdf8', opacity: 0.6 }}>+</span>
          <span style={{ position: 'absolute', bottom: '6px', right: '8px', fontSize: '0.75rem', color: '#38bdf8', opacity: 0.6 }}>+</span>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.12em', color: '#38bdf8' }}>
              DWG. REF: ARCH-01
            </span>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#94a3b8' }}>SCALE: 1:1 FIELD SPEC</span>
          </div>

          <div>
            <div style={{ marginBottom: '6px' }}>{renderBranding('white', 0.85)}</div>
            <strong style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.02em', color: '#ffffff', display: 'block' }}>
              {businessName}
            </strong>
            <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600 }}>{tagline}</span>
          </div>

          <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '4px 8px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#e0f2fe' }}>PROJECT SPECIFICATION</span>
            <span style={{ fontSize: '0.64rem', fontWeight: 900, color: '#38bdf8' }}>{license}</span>
          </div>
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // Blueprint Back
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#07162c',
          color: '#e0f2fe',
          border: '1.5px solid rgba(56, 189, 248, 0.35)',
          boxShadow: '0 25px 50px -12px rgba(7, 22, 44, 0.7)',
          ...blueprintGrid,
        }}
      >
        <div style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.25)', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <strong style={{ fontSize: '0.96rem', fontWeight: 900, color: '#ffffff' }}>{businessName}</strong>
          <span style={{ fontSize: '0.62rem', color: '#38bdf8', fontWeight: 800 }}>ESTIMATE DISPATCH SPEC</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800, color: '#ffffff' }}>📞 {phone}</div>
            <div style={{ fontWeight: 700, color: '#38bdf8' }}>🌐 {website}</div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Lic: {license} • Insured</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor="#38bdf8" label="CAD STAMP" sublabel="VERIFIED" />}
        </div>

        <div style={{ fontSize: '0.62rem', color: '#7dd3fc', borderTop: '1px solid rgba(56, 189, 248, 0.2)', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <span>APPROVED FOR IMMEDIATE FIELD ESTIMATING</span>
          <span style={{ fontWeight: 800 }}>REV 2.0</span>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 5. THE HIGH-IMPACT QR FIRST (Lead Generation Hero)
  // =========================================================================
  if (templateId === 'qr_first') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: activeColor.hex,
            color: activeColor.darkText ? '#0f172a' : '#ffffff',
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 2px ${accentColor}`,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          {spotUvGleam}
          {/* Left 60% Company Info */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
            <div>
              {renderBranding(activeColor.darkText ? 'color' : 'white', 0.82)}
              <strong style={{ fontSize: '1.02rem', fontWeight: 900, display: 'block', marginTop: '6px', lineHeight: 1.15 }}>
                {businessName}
              </strong>
              <span style={{ fontSize: '0.7rem', opacity: 0.85, fontWeight: 600 }}>{tagline}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>📞 {phone}</div>
              <span style={{ fontSize: '0.64rem', color: accentColor, fontWeight: 800 }}>
                Point camera at QR code ➜
              </span>
            </div>
          </div>

          {/* Right 40% Oversized Hero QR */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CardQrVisual size={86} accentColor={accentColor} label="SCAN TO BOOK" sublabel="INSTANT ESTIMATE" />
            <span style={{ fontSize: '0.55rem', fontWeight: 800, marginTop: '3px', color: accentColor }}>
              CAMERA READY
            </span>
          </div>
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // QR First Back
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '1.02rem', fontWeight: 900, color: '#0f172a' }}>{businessName}</strong>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#16a34a' }}>⚡ SAME-DAY RESPONSE</span>
        </div>

        {/* 4-Item Credentials Checklist */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', margin: '6px 0' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#334155' }}>✓ Free Written Quotes</div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#334155' }}>✓ Transparent Pricing</div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#334155' }}>✓ {license}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#334155' }}>✓ Fully Insured</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
          <div style={{ fontSize: '0.78rem' }}>
            <strong>📞 {phone}</strong> · <span style={{ color: accentColor }}>{website}</span>
          </div>
          <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748b' }}>Residential &amp; Commercial</span>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 6. THE VERIFIED PRO (Trust Shield & 5-Star Rating)
  // =========================================================================
  if (templateId === 'verified_pro') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: activeColor.hex,
            color: activeColor.darkText ? '#0f172a' : '#ffffff',
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15)`,
          }}
        >
          {spotUvGleam}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>{renderBranding(activeColor.darkText ? 'color' : 'white', 0.85)}</div>
            {/* Trust Shield Badge */}
            <div
              style={{
                background: 'rgba(22, 163, 74, 0.15)',
                border: '1px solid #16a34a',
                padding: '3px 8px',
                borderRadius: '6px',
                textAlign: 'right',
              }}
            >
              <span style={{ fontSize: '0.58rem', fontWeight: 900, color: '#22c55e', display: 'block' }}>
                🛡️ VERIFIED CONTRACTOR
              </span>
              <span style={{ fontSize: '0.52rem', color: '#86efac', fontWeight: 700 }}>
                BONDED &amp; $2M INSURED
              </span>
            </div>
          </div>

          <div>
            <strong style={{ fontSize: '1.08rem', fontWeight: 900, letterSpacing: '-0.01em', display: 'block' }}>
              {businessName}
            </strong>
            <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 600 }}>{tagline}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800 }}>
              ★★★★★ 5.0 GOOGLE REVIEWS
            </span>
            <span style={{ fontSize: '0.68rem', fontWeight: 900, color: accentColor }}>{license}</span>
          </div>
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // Verified Pro Back
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1',
        }}
      >
        <div style={{ borderBottom: '2px solid #16a34a', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.62rem', color: '#16a34a', fontWeight: 800 }}>
              HOMEOWNER PEACE-OF-MIND PROMISE
            </span>
          </div>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b' }}>{license}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>📞 {phone}</div>
            <div style={{ fontWeight: 700, color: accentColor || '#2563eb' }}>🌐 {website}</div>
            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Background Checked · 100% Guaranteed</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor="#16a34a" label="VERIFIED" sublabel="BOOKING" />}
        </div>

        <div style={{ fontSize: '0.64rem', color: '#64748b', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', textAlign: 'center', fontWeight: 700 }}>
          Direct Dispatch to Your Neighborhood • Free Written Estimate
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 7. THE DOUBLE-SIDED SHOWCASE (Minimalist Identity Front, Structured Back)
  // =========================================================================
  if (templateId === 'double_sided') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: activeColor.hex,
            color: activeColor.darkText ? '#0f172a' : '#ffffff',
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15)`,
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '0.5rem',
          }}
        >
          {spotUvGleam}
          <div style={{ transform: 'scale(1.15)' }}>{renderBranding(activeColor.darkText ? 'color' : 'white', 1.0)}</div>
          <div>
            <strong style={{ fontSize: '1.22rem', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block' }}>
              {businessName}
            </strong>
            <span style={{ fontSize: '0.74rem', opacity: 0.8, fontWeight: 600 }}>{tagline}</span>
          </div>
          <div style={{ position: 'absolute', bottom: '12px', left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 800, color: accentColor, letterSpacing: '0.08em' }}>
              {license}
            </span>
          </div>
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // Double Sided Back
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1',
        }}
      >
        <div style={{ borderBottom: `2px solid ${accentColor}`, paddingBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>{tagline}</span>
          </div>
          <span style={{ fontSize: '0.66rem', fontWeight: 800, color: accentColor }}>{license}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>📞 {phone}</div>
            <div style={{ fontWeight: 700, color: accentColor }}>🌐 {website}</div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Custom Contractor Services</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor={accentColor} label="ONLINE" sublabel="BOOKING" />}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '4px' }}>
          <span>Residential &amp; Commercial</span>
          <span style={{ fontWeight: 800 }}>Free Consultation</span>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 8. THE TIMELESS TRADITIONAL (Heritage Double Pinstripe Frame)
  // =========================================================================
  return (
    <div
      style={{
        ...baseContainerStyle,
        background: side === 'front' ? activeColor.hex : '#ffffff',
        color: side === 'front' ? (activeColor.darkText ? '#0f172a' : '#ffffff') : '#0f172a',
        boxShadow: side === 'front'
          ? `0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15)`
          : '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1',
        fontFamily: 'Georgia, serif',
      }}
    >
      {/* Concentric Double Pinstripe Frame */}
      <div
        style={{
          position: 'absolute',
          inset: '8px',
          border: `1px solid ${accentColor || '#c5a059'}`,
          borderRadius: '6px',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '12px',
          border: `0.75px solid ${accentColor || '#c5a059'}`,
          borderRadius: '4px',
          pointerEvents: 'none',
          opacity: 0.6,
        }}
      />
      {side === 'front' && spotUvGleam}

      {side === 'front' ? (
        <>
          <div style={{ textAlign: 'center', marginTop: '4px' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: accentColor || '#c5a059', fontWeight: 700 }}>
              ESTABLISHED CRAFTSMANSHIP
            </span>
          </div>

          <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              {renderBranding(activeColor.darkText ? 'color' : 'white', 0.85)}
            </div>
            <strong style={{ fontSize: '1.16rem', fontWeight: 700, letterSpacing: '0.04em', display: 'block', textTransform: 'uppercase' }}>
              {businessName}
            </strong>
            <div style={{ fontSize: '0.68rem', color: accentColor || '#c5a059', margin: '2px 0' }}>♦ ♦ ♦</div>
            <span style={{ fontSize: '0.72rem', fontStyle: 'italic', opacity: 0.85 }}>{tagline}</span>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.64rem', letterSpacing: '0.08em', opacity: 0.8 }}>
              {license} • MASTER TRADESMAN
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={{ textAlign: 'center', borderBottom: `1px solid ${accentColor || '#c5a059'}`, paddingBottom: '4px' }}>
            <strong style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {businessName}
            </strong>
            <span style={{ display: 'block', fontSize: '0.68rem', fontStyle: 'italic', color: '#64748b' }}>{tagline}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem' }}>
            <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: '#334155' }}>
              <div style={{ fontWeight: 700 }}>Tel. {phone}</div>
              <div style={{ color: accentColor || '#c5a059', fontWeight: 700 }}>{website}</div>
              <div style={{ fontSize: '0.68rem', fontStyle: 'italic', color: '#64748b' }}>{license}</div>
            </div>
            {includeQrCode && <CardQrVisual accentColor={accentColor || '#c5a059'} label="ESTIMATE" sublabel="DIRECT" />}
          </div>

          <div style={{ textAlign: 'center', fontSize: '0.62rem', color: '#64748b', fontStyle: 'italic' }}>
            Fine Residential &amp; Commercial Craftsmanship • Fully Insured
          </div>
        </>
      )}
      {showBleedGuides && <BleedGuides />}
    </div>
  );
}
