'use client';

import { useState, useRef, useId } from 'react';
import type { MerchandiseProduct, MockupViewAngle } from '@/lib/merchandise/types';
import ShirtSilhouetteMockup from './ShirtSilhouetteMockup';
import Html5ProductCanvasCaster from './Html5ProductCanvasCaster';
import { getProductStudioPhoto } from '@/lib/merchandise/mockup-assets';

interface Props {
  product: MerchandiseProduct;
  activeColor: { id: string; name: string; hex: string; darkText?: boolean };
  activeTier: { quantity: number; unitPrice: number; totalPrice: number };
  viewAngle: MockupViewAngle;
  setViewAngle: (angle: MockupViewAngle) => void;
  backdropTheme: 'clean' | 'dark' | 'jobsite';
  setBackdropTheme: (theme: 'clean' | 'dark' | 'jobsite') => void;
  includeQrCode: boolean;
  selectedFinish: string;
  selectedModel: string;
  businessName: string;
  tagline: string;
  phone: string;
  website: string;
  license: string;
  accentColor: string;
  secondaryColor: string;
  renderBranding: (mode?: 'color' | 'dark' | 'white', scale?: number) => React.ReactNode;
  logoSrc?: string;
  onExportReady?: (exportFn: () => Promise<string>) => void;
}

