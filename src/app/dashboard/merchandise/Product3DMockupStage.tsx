'use client';

import React from 'react';
import type { MerchandiseProduct, MockupViewAngle, BusinessCardTemplateId, CardFinishId } from '@/lib/merchandise/types';
import BusinessCardMockup from './BusinessCardMockup';
import Html5ProductCanvasCaster from './Html5ProductCanvasCaster';

interface Props {
  product: MerchandiseProduct;
  activeColor: { id: string; name: string; hex: string; darkText?: boolean };
  activeTier: { quantity: number; unitPrice: number; totalPrice: number };
  viewAngle?: MockupViewAngle;
  setViewAngle?: (angle: MockupViewAngle) => void;
  backdropTheme?: 'clean' | 'dark' | 'jobsite';
  setBackdropTheme?: (theme: 'clean' | 'dark' | 'jobsite') => void;
  includeQrCode: boolean;
  selectedFinish?: string;
  selectedModel?: string;
  businessName: string;
  personName?: string;
  personTitle?: string;
  tagline: string;
  phone: string;
  phoneType?: string;
  secondaryPhone?: string;
  secondaryPhoneType?: string;
  fax?: string;
  email?: string;
  website: string;
  license: string;
  credentialType?: string;
  badgeLabel?: string;
  ratingBadgeText?: string;
  bulletText?: string;
  footerText?: string;
  primaryColor?: string;
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
  viewAngle = 'duo',
  setViewAngle,
  backdropTheme = 'clean',
  setBackdropTheme,
  includeQrCode,
  businessName,
  personName,
  personTitle,
  tagline,
  phone,
  phoneType,
  secondaryPhone,
  secondaryPhoneType,
  fax,
  email,
  website,
  license,
  credentialType,
  badgeLabel,
  ratingBadgeText,
  bulletText,
  footerText,
  primaryColor,
  accentColor,
  secondaryColor,
  renderBranding,
  logoSrc = '',
  onExportReady,
  cardTemplateId = 'executive',
  cardFinish = 'velvet_matte',
  notepadTemplateId = 'work_order',
}: Props) {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '520px',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        background: 'radial-gradient(ellipse at 50% 35%, #1e293b 0%, #0b101b 100%)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1.5rem',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      {/* 1. BUSINESS CARDS MOCKUP (2D Flat Proof: Front & Back Side-by-Side) */}
      {product.id === 'biz_cards' && (
        <div
          style={{
            display: 'flex',
            gap: '2.5rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <BusinessCardMockup
              templateId={cardTemplateId}
              finish={cardFinish}
              side="front"
              primaryColor={primaryColor}
              activeColor={activeColor}
              accentColor={accentColor}
              secondaryColor={secondaryColor}
              businessName={businessName}
              personName={personName}
              personTitle={personTitle}
              tagline={tagline}
              phone={phone}
              phoneType={phoneType}
              secondaryPhone={secondaryPhone}
              secondaryPhoneType={secondaryPhoneType}
              fax={fax}
              email={email}
              website={website}
              license={license}
              credentialType={credentialType}
              badgeLabel={badgeLabel}
              ratingBadgeText={ratingBadgeText}
              bulletText={bulletText}
              footerText={footerText}
              includeQrCode={includeQrCode}
              renderBranding={renderBranding}
            />
            <span
              style={{
                fontSize: '0.7rem',
                color: '#94a3b8',
                fontWeight: 800,
                letterSpacing: '0.08em',
                background: 'rgba(255, 255, 255, 0.06)',
                padding: '3px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              FRONT
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <BusinessCardMockup
              templateId={cardTemplateId}
              finish={cardFinish}
              side="back"
              primaryColor={primaryColor}
              activeColor={activeColor}
              accentColor={accentColor}
              secondaryColor={secondaryColor}
              businessName={businessName}
              personName={personName}
              personTitle={personTitle}
              tagline={tagline}
              phone={phone}
              phoneType={phoneType}
              secondaryPhone={secondaryPhone}
              secondaryPhoneType={secondaryPhoneType}
              fax={fax}
              email={email}
              website={website}
              license={license}
              credentialType={credentialType}
              badgeLabel={badgeLabel}
              ratingBadgeText={ratingBadgeText}
              bulletText={bulletText}
              footerText={footerText}
              includeQrCode={includeQrCode}
              renderBranding={renderBranding}
            />
            <span
              style={{
                fontSize: '0.7rem',
                color: '#94a3b8',
                fontWeight: 800,
                letterSpacing: '0.08em',
                background: 'rgba(255, 255, 255, 0.06)',
                padding: '3px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              BACK
            </span>
          </div>
        </div>
      )}

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
                    boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px ' + sheetBorder + ', 0 6px 0 0 #475569',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '1.5rem',
                    boxSizing: 'border-box',
                    position: 'relative',
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

                </div>
              );
            };

            return (
              <div
                style={{
                  display: 'flex',
                  gap: '2.5rem',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                  {renderNotepadSheet(false)}
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: '#94a3b8',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      background: 'rgba(255, 255, 255, 0.06)',
                      padding: '3px 12px',
                      borderRadius: '999px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    PART 1 • CUSTOMER ORIGINAL (WHITE)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                  {renderNotepadSheet(true)}
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: '#94a3b8',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      background: 'rgba(255, 255, 255, 0.06)',
                      padding: '3px 12px',
                      borderRadius: '999px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    PART 2 • CONTRACTOR DUPLICATE (YELLOW)
                  </span>
                </div>
              </div>
            );
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
          glareX={50}
          glareY={50}
        />
      )}
    </div>
  );
}
