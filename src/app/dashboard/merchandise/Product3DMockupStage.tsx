'use client';

import { useState, useRef, useId, useEffect } from 'react';
import type { MerchandiseProduct, MockupViewAngle, BusinessCardTemplateId, CardFinishId } from '@/lib/merchandise/types';
import { BUSINESS_CARD_TEMPLATES, CARD_FINISHES, getCardFinishById } from '@/lib/merchandise/card-templates';
import {
  YARD_SIGN_TEMPLATES,
  NOTEPAD_TEMPLATES,
  DECAL_TEMPLATES,
  getYardSignTemplateById,
  getNotepadTemplateById,
  getDecalTemplateById,
} from '@/lib/merchandise/product-templates';
import BusinessCardMockup from './BusinessCardMockup';
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
  cardTemplateId?: BusinessCardTemplateId;
  onSelectCardTemplate?: (templateId: BusinessCardTemplateId) => void;
  cardFinish?: CardFinishId;
  onSelectCardFinish?: (finish: CardFinishId) => void;
  yardSignTemplateId?: string;
  onSelectYardSignTemplate?: (id: string) => void;
  notepadTemplateId?: string;
  onSelectNotepadTemplate?: (id: string) => void;
  decalTemplateId?: string;
  onSelectDecalTemplate?: (id: string) => void;
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
  cardTemplateId = 'executive',
  onSelectCardTemplate,
  cardFinish = 'velvet_matte',
  onSelectCardFinish,
  yardSignTemplateId,
  onSelectYardSignTemplate,
  notepadTemplateId,
  onSelectNotepadTemplate,
  decalTemplateId,
  onSelectDecalTemplate,
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

  // Keyboard shortcut to flip card ('Space' or 'f')
  useEffect(() => {
    if (product.id !== 'biz_cards') return;
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'Space' || e.key === 'f' || e.key === 'F') {
        if (viewAngle === 'front') {
          e.preventDefault();
          setViewAngle('back');
        } else if (viewAngle === 'back') {
          e.preventDefault();
          setViewAngle('front');
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product.id, viewAngle, setViewAngle]);

  // Safe view angle for canvas casters that don't support 'duo' directly
  const canvasViewAngle: 'front' | 'back' | 'angle' | 'detail' = viewAngle === 'duo' ? 'front' : viewAngle;

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
                {vw === 'duo'
                  ? '🎴 Duo Spread'
                  : vw === 'front'
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

      {/* Quick Template & Finish Switcher Bar for Business Cards */}
      {product.id === 'biz_cards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.85rem' }}>
          <div
            role="region"
            aria-label="Card design templates"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              overflowX: 'auto',
              padding: '7px 10px',
              background: 'rgba(11, 15, 23, 0.85)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 900,
                color: 'var(--gold-ink, #f59e0b)',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>📇</span> TEMPLATE:
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
              {BUSINESS_CARD_TEMPLATES.map((tmpl) => {
                const isSelected = (cardTemplateId || 'executive') === tmpl.id;
                return (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => onSelectCardTemplate?.(tmpl.id)}
                    aria-pressed={isSelected}
                    title={`${tmpl.name} • ${tmpl.tradeFit}`}
                    className="focus-ring"
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: isSelected ? '1px solid var(--accent, #ff7a21)' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSelected ? 'var(--accent, #ff7a21)' : 'rgba(255, 255, 255, 0.04)',
                      color: isSelected ? '#ffffff' : 'var(--muted, #94a3b8)',
                      fontSize: '0.72rem',
                      fontWeight: isSelected ? 800 : 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tmpl.name.replace('The ', '')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tactile Card Finish Selector */}
          <div
            role="region"
            aria-label="Card tactile finishes"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              overflowX: 'auto',
              padding: '7px 10px',
              background: 'rgba(11, 15, 23, 0.85)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 900,
                color: '#38bdf8',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>✨</span> FINISH:
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
              {CARD_FINISHES.map((fin) => {
                const isSelected = (cardFinish || 'velvet_matte') === fin.id;
                return (
                  <button
                    key={fin.id}
                    type="button"
                    onClick={() => onSelectCardFinish?.(fin.id)}
                    aria-pressed={isSelected}
                    title={`${fin.name}: ${fin.description}`}
                    className="focus-ring"
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                      color: isSelected ? '#ffffff' : 'var(--muted, #94a3b8)',
                      fontSize: '0.72rem',
                      fontWeight: isSelected ? 800 : 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{fin.badge}</span>
                    <span>{fin.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Quick Template Switcher Bar for Yard Signs */}
      {product.id === 'yard_signs' && (
        <div
          role="region"
          aria-label="Yard sign templates"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            overflowX: 'auto',
            padding: '8px 10px',
            marginBottom: '0.85rem',
            background: 'rgba(11, 15, 23, 0.85)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 900,
              color: 'var(--gold-ink, #f59e0b)',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>🪧</span> TEMPLATE:
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            {YARD_SIGN_TEMPLATES.map((tmpl) => {
              const isSelected = (yardSignTemplateId || 'jobsite_progress') === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => onSelectYardSignTemplate?.(tmpl.id)}
                  aria-pressed={isSelected}
                  title={`${tmpl.name} • ${tmpl.tradeFit}`}
                  className="focus-ring"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: isSelected ? '1px solid var(--accent, #ff7a21)' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: isSelected ? 'var(--accent, #ff7a21)' : 'rgba(255, 255, 255, 0.04)',
                    color: isSelected ? '#ffffff' : 'var(--muted, #94a3b8)',
                    fontSize: '0.72rem',
                    fontWeight: isSelected ? 800 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tmpl.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Template Switcher Bar for Carbonless Notepads */}
      {product.id === 'notepads' && (
        <div
          role="region"
          aria-label="Notepad templates"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            overflowX: 'auto',
            padding: '8px 10px',
            marginBottom: '0.85rem',
            background: 'rgba(11, 15, 23, 0.85)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 900,
              color: 'var(--gold-ink, #f59e0b)',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>📝</span> TEMPLATE:
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            {NOTEPAD_TEMPLATES.map((tmpl) => {
              const isSelected = (notepadTemplateId || 'work_order') === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => onSelectNotepadTemplate?.(tmpl.id)}
                  aria-pressed={isSelected}
                  title={`${tmpl.name} • ${tmpl.tradeFit}`}
                  className="focus-ring"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: isSelected ? '1px solid var(--accent, #ff7a21)' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: isSelected ? 'var(--accent, #ff7a21)' : 'rgba(255, 255, 255, 0.04)',
                    color: isSelected ? '#ffffff' : 'var(--muted, #94a3b8)',
                    fontSize: '0.72rem',
                    fontWeight: isSelected ? 800 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tmpl.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Template Switcher Bar for Equipment Decals & Magnets */}
      {product.id === 'decals' && (
        <div
          role="region"
          aria-label="Decal templates"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            overflowX: 'auto',
            padding: '8px 10px',
            marginBottom: '0.85rem',
            background: 'rgba(11, 15, 23, 0.85)',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 900,
              color: 'var(--gold-ink, #f59e0b)',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>🏷️</span> TEMPLATE:
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
            {DECAL_TEMPLATES.map((tmpl) => {
              const isSelected = (decalTemplateId || 'fleet_door') === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => onSelectDecalTemplate?.(tmpl.id)}
                  aria-pressed={isSelected}
                  title={`${tmpl.name} • ${tmpl.tradeFit}`}
                  className="focus-ring"
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: isSelected ? '1px solid var(--accent, #ff7a21)' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: isSelected ? 'var(--accent, #ff7a21)' : 'rgba(255, 255, 255, 0.04)',
                    color: isSelected ? '#ffffff' : 'var(--muted, #94a3b8)',
                    fontSize: '0.72rem',
                    fontWeight: isSelected ? 800 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tmpl.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
            const renderFrontCard = (customStyle?: React.CSSProperties) => (
              <div
                role="button"
                tabIndex={0}
                aria-label="Front of card. Click to flip to back."
                onClick={() => {
                  if (viewAngle === 'front') setViewAngle('back');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (viewAngle === 'front') setViewAngle('back');
                  }
                }}
                style={{
                  cursor: viewAngle === 'front' ? 'pointer' : 'default',
                  outline: 'none',
                }}
              >
                <BusinessCardMockup
                  templateId={cardTemplateId}
                  finish={cardFinish}
                  side="front"
                  activeColor={activeColor}
                  accentColor={accentColor}
                  secondaryColor={secondaryColor}
                  businessName={businessName}
                  tagline={tagline}
                  phone={phone}
                  website={website}
                  license={license}
                  includeQrCode={includeQrCode}
                  renderBranding={renderBranding}
                  glareX={tilt.glareX}
                  showBleedGuides={showBleedGuides}
                  customStyle={customStyle}
                />
              </div>
            );

            const renderBackCard = (customStyle?: React.CSSProperties) => (
              <div
                role="button"
                tabIndex={0}
                aria-label="Back of card. Click to flip to front."
                onClick={() => {
                  if (viewAngle === 'back') setViewAngle('front');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if (viewAngle === 'back') setViewAngle('front');
                  }
                }}
                style={{
                  cursor: viewAngle === 'back' ? 'pointer' : 'default',
                  outline: 'none',
                }}
              >
                <BusinessCardMockup
                  templateId={cardTemplateId}
                  finish={cardFinish}
                  side="back"
                  activeColor={activeColor}
                  accentColor={accentColor}
                  secondaryColor={secondaryColor}
                  businessName={businessName}
                  tagline={tagline}
                  phone={phone}
                  website={website}
                  license={license}
                  includeQrCode={includeQrCode}
                  renderBranding={renderBranding}
                  glareX={tilt.glareX}
                  showBleedGuides={showBleedGuides}
                  customStyle={customStyle}
                />
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
                  position: 'relative',
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
                {viewAngle === 'duo' && (
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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                      {renderFrontCard({ transform: 'translateZ(30px) rotateY(-8deg)' })}
                      <span
                        style={{
                          fontSize: '0.68rem',
                          color: '#cbd5e1',
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          background: 'rgba(0,0,0,0.6)',
                          padding: '2px 10px',
                          borderRadius: '999px',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        FRONT • {getCardFinishById(cardFinish).name.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                      {renderBackCard({ transform: 'translateZ(20px) rotateY(8deg)' })}
                      <span
                        style={{
                          fontSize: '0.68rem',
                          color: '#cbd5e1',
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          background: 'rgba(0,0,0,0.6)',
                          padding: '2px 10px',
                          borderRadius: '999px',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      >
                        BACK • REVERSE &amp; DYNAMIC QR
                      </span>
                    </div>
                  </div>
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
                      🔍 MACRO ZOOM • {getCardFinishById(cardFinish).name.toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Floating Quick Flip Button for single card views */}
                {(viewAngle === 'front' || viewAngle === 'back') && (
                  <button
                    type="button"
                    onClick={() => setViewAngle(viewAngle === 'front' ? 'back' : 'front')}
                    className="focus-ring"
                    style={{
                      position: 'absolute',
                      bottom: '-34px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      zIndex: 10,
                      padding: '5px 14px',
                      borderRadius: '999px',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      background: 'rgba(15, 23, 42, 0.88)',
                      backdropFilter: 'blur(8px)',
                      color: '#ffffff',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span>🔄</span>
                    <span>Flip to {viewAngle === 'front' ? 'Back' : 'Front'} (Space / F)</span>
                  </button>
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
              viewAngle={canvasViewAngle}
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
              viewAngle={canvasViewAngle}
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
              viewAngle={canvasViewAngle}
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
          {product.id === 'notepads' && (() => {
            const activeTemplate = notepadTemplateId || 'work_order';
            const renderNotepadSheet = (isDuplicateYellow = false, customStyle?: React.CSSProperties) => {
              const spineBg =
                activeTemplate === 'change_order'
                  ? 'linear-gradient(90deg, #991b1b, #dc2626, #7f1d1d)'
                  : activeTemplate === 'field_estimate'
                  ? 'linear-gradient(90deg, #065f46, #10b981, #047857)'
                  : 'linear-gradient(90deg, #1e3a8a, #2563eb, #1e3a8a)';

              const spineText =
                activeTemplate === 'change_order'
                  ? 'BINDING OFFICIAL CHANGE ORDER AUTHORIZATION PAD'
                  : activeTemplate === 'field_estimate'
                  ? '3-TIER FIELD DIAGNOSTIC & ESTIMATE TICKET PAD'
                  : 'SERIALIZED 2-PART NCR CARBONLESS WORK ORDER PAD';

              const sheetBg = isDuplicateYellow ? '#fef9c3' : '#ffffff';
              const sheetBorder = isDuplicateYellow ? '#fde047' : '#cbd5e1';

              return (
                <div
                  style={{
                    width: '380px',
                    height: '470px',
                    background: sheetBg,
                    borderRadius: '12px',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.35), 0 0 0 1px ' + sheetBorder + ', 0 8px 0 0 #475569',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '1.5rem',
                    boxSizing: 'border-box',
                    position: 'relative',
                    transformStyle: 'preserve-3d',
                    ...customStyle,
                  }}
                >
                  {/* Heavy Leatherette Binding Spine Tape */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '28px',
                      background: spineBg,
                      borderRadius: '10px 10px 0 0',
                      color: '#ffffff',
                      fontSize: '0.66rem',
                      fontWeight: 900,
                      textAlign: 'center',
                      lineHeight: '28px',
                      letterSpacing: '0.08em',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    }}
                  >
                    {spineText}
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

                  {/* Top Form Header */}
                  <div style={{ marginTop: '1.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ maxWidth: '190px' }}>{renderBranding('color', 0.7)}</div>
                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '0.92rem', color: '#0f172a', fontWeight: 900 }}>
                        {activeTemplate === 'change_order'
                          ? 'CHANGE ORDER'
                          : activeTemplate === 'field_estimate'
                          ? 'DIAGNOSTIC ESTIMATE'
                          : 'JOB WORK ORDER'}
                      </strong>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.74rem',
                          color: activeTemplate === 'change_order' ? '#dc2626' : activeTemplate === 'field_estimate' ? '#16a34a' : '#2563eb',
                          fontWeight: 900,
                        }}
                      >
                        {activeTemplate === 'change_order' ? '#CO-4891' : activeTemplate === 'field_estimate' ? '#EST-9241' : '#WO-8942'}
                      </span>
                      <span style={{ fontSize: '0.62rem', color: '#64748b' }}>DATE: {new Date().toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Customer / Project Information */}
                  <div
                    style={{
                      marginTop: '0.75rem',
                      border: '1px solid ' + (isDuplicateYellow ? '#fef08a' : '#e2e8f0'),
                      borderRadius: '6px',
                      padding: '0.45rem',
                      fontSize: '0.72rem',
                      background: isDuplicateYellow ? '#fefce8' : '#f8fafc',
                    }}
                  >
                    <div><strong>Customer / Project:</strong> _____________________ <strong>Phone:</strong> _________</div>
                    <div style={{ marginTop: '3px' }}><strong>Jobsite Address:</strong> ___________________________________________</div>
                  </div>

                  {/* Main Form Body by Template */}
                  {activeTemplate === 'work_order' && (
                    <div style={{ marginTop: '0.7rem', flex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ background: '#0f172a', color: '#ffffff', padding: '4px 8px', fontSize: '0.66rem', fontWeight: 900, display: 'flex', justifyContent: 'space-between' }}>
                        <span>DESCRIPTION OF SCOPE &amp; MATERIALS</span>
                        <span>AMOUNT</span>
                      </div>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div key={n} style={{ borderTop: '1px dashed #e2e8f0', height: '24px', display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.68rem', color: '#64748b' }}>
                          <span style={{ opacity: 0.5 }}>{n}.</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTemplate === 'change_order' && (
                    <div style={{ marginTop: '0.7rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', flex: 1 }}>
                        <div style={{ background: '#7f1d1d', color: '#ffffff', padding: '4px 8px', fontSize: '0.66rem', fontWeight: 900 }}>
                          AUTHORIZATION FOR EXTRA WORK / SCOPE REVISION
                        </div>
                        <div style={{ padding: '6px 8px', fontSize: '0.68rem', color: '#475569' }}>
                          <div>Original Agreement Scope Modification Details:</div>
                          <div style={{ height: '36px', borderBottom: '1px dashed #cbd5e1', marginTop: '4px' }} />
                        </div>
                      </div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontSize: '0.68rem', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Original Contract Price:</span>
                          <strong>$ ____________</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                          <span>Addition / Revision Sum:</span>
                          <strong>+ $ ____________</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '2px', marginTop: '2px', fontWeight: 900 }}>
                          <span>Revised Total:</span>
                          <strong>$ ____________</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTemplate === 'field_estimate' && (
                    <div style={{ marginTop: '0.7rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', textAlign: 'center' }}>
                        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px', background: '#f8fafc' }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 900, color: '#475569' }}>1. ESSENTIAL</span>
                          <div style={{ fontSize: '0.74rem', fontWeight: 900, marginTop: '2px', color: '#0f172a' }}>$ _______</div>
                        </div>
                        <div style={{ border: '1.5px solid #2563eb', borderRadius: '6px', padding: '4px', background: '#eff6ff' }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 900, color: '#2563eb' }}>2. PREFERRED</span>
                          <div style={{ fontSize: '0.74rem', fontWeight: 900, marginTop: '2px', color: '#2563eb' }}>$ _______</div>
                        </div>
                        <div style={{ border: '1.5px solid #16a34a', borderRadius: '6px', padding: '4px', background: '#f0fdf4' }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 900, color: '#16a34a' }}>3. LIFETIME</span>
                          <div style={{ fontSize: '0.74rem', fontWeight: 900, marginTop: '2px', color: '#16a34a' }}>$ _______</div>
                        </div>
                      </div>
                      <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px', fontSize: '0.68rem', color: '#475569' }}>
                        <div><strong>Diagnostics:</strong> [✓] Safety Inspection [ ] Code Issue [ ] Scope Verified</div>
                        <div style={{ height: '36px', borderBottom: '1px dashed #cbd5e1', marginTop: '4px' }} />
                      </div>
                    </div>
                  )}

                  {/* Legal Authorization & Signature */}
                  <div style={{ marginTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '0.7rem', color: '#334155' }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 700 }}>Client Authorization: __________________</span>
                      <span style={{ fontSize: '0.56rem', color: '#94a3b8' }}>Work authorized per standard contractor terms.</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#16a34a' }}>TOTAL: $_______</span>
                    </div>
                  </div>

                  {/* Corner duplicate peek if single view */}
                  {!isDuplicateYellow && viewAngle !== 'duo' && (
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
                  )}
                </div>
              );
            };

            if (viewAngle === 'duo') {
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
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                    {renderNotepadSheet(false, { transform: 'translateZ(30px) rotateY(-8deg)' })}
                    <span style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(0,0,0,0.6)', padding: '2px 10px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      PART 1 • WHITE CUSTOMER ORIGINAL
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                    {renderNotepadSheet(true, { transform: 'translateZ(20px) rotateY(8deg)' })}
                    <span style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(0,0,0,0.6)', padding: '2px 10px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      PART 2 • YELLOW CONTRACTOR NCR DUPLICATE
                    </span>
                  </div>
                </div>
              );
            }

            return renderNotepadSheet(false, { transform: 'translateZ(20px)' });
          })()}

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
              viewAngle={canvasViewAngle}
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
          {product.id === 'yard_signs' && (() => {
            const activeTemplate = yardSignTemplateId || 'jobsite_progress';

            const renderSignPanel = (isReverse = false, customStyle?: React.CSSProperties) => (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transformStyle: 'preserve-3d', ...customStyle }}>
                <div
                  style={{
                    width: '480px',
                    height: '330px',
                    borderRadius: '10px',
                    background: activeColor.hex,
                    color: activeColor.darkText ? '#0f172a' : '#ffffff',
                    border: '3.5px solid #cbd5e1',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
                    padding: '1.65rem',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    textAlign: 'center',
                    transform: 'translateZ(20px)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Fluting Ridge Texture */}
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

                  {/* 1. Jobsite Progress Template */}
                  {activeTemplate === 'jobsite_progress' && (
                    <>
                      <div
                        style={{
                          width: '100%',
                          background: '#eab308',
                          color: '#0f172a',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 900,
                          letterSpacing: '0.08em',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                        }}
                      >
                        ⚠️ CAUTION: JOB UNDER CONSTRUCTION
                      </div>
                      <div style={{ maxWidth: '280px' }}>{renderBranding(activeColor.darkText ? 'color' : 'white', 0.82)}</div>
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                          {businessName.toUpperCase()}
                        </h2>
                        <p style={{ margin: '3px 0 0 0', fontSize: '0.94rem', fontWeight: 800 }}>{tagline}</p>
                      </div>
                      <div
                        style={{
                          background: '#16a34a',
                          color: '#ffffff',
                          padding: '0.5rem 1.75rem',
                          borderRadius: '8px',
                          fontSize: '1.4rem',
                          fontWeight: 900,
                          boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        📞 {phone}
                      </div>
                      <div style={{ fontSize: '0.74rem', fontWeight: 900, letterSpacing: '0.06em', opacity: 0.9 }}>
                        {license ? `LIC #${license} • ` : ''}PROUDLY SERVING THIS NEIGHBORHOOD
                      </div>
                    </>
                  )}

                  {/* 2. Direct Phone 35 MPH Roadside Template */}
                  {activeTemplate === 'direct_phone' && (
                    <>
                      <div style={{ fontSize: '0.78rem', fontWeight: 900, letterSpacing: '0.12em', color: accentColor }}>
                        24/7 EMERGENCY RAPID RESPONSE • FREE ESTIMATES
                      </div>
                      <div>
                        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>
                          {businessName.toUpperCase()}
                        </h1>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', fontWeight: 700 }}>{tagline}</p>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          background: '#dc2626',
                          color: '#ffffff',
                          padding: '0.65rem 1rem',
                          borderRadius: '8px',
                          fontSize: '1.7rem',
                          fontWeight: 900,
                          letterSpacing: '0.06em',
                          boxShadow: '0 4px 14px rgba(220,38,38,0.4)',
                        }}
                      >
                        CALL NOW: {phone}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.04em' }}>
                        {website} • FULLY LICENSED &amp; INSURED
                      </div>
                    </>
                  )}

                  {/* 3. Modern Architect Showcase Template */}
                  {activeTemplate === 'modern_showcase' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1rem', width: '100%', height: '100%', textAlign: 'left', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                        <div>{renderBranding(activeColor.darkText ? 'color' : 'white', 0.8)}</div>
                        <div>
                          <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900 }}>{businessName}</h2>
                          <p style={{ margin: '2px 0 0 0', fontSize: '0.84rem', color: accentColor, fontWeight: 700 }}>{tagline}</p>
                        </div>
                        <div style={{ fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: '3px', fontWeight: 700 }}>
                          <div>✓ 10-Year Craftsmanship Warranty</div>
                          <div>✓ Architectural 3D CAD Renderings</div>
                          <div>✓ Licensed: {license || 'Master Certified'}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'rgba(0,0,0,0.18)', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: accentColor }}>CALL FOR ESTIMATE</div>
                        <strong style={{ fontSize: '1.05rem', margin: '4px 0' }}>{phone}</strong>
                        <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>{website}</span>
                        <div style={{ marginTop: '8px', padding: '4px 8px', background: '#ffffff', color: '#0f172a', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 900 }}>
                          SCAN FOR PORTFOLIO
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 4. Instant QR Estimate Template */}
                  {activeTemplate === 'qr_estimate' && (
                    <>
                      <div style={{ background: '#2563eb', color: '#ffffff', padding: '3px 12px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 900 }}>
                        📱 POINT CAMERA FOR AN INSTANT ESTIMATE
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                        <div
                          style={{
                            width: '90px',
                            height: '90px',
                            background: '#ffffff',
                            borderRadius: '8px',
                            padding: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                          }}
                        >
                          <div style={{ width: '74px', height: '74px', border: '3px solid #0f172a', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '2px', gap: '2px' }}>
                            <div style={{ background: '#0f172a' }} />
                            <div />
                            <div style={{ background: '#0f172a' }} />
                            <div />
                            <div style={{ background: '#0f172a' }} />
                            <div />
                            <div style={{ background: '#0f172a' }} />
                            <div />
                            <div style={{ background: '#0f172a' }} />
                          </div>
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>{businessName}</h2>
                          <p style={{ margin: '2px 0 6px 0', fontSize: '0.84rem', fontWeight: 700 }}>{tagline}</p>
                          <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Scan to calculate project cost in 60 seconds</div>
                        </div>
                      </div>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '6px' }}>
                        <span style={{ fontSize: '1.15rem', fontWeight: 900 }}>📞 {phone}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{website}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Welded Galvanized Zinc 9-Gauge Steel H-Stake */}
                <div style={{ display: 'flex', gap: '90px', marginTop: '-3px', zIndex: -1 }}>
                  <div style={{ width: '7px', height: '120px', background: 'linear-gradient(180deg, #94a3b8, #64748b)', boxShadow: '2px 0 4px rgba(0,0,0,0.4)' }} />
                  <div style={{ width: '7px', height: '120px', background: 'linear-gradient(180deg, #94a3b8, #64748b)', boxShadow: '2px 0 4px rgba(0,0,0,0.4)' }} />
                </div>
              </div>
            );

            if (viewAngle === 'duo') {
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
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                    {renderSignPanel(false, { transform: 'translateZ(25px) rotateY(-8deg)' })}
                    <span style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(0,0,0,0.6)', padding: '2px 10px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      FACE A • 4MM COROPLAST OUTDOOR FLUTING
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                    {renderSignPanel(true, { transform: 'translateZ(15px) rotateY(8deg)' })}
                    <span style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(0,0,0,0.6)', padding: '2px 10px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      FACE B • DOUBLE-SIDED REVERSE IMPRINT
                    </span>
                  </div>
                </div>
              );
            }

            return renderSignPanel(false);
          })()}

          {/* ========================================================================= */}
          {/* 9. STAINLESS STEEL VACUUM TUMBLER (HTML5 Canvas Casting Engine)           */}
          {/* ========================================================================= */}
          {product.id === 'tumblers' && (
            <Html5ProductCanvasCaster
              productId="tumblers"
              viewAngle={canvasViewAngle}
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
          {product.id === 'decals' && (() => {
            const activeTemplate = decalTemplateId || 'fleet_door';

            const renderDecalItem = (isPassengerSide = false, customStyle?: React.CSSProperties) => {
              if (activeTemplate === 'equipment_warranty') {
                return (
                  <div
                    style={{
                      width: '460px',
                      height: '270px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)',
                      color: '#0f172a',
                      border: '3px solid #64748b',
                      boxShadow: '0 25px 50px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.6)',
                      padding: '1.5rem',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transformStyle: 'preserve-3d',
                      position: 'relative',
                      ...customStyle,
                    }}
                  >
                    {/* 4 Corner Screws / Rivets */}
                    <div style={{ position: 'absolute', top: '10px', left: '10px', width: '10px', height: '10px', borderRadius: '50%', background: '#475569', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)' }} />
                    <div style={{ position: 'absolute', top: '10px', right: '10px', width: '10px', height: '10px', borderRadius: '50%', background: '#475569', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)' }} />
                    <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '10px', height: '10px', borderRadius: '50%', background: '#475569', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)' }} />
                    <div style={{ position: 'absolute', bottom: '10px', right: '10px', width: '10px', height: '10px', borderRadius: '50%', background: '#475569', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 900, letterSpacing: '0.08em', color: '#1e3a8a' }}>
                        CERTIFIED SERVICE &amp; EQUIPMENT WARRANTY RECORD
                      </div>
                      <span style={{ fontSize: '0.68rem', fontWeight: 900, background: '#0f172a', color: '#ffffff', padding: '2px 6px', borderRadius: '4px' }}>
                        HEAVY-DUTY FOIL
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ maxWidth: '180px' }}>{renderBranding('color', 0.75)}</div>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>{businessName}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#475569' }}>License: {license || 'Master Certified'}</div>
                      </div>
                    </div>

                    {/* Service Record Grid */}
                    <div style={{ border: '1.5px solid #64748b', borderRadius: '6px', padding: '6px', background: 'rgba(255,255,255,0.7)', fontSize: '0.68rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                        <div><strong>Service Date:</strong> _________</div>
                        <div><strong>Tech ID:</strong> #TK-84</div>
                        <div><strong>Next Due:</strong> _________</div>
                      </div>
                    </div>

                    {/* Emergency Hotline */}
                    <div style={{ background: '#b91c1c', color: '#ffffff', padding: '5px 10px', borderRadius: '6px', textAlign: 'center', fontWeight: 900, fontSize: '0.84rem' }}>
                      🚨 FOR 24/7 EMERGENCY SERVICE CALL: {phone}
                    </div>
                  </div>
                );
              }

              if (activeTemplate === 'hard_hat_tool') {
                return (
                  <div
                    style={{
                      width: '320px',
                      height: '320px',
                      borderRadius: '50%',
                      background: activeColor.hex,
                      color: activeColor.darkText ? '#0f172a' : '#ffffff',
                      border: '6px solid #cbd5e1',
                      boxShadow: '0 25px 50px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.3)',
                      padding: '1.5rem',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      textAlign: 'center',
                      transformStyle: 'preserve-3d',
                      position: 'relative',
                      ...customStyle,
                    }}
                  >
                    <div style={{ fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.12em', color: '#16a34a' }}>
                      ★ SAFETY FIRST • CERTIFIED OPERATOR ★
                    </div>
                    <div style={{ maxWidth: '160px' }}>{renderBranding(activeColor.darkText ? 'color' : 'white', 0.85)}</div>
                    <div>
                      <strong style={{ fontSize: '1.15rem', display: 'block' }}>{businessName}</strong>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: accentColor }}>📞 {phone}</span>
                    </div>
                    <div style={{ background: '#0f172a', color: '#ffffff', padding: '3px 12px', borderRadius: '999px', fontSize: '0.66rem', fontWeight: 900 }}>
                      WEATHERPROOF DIE-CUT VINYL
                    </div>
                  </div>
                );
              }

              // Default: Fleet Door Magnet (Pair)
              return (
                <div
                  style={{
                    width: '480px',
                    height: '240px',
                    borderRadius: '16px',
                    background: activeColor.hex,
                    color: activeColor.darkText ? '#0f172a' : '#ffffff',
                    border: '3px solid #cbd5e1',
                    boxShadow: '0 30px 60px rgba(0,0,0,0.35), 0 4px 0 0 #0f172a',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '1.5rem',
                    boxSizing: 'border-box',
                    textAlign: 'center',
                    transformStyle: 'preserve-3d',
                    position: 'relative',
                    ...customStyle,
                  }}
                >
                  {/* Header Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.08em' }}>
                      {isPassengerSide ? 'FLEET VEHICLE DOOR MAGNET (PASSENGER)' : 'FLEET VEHICLE DOOR MAGNET (DRIVER)'}
                    </span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 900, color: accentColor }}>
                      12&quot; × 24&quot; 30-MIL
                    </span>
                  </div>

                  {/* Main Branding */}
                  <div style={{ maxWidth: '280px', margin: '0 auto' }}>
                    {renderBranding(activeColor.darkText ? 'color' : 'white', 0.85)}
                  </div>

                  <div>
                    <strong style={{ fontSize: '1.3rem', letterSpacing: '-0.01em' }}>{businessName}</strong>
                    <div style={{ fontSize: '0.88rem', fontWeight: 900, marginTop: '3px', color: accentColor }}>
                      📞 {phone} • {website}
                    </div>
                  </div>

                  {/* Peeled Corner Effect showing 30-mil Dark Strontium Ferrite Magnet Backing */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: '42px',
                      height: '42px',
                      background: 'linear-gradient(135deg, transparent 50%, #0f172a 50%)',
                      borderRadius: '0 0 14px 0',
                      boxShadow: '-4px -4px 10px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              );
            };

            if (viewAngle === 'duo') {
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
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                    {renderDecalItem(false, { transform: 'translateZ(25px) rotateY(-8deg)' })}
                    <span style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(0,0,0,0.6)', padding: '2px 10px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      DRIVER SIDE • DOOR MAGNET / VINYL
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                    {renderDecalItem(true, { transform: 'translateZ(15px) rotateY(8deg)' })}
                    <span style={{ fontSize: '0.68rem', color: '#cbd5e1', fontWeight: 800, letterSpacing: '0.08em', background: 'rgba(0,0,0,0.6)', padding: '2px 10px', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      PASSENGER SIDE • MATCHED PAIR
                    </span>
                  </div>
                </div>
              );
            }

            return renderDecalItem(false, { transform: 'translateZ(25px)' });
          })()}

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
