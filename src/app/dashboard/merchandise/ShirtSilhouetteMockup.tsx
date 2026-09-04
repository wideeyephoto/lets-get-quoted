'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { getProductStudioPhoto } from '@/lib/merchandise/mockup-assets';

interface Props {
  type: 't_shirt' | 'polo';
  viewAngle: 'front' | 'back' | 'detail' | 'angle';
  colorHex: string;
  colorId?: string;
  darkText?: boolean;
  businessName: string;
  tagline: string;
  phone: string;
  license: string;
  accentColor: string;
  glareX: number;
  glareY: number;
  renderBranding: (mode?: 'color' | 'dark' | 'white', scale?: number) => React.ReactNode;
}

export default function ShirtSilhouetteMockup({
  type,
  viewAngle,
  colorHex,
  colorId = 'black',
  darkText = false,
  businessName,
  tagline,
  phone,
  license,
  accentColor,
  glareX,
  glareY,
  renderBranding,
}: Props) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const isPolo = type === 'polo';
  const isBackView = viewAngle === 'back';
  const isDetailView = viewAngle === 'detail';
  const isAngleView = viewAngle === 'angle';

  const productId = isPolo ? 'polos' : 't_shirts';
  const { photoUrl } = getProductStudioPhoto(productId, colorId, viewAngle);

  // Determine imprint color mode based on fabric darkness
  const imprintMode = darkText ? 'color' : 'white';

  return (
    <div
      style={{
        position: 'relative',
        width: '580px',
        height: '560px',
        maxWidth: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transformStyle: 'preserve-3d',
        transition: 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        transform: isDetailView
          ? 'scale(1.48) translateY(12%)'
          : isAngleView
          ? 'rotateY(-14deg) rotateX(6deg) scale(1.02)'
          : 'scale(1)',
      }}
    >
      {/* 1. Real Studio Garment Photograph Canvas */}
      <div
        style={{
          position: 'relative',
          width: '520px',
          height: '520px',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
          background: 'transparent',
        }}
      >
        {/* The Official Printful High-Resolution Studio Photograph */}
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={`${isPolo ? 'Polo' : 'T-Shirt'} - ${colorId}`}
            onLoad={() => setImageLoaded(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              filter: `drop-shadow(0 15px 25px rgba(0, 0, 0, 0.5)) contrast(1.04) brightness(1.02)`,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: colorHex,
              borderRadius: '16px',
            }}
          />
        )}

        {/* Dynamic Studio Lighting Glare & Sheen Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(ellipse 360px 280px at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.14) 0%, transparent 65%)`,
            mixBlendMode: 'screen',
            transition: 'background 0.05s ease',
          }}
        />

        {/* ================================================================= */}
        {/* 2. FRONT VIEW IMPRINT (T-Shirt or Polo)                           */}
        {/* ================================================================= */}
        {!isBackView && (
          <>
            {/* A. Left Chest Brand Mark */}
            <div
              style={{
                position: 'absolute',
                top: isPolo ? '35%' : '33%',
                left: isPolo ? '34%' : '33%',
                width: isPolo ? '110px' : '105px',
                zIndex: 10,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'translate(-50%, -50%)',
                // For Polos: 3D High-Density Machine Embroidery Effect
                // For T-Shirts: Screen Print / Direct-to-Film Plastisol Ink Effect
                filter: isPolo
                  ? `drop-shadow(0 2px 2.5px rgba(0, 0, 0, 0.75)) drop-shadow(0 -0.8px 0.5px rgba(255, 255, 255, 0.35))`
                  : darkText
                  ? `drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3))`
                  : `drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))`,
              }}
            >
              {/* Logo / Brand Mark */}
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  mixBlendMode: darkText && !isPolo ? 'multiply' : 'normal',
                }}
              >
                {renderBranding(imprintMode, isPolo ? 0.75 : 0.78)}
              </div>

              {/* High-Density Embroidery Micro Thread Sheen Label (for Polos) */}
              {isPolo && (
                <div
                  style={{
                    marginTop: '2px',
                    fontSize: '0.48rem',
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    color: darkText ? '#1e293b' : '#f8fafc',
                    textTransform: 'uppercase',
                    opacity: 0.85,
                    textShadow: darkText
                      ? '0 1px 0 rgba(255,255,255,0.4)'
                      : '0 1px 2px rgba(0,0,0,0.8)',
                  }}
                >
                  {businessName.slice(0, 16).toUpperCase()}
                </div>
              )}
            </div>

            {/* B. Inner Collar Brand Stamp (Subtle Heat-Transfer Neck Tag) */}
            <div
              style={{
                position: 'absolute',
                top: isPolo ? '18%' : '15%',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 8,
                textAlign: 'center',
                pointerEvents: 'none',
                opacity: 0.55,
              }}
            >
              <div
                style={{
                  fontSize: '0.48rem',
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                  color: darkText ? '#334155' : '#cbd5e1',
                  textTransform: 'uppercase',
                }}
              >
                {businessName.slice(0, 18).toUpperCase()}
              </div>
              <div
                style={{
                  fontSize: '0.42rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: darkText ? '#64748b' : '#94a3b8',
                }}
              >
                {isPolo ? 'PRO FLEET PIQUE • L' : '100% RING-SPUN COTTON • L'}
              </div>
            </div>
          </>
        )}

        {/* ================================================================= */}
        {/* 3. BACK VIEW IMPRINT: TRADESMAN BILLBOARD (T-Shirt or Polo)        */}
        {/* ================================================================= */}
        {isBackView && (
          <div
            style={{
              position: 'absolute',
              top: isPolo ? '26%' : '24%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: isPolo ? '260px' : '280px',
              zIndex: 10,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '0.75rem',
              boxSizing: 'border-box',
              filter: isPolo
                ? `drop-shadow(0 2px 3px rgba(0, 0, 0, 0.7))`
                : darkText
                ? `drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25))`
                : `drop-shadow(0 2px 4px rgba(0, 0, 0, 0.85))`,
            }}
          >
            {/* Top Billboard Contractor Crest */}
            <div
              style={{
                width: isPolo ? '120px' : '140px',
                marginBottom: '0.5rem',
                mixBlendMode: darkText && !isPolo ? 'multiply' : 'normal',
              }}
            >
              {renderBranding(imprintMode, isPolo ? 0.85 : 0.95)}
            </div>

            {/* Bold Tradesman Business Headline */}
            <div
              style={{
                fontSize: isPolo ? '1.05rem' : '1.2rem',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: darkText ? '#0f172a' : '#ffffff',
                textTransform: 'uppercase',
                textShadow: darkText
                  ? 'none'
                  : '0 2px 4px rgba(0, 0, 0, 0.75), 0 0 12px rgba(0, 0, 0, 0.5)',
              }}
            >
              {businessName}
            </div>

            {/* Specialty / Services Line */}
            {tagline && (
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  marginTop: '4px',
                  color: accentColor,
                  textTransform: 'uppercase',
                }}
              >
                {tagline}
              </div>
            )}

            {/* Big Contact Phone Number (Legible from 30ft away on jobsites) */}
            {phone && (
              <div
                style={{
                  marginTop: '0.65rem',
                  padding: '0.35rem 1rem',
                  borderRadius: '6px',
                  background: darkText ? '#0f172a' : 'rgba(255, 255, 255, 0.12)',
                  color: darkText ? '#ffffff' : '#ffffff',
                  border: darkText ? 'none' : '1px solid rgba(255, 255, 255, 0.25)',
                  fontSize: '0.95rem',
                  fontWeight: 900,
                  letterSpacing: '0.05em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <span>📞</span>
                <span>{phone}</span>
              </div>
            )}

            {/* License & Insured Verification Badge */}
            {license && (
              <div
                style={{
                  marginTop: '0.45rem',
                  fontSize: '0.64rem',
                  fontWeight: 900,
                  letterSpacing: '0.08em',
                  color: darkText ? '#475569' : '#cbd5e1',
                  textTransform: 'uppercase',
                }}
              >
                {license} • LICENSED &amp; INSURED
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
