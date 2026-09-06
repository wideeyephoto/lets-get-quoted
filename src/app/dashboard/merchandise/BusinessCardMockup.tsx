'use client';

import React from 'react';
import type { BusinessCardTemplateId, CardFinishId } from '@/lib/merchandise/types';
import { getCardTemplateById } from '@/lib/merchandise/card-templates';
import { getCardQrMatrix } from '@/lib/merchandise/card-qr';

export interface BusinessCardMockupProps {
  templateId?: BusinessCardTemplateId;
  side: 'front' | 'back';
  primaryColor?: string;
  activeColor: { id: string; name: string; hex: string; darkText?: boolean };
  accentColor: string;
  secondaryColor?: string;
  businessName: string;
  tagline?: string;
  phone?: string;
  secondaryPhone?: string;
  fax?: string;
  email?: string;
  website?: string;
  license?: string;
  badgeLabel?: string;
  ratingBadgeText?: string;
  bulletText?: string;
  footerText?: string;
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
 * Vector QR code visual with 4-module quiet zone and verified optical scannability.
 */
function CardQrVisual({
  url,
  size = 72,
  accentColor,
}: {
  url: string;
  size?: number;
  accentColor?: string;
}) {
  const matrix = React.useMemo(() => getCardQrMatrix(url, 4), [url]);

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: '#ffffff',
        borderRadius: '6px',
        padding: '3px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
        border: `1.5px solid ${accentColor || 'rgba(0, 0, 0, 0.12)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${matrix.size} ${matrix.size}`}
        shapeRendering="crispEdges"
        style={{ display: 'block', width: '100%', height: '100%' }}
        aria-label="Scan to Book QR Code"
      >
        <rect width="100%" height="100%" fill="#ffffff" />
        <path d={matrix.d} fill="#000000" />
      </svg>
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

export function isDarkColor(hex?: string): boolean {
  if (!hex) return true;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length < 6) return true;
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 140;
}

function getBusinessNameFontSize(name: string, defaultSizeRem = 1.1): string {
  const len = name ? name.trim().length : 0;
  if (len > 30) return `${(defaultSizeRem * 0.74).toFixed(2)}rem`;
  if (len > 22) return `${(defaultSizeRem * 0.82).toFixed(2)}rem`;
  if (len > 15) return `${(defaultSizeRem * 0.9).toFixed(2)}rem`;
  return `${defaultSizeRem}rem`;
}

function getTaglineStyle(tagline?: string, options?: { uppercase?: boolean; customFontSize?: string }): React.CSSProperties {
  const len = tagline ? tagline.trim().length : 0;
  const fontSize = options?.customFontSize || (len > 70 ? '0.62rem' : len > 45 ? '0.66rem' : '0.70rem');

  return {
    fontSize,
    lineHeight: 1.25,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    wordBreak: 'break-word',
    opacity: 0.88,
    fontWeight: 600,
    textTransform: options?.uppercase ? 'uppercase' : undefined,
    letterSpacing: options?.uppercase ? '0.03em' : undefined,
  };
}

function ContactBlock({
  phone,
  secondaryPhone,
  email,
  website,
  fax,
  accentColor = '#2563eb',
  textColor = '#334155',
  bulletText,
  compact = false,
}: {
  phone?: string;
  secondaryPhone?: string;
  email?: string;
  website?: string;
  fax?: string;
  accentColor?: string;
  textColor?: string;
  bulletText?: string;
  compact?: boolean;
}) {
  const items: { icon: string; text: string; strong?: boolean; isUrl?: boolean }[] = [];
  if (phone) items.push({ icon: '📞', text: phone, strong: true });
  if (secondaryPhone) items.push({ icon: '📱', text: secondaryPhone });
  if (email) items.push({ icon: '✉️', text: email });
  if (website) items.push({ icon: '🌐', text: website, strong: true, isUrl: true });
  if (fax) items.push({ icon: '📠', text: `Fax: ${fax}` });

  const count = items.length;
  const fontSize = compact || count >= 5 ? '0.64rem' : count >= 4 ? '0.69rem' : '0.78rem';
  const lineHeight = count >= 4 ? 1.25 : 1.45;

  return (
    <div style={{ fontSize, lineHeight, color: textColor, minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: count >= 4 ? '1px' : '2px' }}>
      {items.map((it, idx) => (
        <div
          key={idx}
          style={{
            fontWeight: it.strong ? 800 : 600,
            color: it.isUrl ? accentColor : undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ marginRight: '4px', fontSize: '0.9em' }}>{it.icon}</span>
          <span>{it.text}</span>
        </div>
      ))}
      {bulletText && count < 5 && (
        <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bulletText}
        </div>
      )}
    </div>
  );
}