export default function Product3DMockupStage({
  product,
  activeColor,
  activeTier,
  viewAngle,
  setViewAngle,
  backdropTheme,
  setBackdropTheme,
  includeQrCode,
  selectedFinish,
  selectedModel,
  businessName,
  tagline,
  phone,
  website,
  license,
  accentColor,
  secondaryColor,
  renderBranding,
  logoSrc = '',
  onExportReady,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<{ rotX: number; rotY: number; glareX: number; glareY: number }>({
    rotX: 0,
    rotY: 0,
    glareX: 50,
    glareY: 50,
  });
  const [isInteractiveTilt, setIsInteractiveTilt] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [showBleedGuides, setShowBleedGuides] = useState(false);

  // Unique IDs for SVG gradients & filters
  const filterId = useId();

  // Mouse move handler for realistic 3D tilt and specular lighting sheen
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isInteractiveTilt || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const normX = (x / rect.width) * 2 - 1; // -1 to +1
    const normY = (y / rect.height) * 2 - 1; // -1 to +1

    // Maximum tilt angles
    const maxRotX = 14;
    const maxRotY = 16;

    setTilt({
      rotX: -normY * maxRotX,
      rotY: normX * maxRotY,
      glareX: Math.round((x / rect.width) * 100),
      glareY: Math.round((y / rect.height) * 100),
    });
  }

  function handleMouseLeave() {
    setIsHovered(false);
    setTilt({ rotX: 0, rotY: 0, glareX: 50, glareY: 50 });
  }

  function handleMouseEnter() {
    setIsHovered(true);
  }

  // Calculate compound 3D transform based on active view angle + mouse tilt
  const baseRotation =
    viewAngle === 'angle'
      ? { x: 12, y: -22, z: 0, scale: 1.0 }
      : viewAngle === 'detail'
      ? { x: 4, y: -6, z: 0, scale: 1.35 }
      : { x: 0, y: 0, z: 0, scale: 1.0 };

  const finalRotX = baseRotation.x + tilt.rotX;
  const finalRotY = baseRotation.y + tilt.rotY;
  const finalScale = baseRotation.scale;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* 1. Stage Top Controls Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '0.85rem',
        }}
      >
        {/* View Angle Switcher */}
        <div
          style={{
            display: 'flex',
            gap: '0.35rem',
            background: 'rgba(11, 15, 23, 0.85)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {product.supportedViews.map((vw) => (
            <button
              key={vw}
              type="button"
              onClick={() => setViewAngle(vw)}
              aria-pressed={viewAngle === vw}
              aria-label={`Switch to ${vw} view`}
              className="focus-ring"
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '7px',
                border: 'none',
                background: viewAngle === vw ? 'var(--accent)' : 'transparent',
                color: viewAngle === vw ? '#ffffff' : 'var(--muted)',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>
                {vw === 'front'
                  ? '👁️ Front View'
                  : vw === 'back'
                  ? '🔄 Back View'
                  : vw === 'detail'
                  ? '🔍 Macro Detail'
                  : '📐 3D Angle'}
              </span>
            </button>
          ))}
        </div>

        {/* Right Stage Tools: Bleed Guides + Lighting + 3D Tilt */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Safe Zone & Print Bleed Overlay Toggle */}
          <button
            type="button"
            onClick={() => setShowBleedGuides((prev) => !prev)}
            aria-pressed={showBleedGuides}
            aria-label="Toggle print safe zone and bleed guides"
            className="focus-ring"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.38rem 0.75rem',
              borderRadius: '7px',
              border: showBleedGuides ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.12)',
              background: showBleedGuides ? 'rgba(255, 122, 33, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              color: showBleedGuides ? '#ffffff' : 'var(--muted)',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>📐</span>
            <span>{showBleedGuides ? 'Bleed Guides: ON' : 'Bleed Guides: OFF'}</span>
          </button>

          {/* Interactive Gyro/Tilt Toggle */}
          <button
            type="button"
            onClick={() => setIsInteractiveTilt((prev) => !prev)}
            aria-pressed={isInteractiveTilt}
            aria-label="Toggle interactive mouse 3D tilt"
            className="focus-ring"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.38rem 0.75rem',
              borderRadius: '7px',
              border: isInteractiveTilt ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.12)',
              background: isInteractiveTilt ? 'rgba(255, 122, 33, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              color: isInteractiveTilt ? '#ffffff' : 'var(--muted)',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <span>🎯</span>
            <span>{isInteractiveTilt ? 'Mouse 3D Tilt: Active' : 'Tilt: Locked'}</span>
          </button>

          {/* Lighting Environment */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'rgba(11, 15, 23, 0.85)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <button
              type="button"
              onClick={() => setBackdropTheme('clean')}
              aria-pressed={backdropTheme === 'clean'}
              aria-label="Set studio clean lighting"
              title="Studio Clean: Neutral 5000K daylight showroom lighting"
              className="focus-ring"
              style={{
                padding: '3px 8px',
                borderRadius: '5px',
                border: 'none',
                background: backdropTheme === 'clean' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: backdropTheme === 'clean' ? '#ffffff' : '#94a3b8',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Studio
            </button>
            <button
              type="button"
              onClick={() => setBackdropTheme('dark')}
              aria-pressed={backdropTheme === 'dark'}
              aria-label="Set dark spotlight lighting"
              title="Dark Carbon: High contrast theatrical spotlight"
              className="focus-ring"
              style={{
                padding: '3px 8px',
                borderRadius: '5px',
                border: 'none',
                background: backdropTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: backdropTheme === 'dark' ? '#ffffff' : '#94a3b8',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Dark
            </button>
            <button
              type="button"
              onClick={() => setBackdropTheme('jobsite')}
              aria-pressed={backdropTheme === 'jobsite'}
              aria-label="Set jobsite warm daylight lighting"
              title="Jobsite Daylight: Warm golden hour outdoor contrast"
              className="focus-ring"
              style={{
                padding: '3px 8px',
                borderRadius: '5px',
                border: 'none',
                background: backdropTheme === 'jobsite' ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                color: backdropTheme === 'jobsite' ? '#ffffff' : '#94a3b8',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Jobsite
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive 3D Canvas Stage */}
      <div
        ref={stageRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width: '100%',
          minHeight: '520px',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          background:
            backdropTheme === 'clean'
              ? 'radial-gradient(ellipse at 50% 35%, #1e293b 0%, #0b101b 100%)'
              : backdropTheme === 'dark'
              ? 'radial-gradient(ellipse at 50% 30%, #171d29 0%, #03060a 100%)'
              : 'radial-gradient(ellipse at 50% 30%, #2e261d 0%, #0c0a08 100%)',
          boxShadow: '0 30px 70px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2.5rem',
          position: 'relative',
          overflow: 'hidden',
          perspective: '1400px',
          cursor: isInteractiveTilt ? 'grab' : 'default',
        }}
      >
        {/* Dynamic Studio Ambient Spotlight Reflection based on mouse coordinates */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(circle 380px at ${tilt.glareX}% ${tilt.glareY}%, rgba(255, 255, 255, ${
              backdropTheme === 'clean' ? '0.08' : '0.05'
            }), transparent 70%)`,
            zIndex: 1,
            transition: 'opacity 0.2s ease',
          }}
        />

        {/* Studio Floor Shadow Ellipse */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            width: '540px',
            height: '45px',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.65) 0%, rgba(0, 0, 0, 0) 75%)',
            pointerEvents: 'none',
            transform: `scale(${1 + tilt.rotY * 0.01}) translateY(${tilt.rotX * 0.8}px)`,
            zIndex: 1,
          }}
        />

        {/* 3D Transform Object Holder */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            transformStyle: 'preserve-3d',
            transform: `rotateX(${finalRotX}deg) rotateY(${finalRotY}deg) scale(${finalScale})`,
            transition: isHovered ? 'transform 0.08s ease-out' : 'transform 0.4s ease-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: '680px',
          }}
        >
          {/* Specular Sheen Filter SVG definitions */}
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              {/* Cloth weave pattern */}
              <pattern id={`${filterId}-weave`} width="6" height="6" patternUnits="userSpaceOnUse">
                <path d="M0 3 L6 3 M3 0 L3 6" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
              {/* Trucker mesh hexagonal pattern */}
              <pattern id={`${filterId}-mesh`} width="10" height="10" patternUnits="userSpaceOnUse">
                <circle cx="5" cy="5" r="2.2" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
              </pattern>
            </defs>
          </svg>

          {/* ========================================================================= */}
          {/* 1. BUSINESS CARDS MOCKUP */}
          {/* ========================================================================= */}
          {/* ========================================================================= */}
          {/* 1. BUSINESS CARDS MOCKUP */}
          {/* ========================================================================= */}
          {product.id === 'biz_cards' && (() => {
            const renderBleedGuides = () => (
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
                {/* Corner Crop Marks (L-brackets at trim corners) */}
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

            const renderFrontCard = (customStyle?: React.CSSProperties) => (
              <div
                style={{
                  width: '370px',
                  height: '215px',
                  borderRadius: '12px',
                  background: activeColor.hex,
                  color: activeColor.darkText ? '#0f172a' : '#ffffff',
                  boxShadow: `
                    0 25px 50px -12px rgba(0,0,0,0.5),
                    0 0 0 1px rgba(255,255,255,0.15),
                    0 4px 0 0 ${accentColor}
                  `,
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxSizing: 'border-box',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s ease, transform 0.3s ease',
                  ...customStyle,
                }}
              >
                {/* Velvet Lamination Matte Texture & Painted Edge Accent */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: accentColor }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: 'rgba(255,255,255,0.1)' }} />

                {/* Spot UV Gleam Streak */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-50%',
                    left: `${tilt.glareX - 25}%`,
                    width: '60px',
                    height: '200%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
                    transform: 'rotate(25deg)',
                    pointerEvents: 'none',
                  }}
                />

                {/* Front Branding & Raised Spot UV Finish */}
                <div style={{ position: 'relative', zIndex: 2 }}>
                  {renderBranding(activeColor.darkText ? 'color' : 'white', 0.88)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 2 }}>
                  <div>
                    <strong style={{ fontSize: '0.92rem', display: 'block', letterSpacing: '-0.01em' }}>{businessName}</strong>
                    <span style={{ fontSize: '0.72rem', opacity: 0.85, fontWeight: 600 }}>{tagline}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.06em', color: accentColor }}>
                      {license}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.62rem', opacity: 0.7, fontWeight: 700 }}>
                      16PT VELVET FINISH
                    </span>
                  </div>
                </div>

                {showBleedGuides && renderBleedGuides()}
              </div>
            );

            const renderBackCard = (customStyle?: React.CSSProperties) => (
              <div
                style={{
                  width: '370px',
                  height: '215px',
                  borderRadius: '12px',
                  background: '#ffffff',
                  color: '#0f172a',
                  boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px #cbd5e1, 0 4px 0 0 #94a3b8',
                  padding: '1.4rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxSizing: 'border-box',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'box-shadow 0.2s ease, transform 0.3s ease',
                  ...customStyle,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '1.02rem', color: '#1e3a8a', fontWeight: 900 }}>{businessName}</strong>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: '#16a34a',
                      fontWeight: 900,
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
                    <div style={{ color: '#2563eb', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🌐 {website}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
                      Fast Estimates • Licensed &amp; Insured
                    </div>
                  </div>

                  {includeQrCode && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                      <div
                        style={{
                          width: '74px',
                          height: '74px',
                          background: '#0f172a',
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontSize: '0.62rem',
                          fontWeight: 900,
                          textAlign: 'center',
                          padding: '4px',
                          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                        }}
                      >
                        <span>📱 SCAN TO</span>
                        <span style={{ color: '#38bdf8' }}>BOOK NOW</span>
                        <span style={{ fontSize: '0.52rem', opacity: 0.8, marginTop: '2px' }}>INSTANT</span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.52rem',
                          color: '#475569',
                          maxWidth: '85px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textAlign: 'center',
                          fontWeight: 700,
                          display: 'block',
                        }}
                        title={website.startsWith('http') ? website : `https://${website}`}
                      >
                        {website.replace(/^https?:\/\//, '')}
                      </span>
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
                  <span>Residential &amp; Commercial Specialist</span>
                  <span style={{ fontWeight: 800 }}>Free Consultation</span>
                </div>

                {showBleedGuides && renderBleedGuides()}
              </div>
            );

            return (
              <div
                style={{
                  display: 'flex',
                  gap: '2.5rem',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  alignItems: 'center',
                  transformStyle: 'preserve-3d',
                  width: '100%',
                }}
              >
                {viewAngle === 'front' && renderFrontCard({ transform: 'translateZ(25px)' })}
                {viewAngle === 'back' && renderBackCard({ transform: 'translateZ(25px)' })}
                {viewAngle === 'angle' && (
                  <>
                    {renderFrontCard({ transform: 'translateZ(35px) rotateY(-12deg) rotateX(4deg)' })}
                    {renderBackCard({ transform: 'translateZ(10px) rotateY(8deg) rotateX(2deg)' })}
                  </>
                )}
                {viewAngle === 'detail' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ transform: 'scale(1.28) translateZ(35px)', transformOrigin: 'center' }}>
                      {renderFrontCard()}
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: '#94a3b8',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        background: 'rgba(0,0,0,0.5)',
                        padding: '3px 10px',
                        borderRadius: '999px',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      🔍 MACRO ZOOM • 16PT VELVET SOFT TOUCH &amp; RAISED SPOT-UV GLOSS
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* 2. EMBROIDERED WORK POLO MOCKUP (HTML5 Canvas Casting Engine)             */}
          {/* ========================================================================= */}
          {product.id === 'polos' && (
            <Html5ProductCanvasCaster
              productId="polos"
              viewAngle={viewAngle}
              colorHex={activeColor.hex}
              colorId={activeColor.id}
              darkText={activeColor.darkText}
              businessName={businessName}
              tagline={tagline}
              phone={phone}
              website={website}
              license={license}
              accentColor={accentColor}
              secondaryColor={secondaryColor}
              logoSrc={logoSrc}
              onExportReady={onExportReady}
              glareX={tilt.glareX}
              glareY={tilt.glareY}
            />
          )}

          {/* ========================================================================= */}
          {/* 3. HEAVYWEIGHT T-SHIRT MOCKUP (HTML5 Canvas Casting Engine)               */}
          {/* ========================================================================= */}
          {product.id === 't_shirts' && (
            <Html5ProductCanvasCaster
              productId="t_shirts"
              viewAngle={viewAngle}
              colorHex={activeColor.hex}
              colorId={activeColor.id}
              darkText={activeColor.darkText}
              businessName={businessName}
              tagline={tagline}
              phone={phone}
              website={website}
              license={license}
              accentColor={accentColor}
              secondaryColor={secondaryColor}
              logoSrc={logoSrc}
              onExportReady={onExportReady}
              glareX={tilt.glareX}
              glareY={tilt.glareY}
            />
          )}

          {/* ========================================================================= */}
          {/* 4. RICHARDSON 112 TRUCKER SNAPBACK HAT (HTML5 Canvas Casting Engine)      */}
          {/* ========================================================================= */}
          {product.id === 'hats' && (
            <Html5ProductCanvasCaster
              productId="hats"
              viewAngle={viewAngle}
              colorHex={activeColor.hex}
              colorId={activeColor.id}
              darkText={activeColor.darkText}
              businessName={businessName}
              tagline={tagline}
              phone={phone}
              website={website}
              license={license}
              accentColor={accentColor}
              secondaryColor={secondaryColor}
              logoSrc={logoSrc}
              onExportReady={onExportReady}
              glareX={tilt.glareX}
              glareY={tilt.glareY}
            />
          )}

          {/* ========================================================================= */}
          {/* 5. NOTEPAD & ESTIMATING FORMS MOCKUP */}
          {/* ========================================================================= */}
          {product.id === 'notepads' && (
            <div
              style={{
                width: '380px',
                height: '470px',
                background: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 25px 50px rgba(0,0,0,0.35), 0 0 0 1px #cbd5e1, 0 8px 0 0 #475569',
                display: 'flex',
                flexDirection: 'column',
                padding: '1.5rem',
                boxSizing: 'border-box',
                position: 'relative',
                transformStyle: 'preserve-3d',
                transform: 'translateZ(20px)',
              }}
            >
              {/* Heavy Blue Leatherette Binding Spine Tape */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '28px',
                  background: 'linear-gradient(90deg, #1e3a8a, #2563eb, #1e3a8a)',
                  borderRadius: '10px 10px 0 0',
                  color: '#ffffff',
                  fontSize: '0.68rem',
                  fontWeight: 900,
                  textAlign: 'center',
                  lineHeight: '28px',
                  letterSpacing: '0.08em',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                SERIALIZED 2-PART NCR CARBONLESS WORK ORDER PAD
              </div>

              {/* Perforation Line */}
              <div
                style={{
                  position: 'absolute',
                  top: '32px',
                  left: 0,
                  right: 0,
                  height: '1px',
                  borderBottom: '1px dashed #94a3b8',
                }}
              />

              {/* Form Header */}
              <div style={{ marginTop: '1.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ maxWidth: '190px' }}>{renderBranding('color', 0.7)}</div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: 900 }}>JOB ESTIMATE</strong>
                  <span style={{ display: 'block', fontSize: '0.74rem', color: '#dc2626', fontWeight: 900 }}>#EST-89421</span>
                  <span style={{ fontSize: '0.62rem', color: '#64748b' }}>DATE: {new Date().toLocaleDateString()}</span>
                </div>
              </div>

              {/* Customer Jobsite Fields */}
              <div
                style={{
                  marginTop: '0.85rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '0.5rem',
                  fontSize: '0.74rem',
                  background: '#f8fafc',
                }}
              >
                <div><strong>Customer Name:</strong> ____________________________ <strong>Phone:</strong> _________</div>
                <div style={{ marginTop: '4px' }}><strong>Jobsite Address:</strong> ___________________________________________</div>
              </div>

              {/* Line Item Grid */}
              <div style={{ marginTop: '0.75rem', flex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{ background: '#0f172a', color: '#ffffff', padding: '5px 8px', fontSize: '0.68rem', fontWeight: 900, display: 'flex', justifyContent: 'space-between' }}>
                  <span>DESCRIPTION OF SCOPE &amp; MATERIALS</span>
                  <span>AMOUNT</span>
                </div>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} style={{ borderTop: '1px dashed #e2e8f0', height: '26px', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.7rem', color: '#64748b' }}>
                    <span style={{ opacity: 0.5 }}>{n}.</span>
                  </div>
                ))}
              </div>

              {/* Signature Box & Legal Authorization */}
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '0.72rem', color: '#334155' }}>
                <div>
                  <span style={{ display: 'block', fontWeight: 700 }}>Customer Authorization: __________________</span>
                  <span style={{ fontSize: '0.58rem', color: '#94a3b8' }}>Work authorized per standard terms on reverse.</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#16a34a' }}>TOTAL: $_______</span>
                </div>
              </div>

              {/* Yellow Duplicate Copy Peeking Out from Corner */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '-8px',
                  right: '-8px',
                  width: '60px',
                  height: '60px',
                  background: '#fef08a',
                  border: '1px solid #fde047',
                  borderRadius: '0 0 10px 0',
                  transform: 'rotate(-4deg)',
                  zIndex: -1,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                }}
              />
            </div>
          )}

          {/* ========================================================================= */}
          {/* 6. EXECUTIVE METAL PEN MOCKUP */}
          {/* ========================================================================= */}
          {product.id === 'pens' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.8rem',
                width: '100%',
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Cylindrical 3D Machined Aluminum Pen Barrel */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '580px',
                  height: '42px',
                  borderRadius: '21px',
                  background: `linear-gradient(180deg, rgba(255,255,255,0.4) 0%, ${activeColor.hex} 40%, #090d16 100%)`,
                  boxShadow: '0 16px 36px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 1.5rem',
                  boxSizing: 'border-box',
                  border: '1px solid rgba(255,255,255,0.2)',
                  position: 'relative',
                  transform: 'translateZ(30px)',
                }}
              >
                {/* Soft Silicone Capacitive Stylus Tip */}
                <div
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: '#334155',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)',
                  }}
                />

                {/* Laser-Engraved Mirror Silver Lettering */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.25rem',
                    color: '#f8fafc',
                    textShadow: '0 0 4px rgba(255,255,255,0.6)',
                  }}
                >
                  <strong style={{ fontSize: '0.9rem', letterSpacing: '0.1em' }}>
                    {businessName.toUpperCase()}
                  </strong>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800 }}>📞 {phone}</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>{website}</span>
                </div>

                {/* Mirror Electroplated Chrome Clip */}
                <div
                  style={{
                    width: '55px',
                    height: '7px',
                    borderRadius: '4px',
                    background: 'linear-gradient(90deg, #94a3b8, #ffffff, #64748b)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                  }}
                />
              </div>

              <span style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.08em' }}>
                AIRCRAFT ANODIZED ALUMINUM • 1064nm FIBER LASER ENGRAVED SILVER CORE
              </span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 7. RUGGED ARMOR PHONE CASE (HTML5 Canvas Casting Engine)                  */}
          {/* ========================================================================= */}
          {product.id === 'phone_cases' && (
            <Html5ProductCanvasCaster
              productId="phone_cases"
              viewAngle={viewAngle}
              colorHex={activeColor.hex}
              colorId={activeColor.id}
              darkText={activeColor.darkText}
              businessName={businessName}
              tagline={tagline}
              phone={phone}
              website={website}
              license={license}
              accentColor={accentColor}
              secondaryColor={secondaryColor}
              logoSrc={logoSrc}
              onExportReady={onExportReady}
              glareX={tilt.glareX}
              glareY={tilt.glareY}
            />
          )}

          {/* ========================================================================= */}
          {/* 8. CORRUGATED WEATHERPROOF YARD SIGNS MOCKUP */}
          {/* ========================================================================= */}
          {product.id === 'yard_signs' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transformStyle: 'preserve-3d' }}>
              {/* 18"x24" Outdoor Coroplast Panel in 3D */}
              <div
                style={{
                  width: '480px',
                  height: '330px',
                  borderRadius: '10px',
                  background: activeColor.hex,
                  color: activeColor.darkText ? '#0f172a' : '#ffffff',
                  border: '3.5px solid #cbd5e1',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                  padding: '1.85rem',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  textAlign: 'center',
                  transform: 'translateZ(20px)',
                  position: 'relative',
                }}
              >
                {/* 4mm Fluting Ridge Texture along top */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    left: '10px',
                    right: '10px',
                    height: '4px',
                    backgroundImage: 'repeating-linear-gradient(90deg, #94a3b8 0px, #94a3b8 2px, transparent 2px, transparent 6px)',
                  }}
                />

                <div style={{ maxWidth: '300px' }}>{renderBranding(activeColor.darkText ? 'color' : 'white', 0.88)}</div>

                <div>
                  <h2 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                    {businessName.toUpperCase()}
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.98rem', fontWeight: 800 }}>{tagline}</p>
                </div>

                {/* Oversized High-Contrast Phone Badge */}
                <div
                  style={{
                    background: '#16a34a',
                    color: '#ffffff',
                    padding: '0.55rem 1.85rem',
                    borderRadius: '8px',
                    fontSize: '1.45rem',
                    fontWeight: 900,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                    letterSpacing: '0.04em',
                  }}
                >
                  📞 {phone}
                </div>

                <div style={{ fontSize: '0.76rem', fontWeight: 900, letterSpacing: '0.08em', color: activeColor.darkText ? '#334155' : '#e2e8f0' }}>
                  PROUDLY SERVING YOUR NEIGHBORHOOD • 5-STAR RATED
                </div>
              </div>

              {/* Welded Galvanized Zinc 9-Gauge Steel H-Stake */}
              <div style={{ display: 'flex', gap: '90px', marginTop: '-3px', zIndex: -1 }}>
                <div style={{ width: '7px', height: '120px', background: 'linear-gradient(180deg, #94a3b8, #64748b)', boxShadow: '2px 0 4px rgba(0,0,0,0.4)' }} />
                <div style={{ width: '7px', height: '120px', background: 'linear-gradient(180deg, #94a3b8, #64748b)', boxShadow: '2px 0 4px rgba(0,0,0,0.4)' }} />
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 9. STAINLESS STEEL VACUUM TUMBLER (HTML5 Canvas Casting Engine)           */}
          {/* ========================================================================= */}
          {product.id === 'tumblers' && (
            <Html5ProductCanvasCaster
              productId="tumblers"
              viewAngle={viewAngle}
              colorHex={activeColor.hex}
              colorId={activeColor.id}
              darkText={activeColor.darkText}
              businessName={businessName}
              tagline={tagline}
              phone={phone}
              website={website}
              license={license}
              accentColor={accentColor}
              secondaryColor={secondaryColor}
              logoSrc={logoSrc}
              onExportReady={onExportReady}
              glareX={tilt.glareX}
              glareY={tilt.glareY}
            />
          )}

          {/* ========================================================================= */}
          {/* 10. VEHICLE DECALS & DOOR MAGNETS MOCKUP */}
          {/* ========================================================================= */}
          {product.id === 'decals' && (
            <div
              style={{
                width: '500px',
                height: '250px',
                borderRadius: '18px',
                background: activeColor.hex,
                color: activeColor.darkText ? '#0f172a' : '#ffffff',
                border: '3px solid #cbd5e1',
                boxShadow: '0 30px 60px rgba(0,0,0,0.35), 0 4px 0 0 #0f172a',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '1.75rem',
                boxSizing: 'border-box',
                textAlign: 'center',
                transformStyle: 'preserve-3d',
                transform: 'translateZ(25px)',
                position: 'relative',
              }}
            >
              {/* Header Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 900, letterSpacing: '0.08em' }}>
                  COMMERCIAL FLEET DOOR MAGNET (PAIR)
                </span>
                <span style={{ fontSize: '0.74rem', fontWeight: 900, color: accentColor }}>
                  12&quot; × 24&quot; 30-MIL HEAVY DUTY
                </span>
              </div>

              {/* Main Branding */}
              <div style={{ maxWidth: '300px', margin: '0 auto' }}>
                {renderBranding(activeColor.darkText ? 'color' : 'white', 0.88)}
              </div>

              <div>
                <strong style={{ fontSize: '1.35rem', letterSpacing: '-0.01em' }}>{businessName}</strong>
                <div style={{ fontSize: '0.9rem', fontWeight: 900, marginTop: '4px', color: accentColor }}>
                  📞 {phone} • {website}
                </div>
              </div>

              {/* Peeled Corner Effect showing 30-mil Dark Strontium Ferrite Magnet Backing */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: '45px',
                  height: '45px',
                  background: 'linear-gradient(135deg, transparent 50%, #0f172a 50%)',
                  borderRadius: '0 0 16px 0',
                  boxShadow: '-4px -4px 10px rgba(0,0,0,0.4)',
                }}
              />
            </div>
          )}

        </div>
      </div>

      {/* Dynamic QR Destination Indicator */}
      {includeQrCode && (
        <div
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            fontSize: '0.74rem',
            color: 'var(--muted)',
            padding: '0.4rem 0.85rem',
            borderRadius: '8px',
            background: 'rgba(11, 15, 23, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <span>📱 Direct QR Scan Destination:</span>
          <a
            href={website.startsWith('http') ? website : `https://${website}`}
            target="_blank"
            rel="noreferrer"
            style={{
              color: '#38bdf8',
              fontWeight: 800,
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            {website.startsWith('http') ? website : `https://${website}`}
          </a>
        </div>
      )}
    </div>
  );
}
