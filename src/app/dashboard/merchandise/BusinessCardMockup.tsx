'use client';

import React from 'react';
import type { BusinessCardTemplateId, CardFinishId } from '@/lib/merchandise/types';
import { getCardTemplateById } from '@/lib/merchandise/card-templates';

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
  finish?: CardFinishId | string;
}

/**
 * Dynamic Metallic Foil & Gloss Shader Overlay.
 * Reacts to mouse tilt / lighting angle with authentic specular highlights.
 */
function FoilShader({
  finish = 'velvet_matte',
  glareX = 50,
  isDark = false,
}: {
  finish?: CardFinishId | string;
  glareX?: number;
  isDark?: boolean;
}) {
  const angle = 90 + (glareX - 50) * 0.9;
  const sweepPos = Math.min(100, Math.max(0, glareX));

  if (finish === 'foil_gold') {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 6,
          background: `linear-gradient(${angle}deg, transparent ${sweepPos - 28}%, rgba(255, 235, 140, 0.45) ${sweepPos - 8}%, rgba(255, 255, 255, 0.75) ${sweepPos}%, rgba(212, 175, 55, 0.55) ${sweepPos + 10}%, transparent ${sweepPos + 32}%)`,
          mixBlendMode: isDark ? 'color-dodge' : 'overlay',
          transition: 'background 0.05s ease',
        }}
      />
    );
  }

  if (finish === 'foil_silver') {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 6,
          background: `linear-gradient(${angle}deg, transparent ${sweepPos - 25}%, rgba(220, 235, 255, 0.5) ${sweepPos - 7}%, rgba(255, 255, 255, 0.85) ${sweepPos}%, rgba(180, 205, 230, 0.5) ${sweepPos + 8}%, transparent ${sweepPos + 28}%)`,
          mixBlendMode: isDark ? 'color-dodge' : 'overlay',
          transition: 'background 0.05s ease',
        }}
      />
    );
  }

  if (finish === 'foil_holo') {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 6,
          background: `linear-gradient(${angle}deg, transparent ${sweepPos - 35}%, rgba(255, 105, 180, 0.35) ${sweepPos - 20}%, rgba(255, 215, 0, 0.4) ${sweepPos - 7}%, rgba(0, 255, 200, 0.45) ${sweepPos}%, rgba(30, 144, 255, 0.4) ${sweepPos + 8}%, rgba(186, 85, 211, 0.35) ${sweepPos + 22}%, transparent ${sweepPos + 38}%)`,
          mixBlendMode: 'overlay',
          transition: 'background 0.05s ease',
        }}
      />
    );
  }

  if (finish === 'spot_uv') {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 6,
          background: `linear-gradient(${angle}deg, transparent ${sweepPos - 20}%, rgba(255, 255, 255, 0.28) ${sweepPos}%, transparent ${sweepPos + 20}%)`,
          mixBlendMode: 'soft-light',
          transition: 'background 0.05s ease',
        }}
      />
    );
  }

  // Default Velvet Matte: subtle soft-focus ambient light
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        background: `radial-gradient(circle at ${sweepPos}% 30%, rgba(255, 255, 255, 0.12) 0%, transparent 60%)`,
        mixBlendMode: 'screen',
      }}
    />
  );
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
        aria-hidden="true"
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
          background: 'rgba(15, 23, 42, 0.76)',
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
      <div style={{ position: 'absolute', inset: '2px', border: '1.5px dashed #ef4444', borderRadius: '10px' }} />
      <div style={{ position: 'absolute', inset: '10px', border: '1.5px solid #06b6d4', borderRadius: '7px' }} />
      <div style={{ position: 'absolute', inset: '18px', border: '1.5px dashed #22c55e', borderRadius: '5px' }} />
      <div style={{ position: 'absolute', top: '10px', left: '10px', width: '10px', height: '10px', borderTop: '2px solid #06b6d4', borderLeft: '2px solid #06b6d4' }} />
      <div style={{ position: 'absolute', top: '10px', right: '10px', width: '10px', height: '10px', borderTop: '2px solid #06b6d4', borderRight: '2px solid #06b6d4' }} />
      <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '10px', height: '10px', borderBottom: '2px solid #06b6d4', borderLeft: '2px solid #06b6d4' }} />
      <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '10px', height: '10px', borderBottom: '2px solid #06b6d4', borderRight: '2px solid #06b6d4' }} />
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
  secondaryColor = '#3b82f6',
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
  finish = 'velvet_matte',
}: BusinessCardMockupProps) {
  const cardW = 370;
  const cardH = 215;
  const templateDef = getCardTemplateById(templateId);

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
    padding: '1.35rem',
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: 'center center',
    transition: 'box-shadow 0.2s ease, transform 0.3s ease',
    ...customStyle,
  };

  const isDarkCard = side === 'front' ? !activeColor.darkText : false;
  const foilEffect = <FoilShader finish={finish} glareX={glareX} isDark={isDarkCard} />;

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
          {/* Executive Metallic Hairline Accent Rules */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: accentColor }} />
          <div style={{ position: 'absolute', top: '10px', left: '16px', right: '16px', height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.1)' }} />
          {foilEffect}

          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>{renderBranding(activeColor.darkText ? 'color' : 'white', 0.88)}</div>
              <span
                style={{
                  fontSize: '0.58rem',
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                  color: accentColor,
                  border: `1px solid ${accentColor}`,
                  padding: '2px 6px',
                  borderRadius: '3px',
                }}
              >
                {templateDef.badgeLabel}
              </span>
            </div>
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
              <span style={{ display: 'block', fontSize: '0.6rem', opacity: 0.75, fontWeight: 700 }}>
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
        {foilEffect}
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
            {templateDef.ratingBadgeText}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.55, color: '#334155', minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800 }}>📞 {phone}</div>
            <div style={{ color: '#2563eb', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🌐 {website}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
              Fast Estimates • Licensed &amp; Bonded
            </div>
          </div>
          {includeQrCode && <CardQrVisual accentColor={accentColor} />}
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
          <span>Luxury Residential &amp; Commercial</span>
          <span style={{ fontWeight: 800, color: '#0f172a' }}>Direct Dispatch</span>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 2. THE MODERN SPLIT
  // =========================================================================
  if (templateId === 'modern_split') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: '#ffffff',
            color: '#0f172a',
            padding: 0,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1',
          }}
        >
          <div style={{ display: 'flex', height: '100%' }}>
            {/* Left 35% Accent Block */}
            <div
              style={{
                width: '35%',
                background: activeColor.hex,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.2rem',
                position: 'relative',
                color: activeColor.darkText ? '#0f172a' : '#ffffff',
              }}
            >
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '4px', background: accentColor }} />
              <div style={{ transform: 'scale(0.95)' }}>
                {renderBranding(activeColor.darkText ? 'color' : 'white', 0.9)}
              </div>
            </div>

            {/* Right 65% Information Block */}
            <div
              style={{
                width: '65%',
                padding: '1.4rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '0.62rem',
                    color: accentColor,
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  {templateDef.badgeLabel}
                </span>
                <strong style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#0f172a', display: 'block' }}>
                  {businessName}
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{tagline}</span>
              </div>

              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569' }}>
                  {license} • Insured
                </span>
              </div>
            </div>
          </div>
          {foilEffect}
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // Modern Split Back
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#f8fafc',
          color: '#0f172a',
          borderLeft: `8px solid ${accentColor}`,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3), 0 0 0 1px #cbd5e1',
        }}
      >
        {foilEffect}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '1.02rem', fontWeight: 900, color: '#0f172a' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.7rem', color: '#64748b' }}>{tagline}</span>
          </div>
          <span style={{ fontSize: '0.68rem', fontWeight: 900, color: accentColor }}>
            {templateDef.ratingBadgeText}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.84rem', lineHeight: 1.6, color: '#334155' }}>
            <div style={{ fontWeight: 800 }}>📞 {phone}</div>
            <div style={{ color: '#2563eb', fontWeight: 700 }}>🌐 {website}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Fast Quotes • Direct Booking</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor={accentColor} />}
        </div>

        <div style={{ fontSize: '0.64rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
          Commercial &amp; Residential Specialists • Free Estimates
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 3. THE INDUSTRIAL HEAVY-DUTY
  // =========================================================================
  if (templateId === 'industrial') {
    const hazardStripe = `repeating-linear-gradient(45deg, ${accentColor}, ${accentColor} 8px, transparent 8px, transparent 16px)`;

    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: '#18181b',
            color: '#ffffff',
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.6), 0 0 0 1px #3f3f46, 0 4px 0 0 ${accentColor}`,
          }}
        >
          {/* Carbon Fiber Micro Texture SVG */}
          <svg style={{ position: 'absolute', inset: 0, opacity: 0.16, pointerEvents: 'none' }} width="100%" height="100%">
            <defs>
              <pattern id="carbonTile" width="6" height="6" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="#000000" />
                <rect width="3" height="3" fill="#ffffff" />
                <rect x="3" y="3" width="3" height="3" fill="#ffffff" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#carbonTile)" />
          </svg>

          {/* Top Hazard Stripe Bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: hazardStripe }} />
          {foilEffect}

          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>{renderBranding('white', 0.9)}</div>
              <span
                style={{
                  background: 'rgba(234, 88, 12, 0.2)',
                  border: `1px solid ${accentColor}`,
                  color: accentColor,
                  fontSize: '0.6rem',
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                {templateDef.badgeLabel}
              </span>
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 2 }}>
            <strong style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', color: '#ffffff' }}>
              {businessName}
            </strong>
            <span style={{ fontSize: '0.74rem', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {tagline}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2, borderTop: '1px solid #27272a', paddingTop: '6px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 900, color: accentColor, letterSpacing: '0.06em' }}>
              {license}
            </span>
            <span style={{ fontSize: '0.62rem', color: '#71717a', fontWeight: 800 }}>
              HEAVY-DUTY COMMERCIAL SPEC
            </span>
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
          background: '#09090b',
          color: '#ffffff',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6), 0 0 0 1px #27272a',
        }}
      >
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: hazardStripe }} />
        {foilEffect}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '1.08rem', fontWeight: 900, color: '#ffffff', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {businessName}
            </strong>
            <span style={{ display: 'block', fontSize: '0.68rem', color: accentColor, fontWeight: 800 }}>
              {templateDef.ratingBadgeText}
            </span>
          </div>
          <span style={{ background: '#27272a', color: '#e4e4e7', fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: '3px' }}>
            24/7 DISPATCH
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.86rem', lineHeight: 1.6, color: '#d4d4d8' }}>
            <div style={{ fontWeight: 900, color: '#ffffff' }}>📞 {phone}</div>
            <div style={{ color: accentColor, fontWeight: 800 }}>🌐 {website}</div>
            <div style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>Fully Licensed, Bonded &amp; Insured</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor={accentColor} label="QUICK ESTIMATE" sublabel="24/7" />}
        </div>

        <div style={{ fontSize: '0.62rem', color: '#71717a', borderTop: '1px solid #18181b', paddingTop: '4px' }}>
          Commercial Grade Heavy Equipment &amp; Field Specialists
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 4. THE BLUEPRINT TECHNICAL
  // =========================================================================
  if (templateId === 'blueprint') {
    const cadGrid = (
      <svg style={{ position: 'absolute', inset: 0, opacity: 0.22, pointerEvents: 'none' }} width="100%" height="100%">
        <defs>
          <pattern id="cadGridPat" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#38bdf8" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cadGridPat)" />
      </svg>
    );

    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: '#0c2d48',
            color: '#ffffff',
            border: '2px solid #38bdf8',
            boxShadow: '0 25px 50px -12px rgba(12, 45, 72, 0.6), inset 0 0 0 1px rgba(56, 189, 248, 0.4)',
          }}
        >
          {cadGrid}
          {foilEffect}

          {/* Precision Architectural Title Block */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.58rem', fontFamily: 'monospace', letterSpacing: '0.1em', color: '#38bdf8' }}>
              DWG: {templateDef.badgeLabel}
            </span>
            <span style={{ fontSize: '0.56rem', fontFamily: 'monospace', color: '#93c5fd' }}>
              SCALE: 1:1 • 88.9 × 50.8mm
            </span>
          </div>

          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {renderBranding('white', 0.85)}
              <div>
                <strong style={{ fontSize: '1.14rem', fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', color: '#ffffff' }}>
                  {businessName}
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#7dd3fc', fontWeight: 600 }}>{tagline}</span>
              </div>
            </div>
          </div>

          <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid rgba(56, 189, 248, 0.4)', paddingTop: '4px' }}>
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#38bdf8', fontWeight: 800 }}>
              {license}
            </span>
            <span style={{ fontSize: '0.6rem', color: '#93c5fd', opacity: 0.85 }}>
              ARCHITECTURAL SPECIFICATION
            </span>
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
          background: '#071e33',
          color: '#ffffff',
          border: '2px solid rgba(56, 189, 248, 0.7)',
          boxShadow: '0 25px 50px -12px rgba(7, 30, 51, 0.6)',
        }}
      >
        {cadGrid}
        {foilEffect}

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '1.02rem', fontWeight: 900, color: '#ffffff' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.65rem', color: '#7dd3fc', fontFamily: 'monospace' }}>
              FIELD OPERATIONS DESK
            </span>
          </div>
          <span style={{ fontSize: '0.62rem', color: '#38bdf8', fontFamily: 'monospace', border: '1px solid #38bdf8', padding: '1px 6px', borderRadius: '3px' }}>
            VERIFIED GC
          </span>
        </div>

        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.55, color: '#e0f2fe' }}>
            <div style={{ fontWeight: 800 }}>TEL: {phone}</div>
            <div style={{ color: '#38bdf8', fontWeight: 700 }}>WEB: {website}</div>
            <div style={{ fontSize: '0.68rem', color: '#93c5fd' }}>{templateDef.ratingBadgeText}</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor="#38bdf8" label="FIELD PORTAL" sublabel="DIRECT" />}
        </div>

        <div style={{ position: 'relative', zIndex: 2, fontSize: '0.62rem', color: '#7dd3fc', opacity: 0.8, borderTop: '1px solid rgba(56, 189, 248, 0.3)', paddingTop: '4px' }}>
          Precision Design-Build • General Contracting • Commercial Framing
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 5. THE HIGH-IMPACT QR FIRST
  // =========================================================================
  if (templateId === 'qr_first') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: '#ffffff',
            color: '#0f172a',
            border: `2px solid ${accentColor}`,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px ${accentColor}`,
          }}
        >
          {foilEffect}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {renderBranding('dark', 0.75)}
              <strong style={{ fontSize: '1.02rem', fontWeight: 900, color: '#0f172a' }}>{businessName}</strong>
            </div>
            <span style={{ fontSize: '0.64rem', color: '#16a34a', fontWeight: 900, background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
              INSTANT ESTIMATE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.65rem', color: accentColor, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>
                {templateDef.badgeLabel}
              </span>
              <strong style={{ fontSize: '0.98rem', display: 'block', color: '#0f172a', margin: '2px 0' }}>
                Scan with Phone Camera
              </strong>
              <p style={{ fontSize: '0.72rem', color: '#475569', margin: 0, lineHeight: 1.35 }}>
                Get an instant estimate &amp; book appointment directly on our calendar.
              </p>
            </div>
            <div style={{ transform: 'scale(1.15)', flexShrink: 0 }}>
              <CardQrVisual size={80} accentColor={accentColor} label="SCAN TO BOOK" sublabel="2 MIN" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0f172a' }}>📞 {phone}</span>
            <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{website}</span>
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
          background: '#0f172a',
          color: '#ffffff',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {foilEffect}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '1.05rem', color: '#ffffff', fontWeight: 900 }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.68rem', color: '#94a3b8' }}>{tagline}</span>
          </div>
          <span style={{ fontSize: '0.66rem', color: accentColor, fontWeight: 900 }}>
            {license}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.72rem', color: '#cbd5e1' }}>
          <div>✓ Free On-Site Inspection</div>
          <div>✓ 100% Upfront Pricing</div>
          <div>✓ Licensed &amp; Bonded</div>
          <div>✓ Emergency 24/7 Crew</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #334155', paddingTop: '6px' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#38bdf8' }}>📞 {phone}</div>
          <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>{website}</div>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 6. THE VERIFIED PRO
  // =========================================================================
  if (templateId === 'verified_pro') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: activeColor.hex,
            color: activeColor.darkText ? '#0f172a' : '#ffffff',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.15)',
          }}
        >
          {foilEffect}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>{renderBranding(activeColor.darkText ? 'color' : 'white', 0.85)}</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(22, 163, 74, 0.2)',
                border: '1px solid #22c55e',
                borderRadius: '999px',
                padding: '2px 8px',
                color: '#4ade80',
                fontSize: '0.64rem',
                fontWeight: 900,
              }}
            >
              <span>🛡️</span>
              <span>{templateDef.badgeLabel}</span>
            </div>
          </div>

          <div>
            <strong style={{ fontSize: '1.14rem', fontWeight: 900, letterSpacing: '-0.01em', display: 'block' }}>
              {businessName}
            </strong>
            <span style={{ fontSize: '0.74rem', opacity: 0.85, fontWeight: 600 }}>{tagline}</span>
            <div style={{ marginTop: '4px', display: 'flex', gap: '8px', fontSize: '0.68rem', color: '#fbbf24', fontWeight: 800 }}>
              <span>★★★★★ 5.0 Rating</span>
              <span style={{ color: activeColor.darkText ? '#475569' : '#cbd5e1' }}>• 100% Guaranteed</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '4px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: accentColor }}>
              {license}
            </span>
            <span style={{ fontSize: '0.64rem', opacity: 0.75 }}>
              HOMEOWNER TRUSTED
            </span>
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
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px #cbd5e1',
        }}
      >
        {foilEffect}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '1.02rem', fontWeight: 900, color: '#0f172a' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.68rem', color: '#16a34a', fontWeight: 800 }}>
              {templateDef.ratingBadgeText}
            </span>
          </div>
          <span style={{ fontSize: '0.64rem', color: '#2563eb', fontWeight: 800, background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
            LOCAL CONTRACTOR
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: '#334155' }}>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>📞 {phone}</div>
            <div style={{ color: '#2563eb', fontWeight: 700 }}>🌐 {website}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>License: {license}</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor="#16a34a" label="VERIFY PRO" sublabel="ONLINE" />}
        </div>

        <div style={{ fontSize: '0.64rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Clean Background Checked Crews</span>
          <span style={{ fontWeight: 800 }}>Free Consultation</span>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 7. THE DOUBLE-SIDED SHOWCASE
  // =========================================================================
  if (templateId === 'double_sided') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: activeColor.hex,
            color: activeColor.darkText ? '#0f172a' : '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.15)',
          }}
        >
          {foilEffect}
          <div style={{ marginBottom: '0.6rem' }}>
            {renderBranding(activeColor.darkText ? 'color' : 'white', 1.05)}
          </div>
          <strong style={{ fontSize: '1.2rem', fontWeight: 900, letterSpacing: '-0.01em', textTransform: 'uppercase' }}>
            {businessName}
          </strong>
          <span style={{ fontSize: '0.74rem', opacity: 0.85, fontWeight: 600, marginTop: '2px', display: 'block' }}>
            {tagline}
          </span>
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              fontSize: '0.64rem',
              letterSpacing: '0.08em',
              fontWeight: 800,
              opacity: 0.75,
              color: accentColor,
            }}
          >
            {license}
          </div>
          {showBleedGuides && <BleedGuides />}
        </div>
      );
    }

    // Double Sided Back (Functional utility)
    return (
      <div
        style={{
          ...baseContainerStyle,
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px #cbd5e1',
        }}
      >
        {foilEffect}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
          <strong style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0f172a' }}>{businessName}</strong>
          <span style={{ fontSize: '0.68rem', color: '#2563eb', fontWeight: 800 }}>
            {templateDef.ratingBadgeText}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: '#334155' }}>
            <div style={{ fontWeight: 800 }}>📞 {phone}</div>
            <div style={{ color: '#2563eb', fontWeight: 700 }}>🌐 {website}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Custom Craftsmanship</div>
          </div>
          {includeQrCode && <CardQrVisual accentColor={accentColor} />}
        </div>

        <div style={{ fontSize: '0.64rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <span>Residential &amp; Commercial Installation</span>
          <span style={{ fontWeight: 800 }}>{license}</span>
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 8. THE TIMELESS TRADITIONAL
  // =========================================================================
  return (
    <div
      style={{
        ...baseContainerStyle,
        background: side === 'front' ? activeColor.hex : '#ffffff',
        color: side === 'front' ? (activeColor.darkText ? '#0f172a' : '#ffffff') : '#0f172a',
        border: `3px double ${accentColor || '#c5a059'}`,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.1)',
      }}
    >
      {/* Concentric Traditional Hairline Inset Border */}
      <div
        style={{
          position: 'absolute',
          inset: '6px',
          border: `1px solid ${accentColor || '#c5a059'}`,
          borderRadius: '7px',
          opacity: 0.65,
          pointerEvents: 'none',
        }}
      />
      {foilEffect}

      {side === 'front' ? (
        <>
          <div style={{ textAlign: 'center', marginTop: '2px' }}>
            <span style={{ fontSize: '0.58rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: accentColor || '#c5a059', fontWeight: 800 }}>
              {templateDef.badgeLabel}
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

          <div style={{ textAlign: 'center', marginBottom: '2px' }}>
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
            {templateDef.ratingBadgeText} • Fully Insured
          </div>
        </>
      )}
      {showBleedGuides && <BleedGuides />}
    </div>
  );
}
