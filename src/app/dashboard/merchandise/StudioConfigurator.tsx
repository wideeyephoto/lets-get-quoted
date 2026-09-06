'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { Upload, Sparkles, RotateCcw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type {
  MerchandiseProduct,
  BusinessCardTemplateId,
  CardFinishId,
} from '@/lib/merchandise/types';
import {
  BUSINESS_CARD_TEMPLATES,
  getCardTemplateById,
  CARD_FINISHES,
  getCardFinishById,
} from '@/lib/merchandise/card-templates';
import {
  NOTEPAD_TEMPLATES,
  getNotepadTemplateById,
  TradePreset,
  TRADE_PRESETS,
} from '@/lib/merchandise/product-templates';

interface StudioConfiguratorProps {
  currentProduct: MerchandiseProduct;
  displayedProducts: MerchandiseProduct[];
  onSelectProduct: (prod: MerchandiseProduct) => void;
  selectedCardTemplate: BusinessCardTemplateId;
  onSelectCardTemplate: (templateId: BusinessCardTemplateId) => void;
  selectedCardFinish: CardFinishId;
  onSelectCardFinish: (finish: CardFinishId) => void;
  selectedNotepadTemplate: string;
  onSelectNotepadTemplate: (templateId: string) => void;
  selectedColorId: string;
  onSelectColorId: (colorId: string) => void;
  activeColor: { id: string; name: string; hex: string; darkText?: boolean };
  selectedTierQty: number;
  onSelectTierQty: (qty: number) => void;
  activeTier: { quantity: number; unitPrice: number; totalPrice: number; isPopular?: boolean; savingsPercent?: number };
  businessName: string;
  setBusinessName: (val: string) => void;
  tagline: string;
  setTagline: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  website: string;
  setWebsite: (val: string) => void;
  license: string;
  setLicense: (val: string) => void;
  accentColor: string;
  setAccentColor: (val: string) => void;
  secondaryColor: string;
  setSecondaryColor: (val: string) => void;
  onApplyTradePreset: (preset: TradePreset) => void;
  onResetToDefaults: () => void;
  logoSource: 'site' | 'ai' | 'vector' | 'upload';
  setLogoSource: (source: 'site' | 'ai' | 'vector' | 'upload') => void;
  customUploadUrl: string | null;
  onLogoFileUpload: (file: File) => void;
  onRemoveCustomLogo: () => void;
  aiLogos: { id: string; url: string }[];
  selectedAiLogoId: string | null;
  onSelectAiLogoId: (id: string) => void;
  siteLogoUrl?: string | null;
  onOpenCheckout: () => void;
  onAddToCart: () => void;
  onDownloadProof: () => void;
  isGeneratingProof: boolean;
}