export default function BusinessCardMockup({
  templateId = 'executive',
  side,
  primaryColor,
  activeColor,
  accentColor = '#ff7a21',
  secondaryColor = '#ff7a21',
  businessName,
  tagline = 'Commercial & Residential Contractor',
  phone = '(555) 019-2834',
  secondaryPhone,
  fax,
  email,
  website = 'buildpro.contractor',
  license = 'LIC# ROC-389142',
  badgeLabel,
  ratingBadgeText,
  bulletText,
  footerText,
  includeQrCode = true,
  renderBranding,
  glareX = 50,
  showBleedGuides = false,
  customStyle = {},
  scale = 1,
  finish = 'velvet_matte',
}: BusinessCardMockupProps) {
  const cardW = 385;
  const cardH = 220;
  const templateDef = getCardTemplateById(templateId);

  const effectivePrimary = primaryColor || activeColor?.hex || '#0f172a';
  const effectiveSecondary = secondaryColor || accentColor || '#ff7a21';
  const primaryDark = isDarkColor(effectivePrimary);
  const secondaryDark = isDarkColor(effectiveSecondary);
  const primaryText = primaryDark ? '#ffffff' : '#0f172a';
  const primaryTextMuted = primaryDark ? 'rgba(255, 255, 255, 0.72)' : 'rgba(15, 23, 42, 0.72)';
  const secondaryText = secondaryDark ? '#ffffff' : '#0f172a';

  const effectiveBadgeLabel = (badgeLabel ?? '').trim() || templateDef.badgeLabel;
  const effectiveRatingBadge = (ratingBadgeText ?? '').trim() || templateDef.ratingBadgeText;
  const effectiveBullet = (bulletText ?? '').trim() || (templateDef.bulletText || 'Fast Estimates • Clear Communication');
  const effectiveFooter = (footerText ?? '').trim() || (templateDef.footerText || 'Commercial & Residential Specialists • Free Estimates');

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
    padding: '1.05rem 1.25rem',
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: 'center center',
    transition: 'box-shadow 0.2s ease, transform 0.3s ease',
    ...customStyle,
  };

  const isDarkCard = side === 'front' ? primaryDark : false;
  const foilEffect = <FoilShader finish={finish} glareX={glareX} isDark={isDarkCard} />;

  const qrTargetUrl = website?.trim()
    ? (website.startsWith('http://') || website.startsWith('https://') ? website.trim() : `https://${website.trim()}`)
    : 'https://letsgetquoted.com';

  // =========================================================================
  // 1. THE EXECUTIVE TRADESMAN
  // =========================================================================
  if (templateId === 'executive') {
    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: effectivePrimary,
            color: primaryText,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.15), 0 4px 0 0 ${effectiveSecondary}`,
          }}
        >
          {/* Executive Metallic Hairline Accent Rules */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: effectiveSecondary }} />
          <div style={{ position: 'absolute', top: '10px', left: '16px', right: '16px', height: '1px', background: primaryDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: primaryDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }} />
          {foilEffect}

          {/* Top Row: Logo + Badge */}
          <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', maxHeight: '34px', maxWidth: '130px' }}>
              {renderBranding(primaryDark ? 'white' : 'dark', 0.85)}
            </div>
            <span
              style={{
                fontSize: '0.58rem',
                fontWeight: 900,
                letterSpacing: '0.12em',
                color: effectiveSecondary,
                border: `1px solid ${effectiveSecondary}`,
                padding: '2px 6px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {effectiveBadgeLabel}
            </span>
          </div>

          {/* Middle Content */}
          <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, margin: '4px 0' }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.05), display: 'block', letterSpacing: '0.02em', textTransform: 'uppercase', lineHeight: 1.2 }}>
              {businessName}
            </strong>
            <span style={getTaglineStyle(tagline)}>{tagline}</span>
          </div>

          {/* Bottom Row */}
          <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `1px solid ${primaryDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`, paddingTop: '4px' }}>
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.06em', color: effectiveSecondary }}>
                {license}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: '0.6rem', opacity: 0.75, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {effectiveFooter}
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
          boxShadow: `0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1, 0 4px 0 0 ${effectiveSecondary}`,
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: effectiveSecondary }} />
        {foilEffect}
        {/* Top Row */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '2px' }}>
          <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.02), color: '#0f172a', fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {businessName}
          </strong>
          <span
            style={{
              fontSize: '0.68rem',
              color: effectiveSecondary,
              fontWeight: 800,
              background: `${effectiveSecondary}18`,
              padding: '2px 6px',
              borderRadius: '4px',
              border: `1px solid ${effectiveSecondary}40`,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {effectiveRatingBadge}
          </span>
        </div>

        {/* Middle Content */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', minHeight: 0, margin: '4px 0' }}>
          <ContactBlock
            phone={phone}
            secondaryPhone={secondaryPhone}
            email={email}
            website={website}
            fax={fax}
            accentColor={effectiveSecondary}
            bulletText={effectiveBullet}
          />
          {includeQrCode && <CardQrVisual url={qrTargetUrl} size={66} accentColor={effectiveSecondary} />}
        </div>

        {/* Bottom Row */}
        <div
          style={{
            flexShrink: 0,
            marginTop: 'auto',
            fontSize: '0.66rem',
            color: '#64748b',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '4px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{effectiveFooter}</span>
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
                background: effectivePrimary,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                position: 'relative',
                color: primaryText,
              }}
            >
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '4px', background: effectiveSecondary }} />
              <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', maxHeight: '42px', maxWidth: '100px' }}>
                {renderBranding(primaryDark ? 'white' : 'dark', 0.85)}
              </div>
            </div>

            {/* Right 65% Information Block */}
            <div
              style={{
                width: '65%',
                padding: '1rem 1.15rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                minWidth: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: '0.6rem',
                    color: effectiveSecondary,
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    display: 'block',
                    marginBottom: '2px',
                  }}
                >
                  {effectiveBadgeLabel}
                </span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, margin: '4px 0' }}>
                <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.08), fontWeight: 900, letterSpacing: '-0.02em', color: '#0f172a', display: 'block', lineHeight: 1.2 }}>
                  {businessName}
                </strong>
                <span style={getTaglineStyle(tagline, { customFontSize: '0.68rem' })}>{tagline}</span>
              </div>

              <div style={{ flexShrink: 0, marginTop: 'auto', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: effectiveSecondary }}>
                  {license ? `${license} • Insured` : effectiveFooter}
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
          borderLeft: `8px solid ${effectiveSecondary}`,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3), 0 0 0 1px #cbd5e1',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: effectivePrimary }} />
        {foilEffect}
        {/* Top Row */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '2px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.0), fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.66rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tagline}</span>
          </div>
          <span style={{ fontSize: '0.66rem', fontWeight: 900, color: effectiveSecondary, background: `${effectiveSecondary}15`, border: `1px solid ${effectiveSecondary}33`, padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {effectiveRatingBadge}
          </span>
        </div>

        {/* Middle Content */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 0, margin: '4px 0' }}>
          <ContactBlock
            phone={phone}
            secondaryPhone={secondaryPhone}
            email={email}
            website={website}
            fax={fax}
            accentColor={effectiveSecondary}
            bulletText={effectiveBullet}
          />
          {includeQrCode && <CardQrVisual url={qrTargetUrl} size={66} accentColor={effectiveSecondary} />}
        </div>

        {/* Bottom Row */}
        <div style={{ flexShrink: 0, marginTop: 'auto', fontSize: '0.64rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '4px' }}>
          {effectiveFooter}
        </div>
        {showBleedGuides && <BleedGuides />}
      </div>
    );
  }

  // =========================================================================
  // 3. THE INDUSTRIAL HEAVY-DUTY
  // =========================================================================
  if (templateId === 'industrial') {
    const hazardStripe = `repeating-linear-gradient(45deg, ${effectiveSecondary}, ${effectiveSecondary} 8px, ${effectivePrimary} 8px, ${effectivePrimary} 16px)`;

    if (side === 'front') {
      return (
        <div
          style={{
            ...baseContainerStyle,
            background: effectivePrimary,
            color: primaryText,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.6), 0 0 0 1px ${effectiveSecondary}44, 0 4px 0 0 ${effectiveSecondary}`,
          }}
        >
          {/* Carbon Fiber Micro Texture SVG */}
          <svg style={{ position: 'absolute', inset: 0, opacity: primaryDark ? 0.22 : 0.12, pointerEvents: 'none' }} width="100%" height="100%">
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
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px', background: hazardStripe }} />
          {foilEffect}

          {/* Top Row: Logo + Badge */}
          <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', maxHeight: '34px', maxWidth: '130px' }}>
              {renderBranding(primaryDark ? 'white' : 'dark', 0.85)}
            </div>
            <span
              style={{
                background: `${effectiveSecondary}22`,
                border: `1px solid ${effectiveSecondary}`,
                color: effectiveSecondary,
                fontSize: '0.58rem',
                fontWeight: 900,
                letterSpacing: '0.08em',
                padding: '2px 6px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {effectiveBadgeLabel}
            </span>
          </div>

          {/* Middle Content: Name + Tagline */}
          <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, margin: '4px 0' }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.12), fontWeight: 900, letterSpacing: '0.03em', textTransform: 'uppercase', display: 'block', color: primaryText, lineHeight: 1.2 }}>
              {businessName}
            </strong>
            <span style={getTaglineStyle(tagline, { uppercase: true })}>
              {tagline}
            </span>
          </div>

          {/* Bottom Row: License + Spec */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2, flexShrink: 0, marginTop: 'auto', borderTop: `1px solid ${primaryDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`, paddingTop: '4px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 900, color: effectiveSecondary, letterSpacing: '0.06em' }}>
              {license}
            </span>
            <span style={{ fontSize: '0.62rem', color: primaryTextMuted, fontWeight: 800 }}>
              {effectiveFooter}
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
          background: primaryDark ? '#09090b' : '#f8fafc',
          color: primaryDark ? '#ffffff' : '#0f172a',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6), 0 0 0 1px #27272a',
        }}
      >
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: hazardStripe }} />
        {foilEffect}

        {/* Top Row */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.05), fontWeight: 900, color: primaryDark ? '#ffffff' : '#0f172a', letterSpacing: '0.02em', textTransform: 'uppercase', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {businessName}
            </strong>
            <span style={{ display: 'block', fontSize: '0.66rem', color: effectiveSecondary, fontWeight: 800 }}>
              {effectiveRatingBadge}
            </span>
          </div>
          <span style={{ background: effectiveSecondary, color: secondaryText, fontSize: '0.6rem', fontWeight: 800, padding: '2px 6px', borderRadius: '3px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {effectiveBadgeLabel}
          </span>
        </div>

        {/* Middle Content */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', minHeight: 0, margin: '4px 0' }}>
          <ContactBlock
            phone={phone}
            secondaryPhone={secondaryPhone}
            email={email}
            website={website}
            fax={fax}
            textColor={primaryDark ? '#d4d4d8' : '#334155'}
            accentColor={effectiveSecondary}
            bulletText={effectiveBullet}
          />
          {includeQrCode && <CardQrVisual url={qrTargetUrl} size={66} accentColor={effectiveSecondary} />}
        </div>

        {/* Bottom Row */}
        <div style={{ flexShrink: 0, marginTop: 'auto', fontSize: '0.62rem', color: '#71717a', borderTop: `1px solid ${primaryDark ? '#18181b' : '#e2e8f0'}`, paddingTop: '4px' }}>
          {effectiveFooter}
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
      <svg style={{ position: 'absolute', inset: 0, opacity: primaryDark ? 0.22 : 0.14, pointerEvents: 'none' }} width="100%" height="100%">
        <defs>
          <pattern id="cadGridPat" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M 16 0 L 0 0 0 16" fill="none" stroke={effectiveSecondary} strokeWidth="0.5" />
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
            background: effectivePrimary,
            color: primaryText,
            border: `2px solid ${effectiveSecondary}`,
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px ${effectiveSecondary}44`,
          }}
        >
          {cadGrid}
          {foilEffect}

          {/* Precision Architectural Title Block */}
          <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.58rem', fontFamily: 'monospace', letterSpacing: '0.1em', color: effectiveSecondary }}>
              DWG: {effectiveBadgeLabel}
            </span>
            <span style={{ fontSize: '0.56rem', fontFamily: 'monospace', color: primaryTextMuted }}>
              SCALE: 1:1 • 88.9 × 50.8mm
            </span>
          </div>

          {/* Middle Content */}
          <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', alignItems: 'center', minHeight: 0, margin: '4px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', minWidth: 0 }}>
              <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', maxHeight: '34px', maxWidth: '90px' }}>
                {renderBranding(primaryDark ? 'white' : 'dark', 0.8)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.05), fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'block', color: primaryText, lineHeight: 1.2 }}>
                  {businessName}
                </strong>
                <span style={getTaglineStyle(tagline, { customFontSize: '0.68rem' })}>{tagline}</span>
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `1px solid ${effectiveSecondary}55`, paddingTop: '4px' }}>
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: effectiveSecondary, fontWeight: 800 }}>
              {license}
            </span>
            <span style={{ fontSize: '0.6rem', color: primaryTextMuted, opacity: 0.85 }}>
              {effectiveFooter}
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
          background: effectivePrimary,
          color: primaryText,
          border: `2px solid ${effectiveSecondary}`,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {cadGrid}
        {foilEffect}

        {/* Top Row */}
        <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.02), fontWeight: 900, color: primaryText, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.62rem', color: effectiveSecondary, fontFamily: 'monospace' }}>
              {effectiveRatingBadge}
            </span>
          </div>
          <span style={{ fontSize: '0.6rem', color: effectiveSecondary, fontFamily: 'monospace', border: `1px solid ${effectiveSecondary}`, padding: '1px 6px', borderRadius: '3px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {effectiveBadgeLabel}
          </span>
        </div>

        {/* Middle Content */}
        <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', minHeight: 0, margin: '4px 0' }}>
          <ContactBlock
            phone={phone}
            secondaryPhone={secondaryPhone}
            email={email}
            website={website}
            fax={fax}
            textColor={primaryDark ? '#e0f2fe' : '#1e293b'}
            accentColor={effectiveSecondary}
            bulletText={effectiveBullet}
          />
          {includeQrCode && <CardQrVisual url={qrTargetUrl} size={66} accentColor={effectiveSecondary} />}
        </div>

        {/* Bottom Row */}
        <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, marginTop: 'auto', fontSize: '0.62rem', color: primaryTextMuted, borderTop: `1px solid ${effectiveSecondary}44`, paddingTop: '4px' }}>
          {effectiveFooter}
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
            border: `2px solid ${effectiveSecondary}`,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px ${effectiveSecondary}`,
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: effectivePrimary }} />
          {foilEffect}
          {/* Top Row */}
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
              <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', maxHeight: '28px', maxWidth: '80px' }}>
                {renderBranding('dark', 0.75)}
              </div>
              <strong style={{ fontSize: getBusinessNameFontSize(businessName, 0.98), fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{businessName}</strong>
            </div>
            <span style={{ fontSize: '0.62rem', color: effectiveSecondary, fontWeight: 900, background: `${effectiveSecondary}15`, padding: '2px 6px', borderRadius: '4px', border: `1px solid ${effectiveSecondary}33`, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {effectiveRatingBadge}
            </span>
          </div>

          {/* Middle Content */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', minHeight: 0, margin: '4px 0' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '0.62rem', color: effectiveSecondary, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>
                {effectiveBadgeLabel}
              </span>
              <strong style={{ fontSize: '0.92rem', display: 'block', color: '#0f172a', margin: '2px 0' }}>
                Scan with Phone Camera
              </strong>
              <p style={{ fontSize: '0.68rem', color: '#475569', margin: 0, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {effectiveBullet}
              </p>
            </div>
            <div style={{ flexShrink: 0 }}>
              <CardQrVisual url={qrTargetUrl} size={68} accentColor={effectiveSecondary} />
            </div>
          </div>

          {/* Bottom Row */}
          <div style={{ flexShrink: 0, marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: '2px 10px', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '4px', fontSize: '0.68rem' }}>
            <span style={{ fontWeight: 800, color: effectivePrimary }}>📞 {phone}</span>
            {secondaryPhone && <span style={{ color: '#334155' }}>📱 {secondaryPhone}</span>}
            {email && <span style={{ color: '#334155', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✉️ {email}</span>}
            <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{website}</span>
            {fax && <span style={{ color: '#64748b' }}>📠 {fax}</span>}
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
          background: effectivePrimary,
          color: primaryText,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {foilEffect}
        {/* Top Row */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.05), color: primaryText, fontWeight: 900, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.66rem', color: primaryTextMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tagline}</span>
          </div>
          <span style={{ fontSize: '0.66rem', color: effectiveSecondary, fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {effectiveBadgeLabel}
          </span>
        </div>

        {/* Middle Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, margin: '4px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: '0.7rem', color: primaryDark ? '#cbd5e1' : '#334155' }}>
            <div><span style={{ color: effectiveSecondary, fontWeight: 900 }}>✓</span> {effectiveBullet.includes('•') ? effectiveBullet.split('•')[0]?.trim() : 'Free On-Site Inspection'}</div>
            <div><span style={{ color: effectiveSecondary, fontWeight: 900 }}>✓</span> {effectiveBullet.includes('•') ? effectiveBullet.split('•')[1]?.trim() : '100% Upfront Pricing'}</div>
            <div><span style={{ color: effectiveSecondary, fontWeight: 900 }}>✓</span> {effectiveFooter.includes('•') ? effectiveFooter.split('•')[0]?.trim() : 'Clear Written Scope'}</div>
            <div><span style={{ color: effectiveSecondary, fontWeight: 900 }}>✓</span> {effectiveFooter.includes('•') ? effectiveFooter.split('•')[1]?.trim() : 'Prompt Scheduling'}</div>
          </div>
        </div>

        {/* Bottom Row */}
        <div style={{ flexShrink: 0, marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: '2px 10px', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${effectiveSecondary}44`, paddingTop: '4px', fontSize: '0.7rem' }}>
          <div style={{ fontWeight: 800, color: effectiveSecondary }}>📞 {phone}</div>
          {secondaryPhone && <div style={{ color: primaryTextMuted }}>📱 {secondaryPhone}</div>}
          {email && <div style={{ color: primaryTextMuted, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✉️ {email}</div>}
          <div style={{ color: primaryTextMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{website}</div>
          {fax && <div style={{ color: primaryTextMuted }}>📠 {fax}</div>}
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
            background: effectivePrimary,
            color: primaryText,
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px ${effectiveSecondary}44`,
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: effectiveSecondary }} />
          {foilEffect}
          {/* Top Row: Logo + Trust Shield Badge */}
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '2px' }}>
            <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', maxHeight: '34px', maxWidth: '130px' }}>
              {renderBranding(primaryDark ? 'white' : 'dark', 0.85)}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: `${effectiveSecondary}22`,
                border: `1px solid ${effectiveSecondary}`,
                borderRadius: '999px',
                padding: '2px 8px',
                color: effectiveSecondary,
                fontSize: '0.62rem',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span>🛡️</span>
              <span>{effectiveBadgeLabel}</span>
            </div>
          </div>

          {/* Middle Content: Name + Tagline + Rating */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, margin: '4px 0' }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.1), fontWeight: 900, letterSpacing: '-0.01em', display: 'block', lineHeight: 1.2 }}>
              {businessName}
            </strong>
            <span style={getTaglineStyle(tagline)}>{tagline}</span>
            <div style={{ marginTop: '4px', display: 'flex', gap: '8px', fontSize: '0.66rem', color: effectiveSecondary, fontWeight: 800, whiteSpace: 'nowrap' }}>
              <span>{effectiveBullet}</span>
            </div>
          </div>

          {/* Bottom Row: License + HOMEOWNER TRUSTED */}
          <div style={{ flexShrink: 0, marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: `1px solid ${primaryDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`, paddingTop: '4px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: effectiveSecondary }}>
              {license}
            </span>
            <span style={{ fontSize: '0.62rem', color: primaryTextMuted, fontWeight: 700 }}>
              {effectiveFooter}
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
          boxShadow: `0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px #cbd5e1, 0 4px 0 0 ${effectiveSecondary}`,
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: effectivePrimary }} />
        {foilEffect}
        {/* Top Row */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '2px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.02), fontWeight: 900, color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{businessName}</strong>
            <span style={{ display: 'block', fontSize: '0.66rem', color: effectiveSecondary, fontWeight: 800 }}>
              {effectiveRatingBadge}
            </span>
          </div>
          <span style={{ fontSize: '0.62rem', color: effectiveSecondary, fontWeight: 800, background: `${effectiveSecondary}15`, padding: '2px 6px', borderRadius: '4px', border: `1px solid ${effectiveSecondary}33`, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {effectiveBadgeLabel}
          </span>
        </div>

        {/* Middle Content */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', minHeight: 0, margin: '4px 0' }}>
          <ContactBlock
            phone={phone}
            secondaryPhone={secondaryPhone}
            email={email}
            website={website}
            fax={fax}
            accentColor={effectiveSecondary}
            textColor="#334155"
            bulletText={license ? `License: ${license}` : effectiveBullet}
          />
          {includeQrCode && <CardQrVisual url={qrTargetUrl} size={66} accentColor={effectiveSecondary} />}
        </div>

        {/* Bottom Row */}
        <div style={{ flexShrink: 0, marginTop: 'auto', fontSize: '0.62rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{effectiveFooter}</span>
          <span style={{ fontWeight: 800, color: effectiveSecondary }}>Free Consultation</span>
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
            background: effectivePrimary,
            color: primaryText,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            boxShadow: `0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px ${effectiveSecondary}44`,
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: effectiveSecondary }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: effectiveSecondary }} />
          {foilEffect}
          <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', maxHeight: '42px', maxWidth: '140px', marginBottom: '0.4rem' }}>
            {renderBranding(primaryDark ? 'white' : 'dark', 0.95)}
          </div>
          <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.15), fontWeight: 900, letterSpacing: '-0.01em', textTransform: 'uppercase', lineHeight: 1.2 }}>
            {businessName}
          </strong>
          <div style={{ maxWidth: '290px', marginTop: '3px' }}>
            <span style={getTaglineStyle(tagline)}>{tagline}</span>
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              fontSize: '0.64rem',
              letterSpacing: '0.08em',
              fontWeight: 800,
              color: effectiveSecondary,
            }}
          >
            {license || effectiveBadgeLabel}
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
          boxShadow: `0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px #cbd5e1, 0 4px 0 0 ${effectiveSecondary}`,
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: effectivePrimary }} />
        {foilEffect}
        {/* Top Row */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', gap: '8px', paddingTop: '2px' }}>
          <strong style={{ fontSize: getBusinessNameFontSize(businessName, 0.98), fontWeight: 900, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            {businessName}
          </strong>
          <span style={{ fontSize: '0.66rem', color: effectiveSecondary, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {effectiveRatingBadge}
          </span>
        </div>

        {/* Middle Content */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', minHeight: 0, margin: '4px 0' }}>
          <ContactBlock
            phone={phone}
            secondaryPhone={secondaryPhone}
            email={email}
            website={website}
            fax={fax}
            accentColor={effectiveSecondary}
            textColor="#334155"
            bulletText={effectiveBullet}
          />
          {includeQrCode && <CardQrVisual url={qrTargetUrl} size={66} accentColor={effectiveSecondary} />}
        </div>

        {/* Bottom Row */}
        <div style={{ flexShrink: 0, marginTop: 'auto', fontSize: '0.64rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{effectiveFooter}</span>
          <span style={{ fontWeight: 800, color: effectiveSecondary }}>{license}</span>
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
        background: side === 'front' ? effectivePrimary : '#ffffff',
        color: side === 'front' ? primaryText : '#0f172a',
        border: `3px double ${effectiveSecondary}`,
        boxShadow: `0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px ${effectiveSecondary}33`,
      }}
    >
      {/* Concentric Traditional Hairline Inset Border */}
      <div
        style={{
          position: 'absolute',
          inset: '6px',
          border: `1px solid ${effectiveSecondary}`,
          borderRadius: '7px',
          opacity: 0.65,
          pointerEvents: 'none',
        }}
      />
      {foilEffect}

      {side === 'front' ? (
        <>
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <span style={{ fontSize: '0.56rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: effectiveSecondary, fontWeight: 800 }}>
              {effectiveBadgeLabel}
            </span>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0, textAlign: 'center', position: 'relative', zIndex: 2, margin: '2px 0' }}>
            <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', maxHeight: '32px', maxWidth: '120px', marginBottom: '2px' }}>
              {renderBranding(primaryDark ? 'white' : 'dark', 0.82)}
            </div>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.1), fontWeight: 700, letterSpacing: '0.04em', display: 'block', textTransform: 'uppercase', lineHeight: 1.2 }}>
              {businessName}
            </strong>
            <div style={{ fontSize: '0.62rem', color: effectiveSecondary, margin: '2px 0' }}>♦ ♦ ♦</div>
            <div style={{ maxWidth: '280px' }}>
              <span style={getTaglineStyle(tagline, { customFontSize: '0.68rem' })}>{tagline}</span>
            </div>
          </div>

          <div style={{ flexShrink: 0, marginTop: 'auto', textAlign: 'center' }}>
            <span style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: primaryTextMuted }}>
              {license ? `${license} • ${effectiveFooter}` : effectiveFooter}
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={{ flexShrink: 0, textAlign: 'center', borderBottom: `1px solid ${effectiveSecondary}`, paddingBottom: '3px' }}>
            <strong style={{ fontSize: getBusinessNameFontSize(businessName, 1.02), fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {businessName}
            </strong>
            <span style={{ display: 'block', fontSize: '0.64rem', fontStyle: 'italic', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tagline}</span>
          </div>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem', minHeight: 0, margin: '4px 0' }}>
            <ContactBlock
              phone={phone}
              secondaryPhone={secondaryPhone}
              email={email}
              website={website}
              fax={fax}
              accentColor={effectiveSecondary}
              textColor="#334155"
              bulletText={effectiveBullet}
            />
            {includeQrCode && <CardQrVisual url={qrTargetUrl} size={66} accentColor={effectiveSecondary} />}
          </div>

          <div style={{ flexShrink: 0, marginTop: 'auto', textAlign: 'center', fontSize: '0.6rem', color: effectiveSecondary, fontStyle: 'italic' }}>
            {effectiveRatingBadge} • {effectiveFooter}
          </div>
        </>
      )}
      {showBleedGuides && <BleedGuides />}
    </div>
  );
}
