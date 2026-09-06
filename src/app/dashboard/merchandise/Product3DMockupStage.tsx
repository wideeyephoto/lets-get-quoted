'use client';

import { useState, useRef, useId, useEffect } from 'react';
import type { MerchandiseProduct, MockupViewAngle, BusinessCardTemplateId, CardFinishId } from '@/lib/merchandise/types';
import BusinessCardMockup from './BusinessCardMockup';
import Html5ProductCanvasCaster from './Html5ProductCanvasCaster';

interface Props {
  product: MerchandiseProduct;
  activeColor: { id: string; name: string; hex: string; darkText?: boolean };
  activeTier: { quantity: number; unitPrice: number; totalPrice: number };
  viewAngle: MockupViewAngle;
  setViewAngle: (angle: MockupViewAngle) => void;
  backdropTheme?: 'clean' | 'dark' | 'jobsite';
  setBackdropTheme?: (theme: 'clean' | 'dark' | 'jobsite') => void;
  includeQrCode: boolean;
  selectedFinish?: string;
  selectedModel?: string;
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
  backdropTheme = 'clean',
  setBackdropTheme,
  includeQrCode,
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
  cardFinish = 'velvet_matte',
  notepadTemplateId = 'work_order',
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

  // Unique IDs for SVG filters
  const filterId = useId();

  // Mouse move handler for realistic 3D tilt
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isInteractiveTilt || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const normX = (x / rect.width) * 2 - 1; // -1 to +1
    const normY = (y / rect.height) * 2 - 1; // -1 to +1

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

  // Base rotation per view angle
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
                  ? '👁️ Front'
                  : vw === 'back'
                  ? '🔄 Back'
                  : vw === 'detail'
                  ? '🔍 Macro Detail'
                  : '📐 3D Angle'}
              </span>
            </button>
          ))}
        </div>

        {/* Right Stage Tools */}
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

          {/* Interactive Mouse 3D Tilt Toggle */}
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
            <span>{isInteractiveTilt ? '3D Tilt: ON' : 'Tilt: OFF'}</span>
          </button>
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
          background: 'radial-gradient(ellipse at 50% 35%, #1e293b 0%, #0b101b 100%)',
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
        {/* Dynamic Specular Sheen based on mouse coordinates */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(circle 380px at ${tilt.glareX}% ${tilt.glareY}%, rgba(255, 255, 255, 0.08), transparent 70%)`,
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
                        FRONT FACE
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
                        BACK FACE
                      </span>
                    </div>
                  </div>
                )}
                {viewAngle === 'detail' && renderFrontCard({ transform: 'translateZ(45px) scale(1.1)' })}
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* 2. NOTEPAD & ESTIMATING FORMS MOCKUP */}
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
                      <span style={{ display: 'block', fontWeight: 700 }}>Authorized Customer Signature &amp; Acceptance of Work: __________________</span>
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

          {/* Fallback for any other product via HTML5 Canvas Caster */}
          {product.id !== 'biz_cards' && product.id !== 'notepads' && (
            <Html5ProductCanvasCaster
              productId={product.id}
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
        </div>
      </div>
    </div>
  );
}