export default function StudioConfigurator({
  currentProduct,
  displayedProducts,
  onSelectProduct,
  selectedCardTemplate,
  onSelectCardTemplate,
  selectedCardFinish,
  onSelectCardFinish,
  selectedNotepadTemplate,
  onSelectNotepadTemplate,
  selectedColorId,
  onSelectColorId,
  activeColor,
  selectedTierQty,
  onSelectTierQty,
  activeTier,
  businessName,
  setBusinessName,
  tagline,
  setTagline,
  phone,
  setPhone,
  website,
  setWebsite,
  license,
  setLicense,
  accentColor,
  setAccentColor,
  secondaryColor,
  setSecondaryColor,
  onApplyTradePreset,
  onResetToDefaults,
  logoSource,
  setLogoSource,
  customUploadUrl,
  onLogoFileUpload,
  onRemoveCustomLogo,
  aiLogos,
  selectedAiLogoId,
  onSelectAiLogoId,
  siteLogoUrl,
  onOpenCheckout,
  onAddToCart,
  onDownloadProof,
  isGeneratingProof,
}: StudioConfiguratorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isBrandAccordionOpen, setIsBrandAccordionOpen] = useState(false);

  const activeCardTemplate = getCardTemplateById(selectedCardTemplate);
  const activeCardFinish = getCardFinishById(selectedCardFinish);
  const activeNotepadTemplate = getNotepadTemplateById(selectedNotepadTemplate);

  return (
    <div
      className="merchandise-controls-sidebar"
      style={{
        width: '400px',
        minWidth: '320px',
        maxWidth: '440px',
        boxSizing: 'border-box',
        borderLeft: '1px solid var(--line)',
        background: 'rgba(var(--panel-rgb), 0.98)',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '1.25rem 1.15rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      {/* 1. Item Selector */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.72rem',
            fontWeight: 800,
            color: 'var(--gold-ink)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.5rem',
          }}
        >
          1. Select Item
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
          {displayedProducts.map((prod) => {
            const active = prod.id === currentProduct.id;
            const lowestPrice = prod.pricingTiers[prod.pricingTiers.length - 1]?.unitPrice ?? prod.basePrice;
            return (
              <button
                key={prod.id}
                type="button"
                onClick={() => onSelectProduct(prod)}
                style={{
                  textAlign: 'left',
                  padding: '0.75rem 0.85rem',
                  borderRadius: '10px',
                  border: active ? '2px solid var(--accent)' : '1px solid rgba(var(--tint), 0.08)',
                  background: active
                    ? 'linear-gradient(145deg, rgba(255, 122, 33, 0.2), rgba(255, 122, 33, 0.05))'
                    : 'rgba(var(--tint), 0.035)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: active ? '0 4px 14px rgba(255, 122, 33, 0.25)' : 'none',
                }}
              >
                <strong
                  style={{
                    fontSize: '0.84rem',
                    color: active ? '#ffffff' : 'var(--text)',
                    fontWeight: 800,
                    lineHeight: 1.25,
                    display: 'block',
                  }}
                >
                  {prod.id === 'biz_cards' ? '📇 Business Cards' : '📝 Field Notepads'}
                </strong>
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: active ? '#38bdf8' : 'var(--muted)',
                    display: 'block',
                    marginTop: '3px',
                    fontWeight: 600,
                  }}
                >
                  {prod.id === 'biz_cards' ? '16pt Velvet & Spot-UV' : '2-Part Carbonless NCR'}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: '#16a34a',
                    fontWeight: 800,
                    display: 'block',
                    marginTop: '6px',
                  }}
                >
                  From ${lowestPrice.toFixed(2)}/ea
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Design Style Template Selector */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
          <label
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              color: 'var(--gold-ink)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: 0,
            }}
          >
            2. Design Style
          </label>
          <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>
            {currentProduct.id === 'biz_cards' ? activeCardTemplate.name : activeNotepadTemplate.name}
          </span>
        </div>

        {currentProduct.id === 'biz_cards' ? (
          <div
            role="radiogroup"
            aria-label="Business card templates"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '0.45rem',
            }}
          >
            {BUSINESS_CARD_TEMPLATES.map((tmpl) => {
              const isSelected = selectedCardTemplate === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectCardTemplate(tmpl.id)}
                  className="focus-ring"
                  style={{
                    padding: '0.55rem 0.6rem',
                    borderRadius: '8px',
                    border: isSelected ? '1.5px solid var(--accent, #ff7a21)' : '1px solid rgba(var(--tint), 0.14)',
                    background: isSelected ? 'rgba(255, 122, 33, 0.14)' : 'rgba(var(--tint), 0.035)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <strong
                      style={{
                        fontSize: '0.72rem',
                        color: isSelected ? 'var(--accent)' : 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {tmpl.name}
                    </strong>
                    {isSelected && <span style={{ fontSize: '0.68rem', color: 'var(--accent)', flexShrink: 0 }}>●</span>}
                  </div>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      color: 'var(--muted)',
                      lineHeight: 1.25,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {tmpl.subtitle}
                  </span>
                  <span
                    style={{
                      fontSize: '0.56rem',
                      color: '#60a5fa',
                      marginTop: '2px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {tmpl.tag}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.45rem' }}>
            {NOTEPAD_TEMPLATES.map((tmpl) => {
              const isSelected = selectedNotepadTemplate === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => onSelectNotepadTemplate(tmpl.id)}
                  className="focus-ring"
                  style={{
                    padding: '0.55rem 0.75rem',
                    borderRadius: '8px',
                    border: isSelected ? '1.5px solid var(--accent, #ff7a21)' : '1px solid rgba(var(--tint), 0.14)',
                    background: isSelected ? 'rgba(255, 122, 33, 0.14)' : 'rgba(var(--tint), 0.035)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '0.74rem', color: isSelected ? 'var(--accent)' : 'var(--text)', display: 'block' }}>
                      {tmpl.name}
                    </strong>
                    <span style={{ fontSize: '0.64rem', color: 'var(--muted)' }}>
                      {tmpl.subtitle} • {tmpl.tradeFit}
                    </span>
                  </div>
                  {isSelected && <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>●</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Tactile Finish (Business Cards only) */}
      {currentProduct.id === 'biz_cards' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#38bdf8',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                margin: 0,
              }}
            >
              3. Tactile Finish
            </label>
            <span style={{ fontSize: '0.7rem', color: '#ffffff', fontWeight: 700 }}>
              {activeCardFinish.name}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.35rem' }}>
            {CARD_FINISHES.map((fin) => {
              const isFinSelected = selectedCardFinish === fin.id;
              return (
                <button
                  key={fin.id}
                  type="button"
                  onClick={() => onSelectCardFinish(fin.id)}
                  className="focus-ring"
                  style={{
                    padding: '6px 9px',
                    borderRadius: '7px',
                    border: isFinSelected ? '1.5px solid #38bdf8' : '1px solid rgba(var(--tint), 0.12)',
                    background: isFinSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(var(--tint), 0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.9rem' }}>{fin.badge}</span>
                    <div>
                      <strong style={{ fontSize: '0.72rem', color: isFinSelected ? '#38bdf8' : 'var(--text)', display: 'block' }}>
                        {fin.name}
                      </strong>
                      <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{fin.description}</span>
                    </div>
                  </div>
                  {isFinSelected && <span style={{ fontSize: '0.7rem', color: '#38bdf8' }}>●</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Base Paper / Background Color */}
      <div>
        <label
          style={{
            display: 'block',
            fontSize: '0.72rem',
            fontWeight: 800,
            color: 'var(--gold-ink)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: '0.4rem',
          }}
        >
          {currentProduct.id === 'biz_cards' ? '4. Card Color' : '3. Pad Cover Color'}:{' '}
          <span style={{ color: 'var(--accent)' }}>{activeColor.name}</span>
        </label>
        <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
          {currentProduct.availableColors.map((clr) => {
            const isSelected = clr.id === selectedColorId;
            return (
              <button
                key={clr.id}
                type="button"
                onClick={() => onSelectColorId(clr.id)}
                aria-label={clr.name}
                aria-pressed={isSelected}
                title={clr.name}
                className="focus-ring"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: clr.hex,
                  border: isSelected ? '3px solid var(--accent)' : '2px solid rgba(255, 255, 255, 0.2)',
                  boxShadow: isSelected ? '0 0 0 2px rgba(255, 122, 33, 0.4)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: clr.darkText ? '#0f172a' : '#ffffff',
                  fontSize: '0.85rem',
                  fontWeight: 900,
                  transition: 'all 0.15s ease',
                }}
              >
                {isSelected ? '✓' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Collapsible Brand Details Accordion */}
      <div
        style={{
          borderRadius: '10px',
          border: '1px solid rgba(var(--tint), 0.14)',
          background: 'rgba(var(--tint), 0.03)',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setIsBrandAccordionOpen((prev) => !prev)}
          className="focus-ring"
          style={{
            width: '100%',
            padding: '0.65rem 0.85rem',
            background: isBrandAccordionOpen ? 'rgba(var(--tint), 0.06)' : 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{ minWidth: 0, flex: 1, paddingRight: '0.5rem' }}>
            <span
              style={{
                display: 'block',
                fontSize: '0.7rem',
                fontWeight: 800,
                color: 'var(--gold-ink)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Imprint &amp; Brand Text
            </span>
            <span
              style={{
                fontSize: '0.74rem',
                color: 'var(--text)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'block',
              }}
            >
              {businessName || 'Your Business'} • {phone || 'Phone'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)', fontSize: '0.74rem', fontWeight: 700 }}>
            <span>{isBrandAccordionOpen ? 'Close' : 'Edit'}</span>
            {isBrandAccordionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {isBrandAccordionOpen && (
          <div style={{ padding: '0.85rem', borderTop: '1px solid rgba(var(--tint), 0.08)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {/* Reset to Defaults button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onResetToDefaults}
                className="focus-ring"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                }}
              >
                <RotateCcw size={12} />
                <span>Reset to Defaults</span>
              </button>
            </div>

            {/* Overflow Guard Alert */}
            {(businessName.length > 30 || tagline.length > 40) && (
              <div
                style={{
                  padding: '0.45rem 0.65rem',
                  borderRadius: '6px',
                  background: 'rgba(234, 179, 8, 0.14)',
                  border: '1px solid rgba(234, 179, 8, 0.35)',
                  color: '#fef08a',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                <span>Text is long and will scale down automatically to fit print bleed safe zones.</span>
              </div>
            )}

            {/* Logo Source Buttons */}
            <div>
              <label style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                Logo / Brand Mark:
              </label>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: logoSource === 'upload' ? '1.5px solid #10b981' : '1px solid rgba(var(--tint), 0.12)',
                    background: logoSource === 'upload' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(var(--tint), 0.04)',
                    color: logoSource === 'upload' ? '#a7f3d0' : 'var(--muted)',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Upload size={12} />
                  <span>Upload</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onLogoFileUpload(file);
                  }}
                />

                {aiLogos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setLogoSource('ai')}
                    style={{
                      padding: '0.35rem 0.6rem',
                      borderRadius: '6px',
                      border: logoSource === 'ai' ? '1.5px solid #a855f7' : '1px solid rgba(var(--tint), 0.12)',
                      background: logoSource === 'ai' ? 'rgba(124, 58, 237, 0.2)' : 'rgba(var(--tint), 0.04)',
                      color: logoSource === 'ai' ? '#f3e8ff' : 'var(--muted)',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Sparkles size={12} />
                    <span>AI Concept</span>
                  </button>
                )}

                {siteLogoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoSource('site')}
                    style={{
                      padding: '0.35rem 0.6rem',
                      borderRadius: '6px',
                      border: logoSource === 'site' ? '1.5px solid #3b82f6' : '1px solid rgba(var(--tint), 0.12)',
                      background: logoSource === 'site' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(var(--tint), 0.04)',
                      color: logoSource === 'site' ? '#bfdbfe' : 'var(--muted)',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Site Logo
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setLogoSource('vector')}
                  style={{
                    padding: '0.35rem 0.6rem',
                    borderRadius: '6px',
                    border: logoSource === 'vector' ? '1.5px solid var(--accent)' : '1px solid rgba(var(--tint), 0.12)',
                    background: logoSource === 'vector' ? 'rgba(255, 122, 33, 0.18)' : 'rgba(var(--tint), 0.04)',
                    color: logoSource === 'vector' ? '#ffffff' : 'var(--muted)',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Vector Crest
                </button>
              </div>

              {/* Uploaded logo tag */}
              {logoSource === 'upload' && customUploadUrl && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.72rem' }}>
                  <img src={customUploadUrl} alt="Custom logo" style={{ width: '32px', height: '24px', objectFit: 'contain' }} />
                  <span style={{ color: 'var(--text)', flex: 1 }}>Custom logo active</span>
                  <button
                    type="button"
                    onClick={onRemoveCustomLogo}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', fontWeight: 800, cursor: 'pointer', fontSize: '0.7rem' }}
                  >
                    Remove
                  </button>
                </div>
              )}

              {/* AI logo picker */}
              {logoSource === 'ai' && aiLogos.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', overflowX: 'auto' }}>
                  {aiLogos.map((lg, idx) => (
                    <button
                      key={lg.id}
                      type="button"
                      onClick={() => onSelectAiLogoId(lg.id)}
                      style={{
                        position: 'relative',
                        width: '52px',
                        height: '40px',
                        borderRadius: '6px',
                        border: selectedAiLogoId === lg.id ? '2px solid #a855f7' : '1px solid rgba(var(--tint), 0.12)',
                        background: '#101520',
                        cursor: 'pointer',
                        padding: '2px',
                        flexShrink: 0,
                      }}
                    >
                      <Image src={lg.url} alt={`AI concept ${idx + 1}`} fill sizes="52px" style={{ objectFit: 'contain' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 1-Click Pro Trade Style Packs */}
            <div>
              <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                ⚡ Quick Trade Presets:
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.3rem' }}>
                {TRADE_PRESETS.slice(0, 6).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onApplyTradePreset(preset)}
                    className="focus-ring"
                    title={`${preset.name}: matching colors, tagline, template`}
                    style={{
                      padding: '4px',
                      borderRadius: '6px',
                      border: '1px solid rgba(var(--tint), 0.12)',
                      background: 'rgba(var(--tint), 0.04)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.68rem',
                      color: 'var(--text)',
                      fontWeight: 700,
                    }}
                  >
                    <span>{preset.badge}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs */}
            <div>
              <label htmlFor="cfg-biz-name" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                Company Name:
              </label>
              <input
                id="cfg-biz-name"
                type="text"
                maxLength={40}
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                style={{ width: '100%', padding: '0.42rem 0.55rem', borderRadius: '6px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label htmlFor="cfg-tagline" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                Tagline / Trade Specialty:
              </label>
              <input
                id="cfg-tagline"
                type="text"
                maxLength={50}
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                style={{ width: '100%', padding: '0.42rem 0.55rem', borderRadius: '6px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
              <div>
                <label htmlFor="cfg-phone" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                  Phone #:
                </label>
                <input
                  id="cfg-phone"
                  type="text"
                  maxLength={20}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ width: '100%', padding: '0.42rem 0.55rem', borderRadius: '6px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 600, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label htmlFor="cfg-website" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                  Website:
                </label>
                <input
                  id="cfg-website"
                  type="text"
                  maxLength={60}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  style={{ width: '100%', padding: '0.42rem 0.55rem', borderRadius: '6px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 600, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cfg-license" style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                License Line:
              </label>
              <input
                id="cfg-license"
                type="text"
                maxLength={30}
                value={license}
                onChange={(e) => setLicense(e.target.value)}
                style={{ width: '100%', padding: '0.42rem 0.55rem', borderRadius: '6px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.8rem', fontWeight: 600, boxSizing: 'border-box' }}
              />
            </div>

            {/* Colors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
              <div>
                <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                  Accent Color:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="color"
                    value={accentColor.startsWith('#') ? accentColor : '#2563eb'}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{ width: '26px', height: '26px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    maxLength={10}
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '5px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.74rem', fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                  Secondary Color:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <input
                    type="color"
                    value={secondaryColor.startsWith('#') ? secondaryColor : '#f59e0b'}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    style={{ width: '26px', height: '26px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    maxLength={10}
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '5px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.74rem', fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Volume Tiers & Quantity */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
          <label
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              color: 'var(--gold-ink)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: 0,
            }}
          >
            {currentProduct.id === 'biz_cards' ? '5. Quantity & Pricing' : '4. Quantity & Pricing'}
          </label>
          <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 800 }}>
            {activeTier.savingsPercent ? `Save ${activeTier.savingsPercent}%` : 'Commercial Wholesale'}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Quantity and pricing tiers"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
        >
          {currentProduct.pricingTiers.map((tier) => {
            const isSelected = tier.quantity === selectedTierQty;
            return (
              <button
                key={tier.quantity}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectTierQty(tier.quantity)}
                className="focus-ring"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.55rem 0.8rem',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid rgba(var(--tint), 0.08)',
                  background: isSelected
                    ? 'linear-gradient(145deg, rgba(255, 122, 33, 0.18), rgba(255, 122, 33, 0.04))'
                    : 'rgba(var(--tint), 0.035)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.82rem', color: isSelected ? '#ffffff' : 'var(--text)' }}>
                    {tier.quantity.toLocaleString()} {currentProduct.id === 'biz_cards' ? 'cards' : 'pads'}
                  </strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: '0.4rem' }}>
                    (${tier.unitPrice.toFixed(2)}/ea)
                  </span>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <strong style={{ fontSize: '0.86rem', color: isSelected ? '#ffffff' : 'var(--text)' }}>
                    ${tier.totalPrice.toFixed(2)}
                  </strong>
                  {tier.isPopular && (
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.62rem',
                        fontWeight: 800,
                        color: '#2563eb',
                        textTransform: 'uppercase',
                      }}
                    >
                      Most Popular
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Free Shipping Note */}
      <div style={{ fontSize: '0.72rem', color: activeTier.totalPrice >= 150 ? '#86efac' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>📦</span>
        <span>
          {activeTier.totalPrice >= 150
            ? 'FREE Standard Ground Shipping Included!'
            : `Free shipping on orders over $150 (add $${(150 - activeTier.totalPrice).toFixed(2)} more)`}
        </span>
      </div>

      {/* 7. Primary Action CTAs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: 'auto', paddingTop: '0.4rem' }}>
        <button
          type="button"
          onClick={onOpenCheckout}
          className="focus-ring"
          style={{
            width: '100%',
            padding: '0.82rem 1rem',
            borderRadius: '9px',
            border: 'none',
            background: 'linear-gradient(180deg, #ff8a3d, #ff7a21)',
            color: '#ffffff',
            fontWeight: 900,
            fontSize: '0.92rem',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(255,122,33,0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <span>⚡ Review Proof &amp; Order</span>
          <span>&bull;</span>
          <span>${activeTier.totalPrice.toFixed(2)}</span>
        </button>

        <button
          type="button"
          onClick={onAddToCart}
          className="focus-ring"
          style={{
            width: '100%',
            padding: '0.65rem 1rem',
            borderRadius: '8px',
            border: '1.5px solid var(--accent)',
            background: 'rgba(255, 122, 33, 0.12)',
            color: 'var(--text)',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
          }}
        >
          <span>🛒 Add to Order &amp; Keep Designing</span>
        </button>

        <button
          type="button"
          onClick={onDownloadProof}
          disabled={isGeneratingProof}
          className="focus-ring"
          style={{
            width: '100%',
            padding: '0.6rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(var(--tint), 0.14)',
            background: 'rgba(var(--tint), 0.05)',
            color: 'var(--text)',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: isGeneratingProof ? 'wait' : 'pointer',
            opacity: isGeneratingProof ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
          }}
        >
          <span>{isGeneratingProof ? '⏳ Generating Proof...' : '🖼️ Download Proof (PNG)'}</span>
        </button>
      </div>
    </div>
  );
}
