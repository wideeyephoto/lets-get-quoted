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
} from '@/lib/merchandise/card-templates';
import {
  NOTEPAD_TEMPLATES,
  getNotepadTemplateById,
  TradePreset,
  TRADE_PRESETS,
} from '@/lib/merchandise/product-templates';
import { renderCardCredential } from './BusinessCardMockup';

export const PRIMARY_COLOR_PRESETS = [
  { name: 'Dark Slate', hex: '#0f172a', darkText: false },
  { name: 'Bright White', hex: '#ffffff', darkText: true },
  { name: 'Executive Navy', hex: '#0a2540', darkText: false },
  { name: 'Charcoal Slate', hex: '#1e293b', darkText: false },
  { name: 'Forest Green', hex: '#064e3b', darkText: false },
  { name: 'Deep Crimson', hex: '#7f1d1d', darkText: false },
  { name: 'Kraft Tan', hex: '#d2b48c', darkText: true },
];

export const SECONDARY_COLOR_PRESETS = [
  { name: 'Safety Orange', hex: '#ff7a21', darkText: false },
  { name: 'Construction Amber', hex: '#f59e0b', darkText: true },
  { name: 'Blueprint Cyan', hex: '#38bdf8', darkText: true },
  { name: 'Pro Emerald', hex: '#10b981', darkText: false },
  { name: 'Hi-Vis Cobalt', hex: '#2563eb', darkText: false },
  { name: 'Warning Red', hex: '#ef4444', darkText: false },
  { name: 'Steel Gray', hex: '#94a3b8', darkText: true },
  { name: 'Pure White', hex: '#ffffff', darkText: true },
];

interface StudioConfiguratorProps {
  currentProduct: MerchandiseProduct;
  displayedProducts: MerchandiseProduct[];
  onSelectProduct: (prod: MerchandiseProduct) => void;
  selectedCardTemplate: BusinessCardTemplateId;
  onSelectCardTemplate: (templateId: BusinessCardTemplateId) => void;
  selectedCardFinish?: CardFinishId;
  onSelectCardFinish?: (finish: CardFinishId) => void;
  selectedNotepadTemplate: string;
  onSelectNotepadTemplate: (templateId: string) => void;
  selectedColorId: string;
  onSelectColorId: (colorId: string) => void;
  activeColor: { id: string; name: string; hex: string; darkText?: boolean };
  primaryColor?: string;
  setPrimaryColor?: (val: string) => void;
  selectedTierQty: number;
  onSelectTierQty: (qty: number) => void;
  activeTier: { quantity: number; unitPrice: number; totalPrice: number; isPopular?: boolean; savingsPercent?: number };
  businessName: string;
  setBusinessName: (val: string) => void;
  personName?: string;
  setPersonName?: (val: string) => void;
  personTitle?: string;
  setPersonTitle?: (val: string) => void;
  tagline: string;
  setTagline: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  phoneType?: string;
  setPhoneType?: (val: string) => void;
  secondaryPhone?: string;
  setSecondaryPhone?: (val: string) => void;
  secondaryPhoneType?: string;
  setSecondaryPhoneType?: (val: string) => void;
  fax?: string;
  setFax?: (val: string) => void;
  email?: string;
  setEmail?: (val: string) => void;
  website: string;
  setWebsite: (val: string) => void;
  license: string;
  setLicense: (val: string) => void;
  credentialType?: string;
  setCredentialType?: (val: string) => void;
  badgeLabel: string;
  setBadgeLabel: (val: string) => void;
  ratingBadgeText: string;
  setRatingBadgeText: (val: string) => void;
  bulletText: string;
  setBulletText: (val: string) => void;
  footerText: string;
  setFooterText: (val: string) => void;
  accentColor: string;
  setAccentColor: (val: string) => void;
  secondaryColor: string;
  setSecondaryColor: (val: string) => void;
  onApplyTradePreset?: (preset: TradePreset) => void;
  onResetToDefaults: () => void;
  logoSource: 'site' | 'ai' | 'vector' | 'upload';
  setLogoSource: (source: 'site' | 'ai' | 'vector' | 'upload') => void;
  customUploadUrl: string | null;
  onLogoFileUpload: (file: File) => void;
  onRemoveCustomLogo: () => void;
  aiLogos?: { id: string; url: string }[];
  selectedAiLogoId?: string | null;
  onSelectAiLogoId?: (id: string) => void;
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
  personName,
  setPersonName,
  personTitle,
  setPersonTitle,
  tagline,
  setTagline,
  phone,
  setPhone,
  phoneType = 'Office',
  setPhoneType,
  secondaryPhone,
  setSecondaryPhone,
  secondaryPhoneType = 'Cell',
  setSecondaryPhoneType,
  fax,
  setFax,
  email,
  setEmail,
  website,
  setWebsite,
  license,
  setLicense,
  credentialType = 'license',
  setCredentialType,
  badgeLabel,
  setBadgeLabel,
  ratingBadgeText,
  setRatingBadgeText,
  bulletText,
  setBulletText,
  footerText,
  setFooterText,
  primaryColor = '#0f172a',
  setPrimaryColor,
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
  const [isBrandAccordionOpen, setIsBrandAccordionOpen] = useState(true);
  const [subAccordions, setSubAccordions] = useState<{
    company: boolean;
    contact: boolean;
    trust: boolean;
    cardCopy: boolean;
  }>({
    company: true,
    contact: true,
    trust: true,
    cardCopy: false,
  });

  const toggleSubAccordion = (key: 'company' | 'contact' | 'trust' | 'cardCopy') => {
    setSubAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeCardTemplate = getCardTemplateById(selectedCardTemplate);
  const activeNotepadTemplate = getNotepadTemplateById(selectedNotepadTemplate);

  const effectivePrimaryColor = primaryColor || activeColor?.hex || '#0f172a';
  const effectiveSecondaryColor = secondaryColor || accentColor || '#ff7a21';

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

      {/* 3. Card Color Selector (Primary & Secondary for Business Cards, Pad Cover Color for Notepads) */}
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
            {currentProduct.id === 'biz_cards' ? '3. Card Colors (Primary & Secondary)' : '3. Pad Cover Color'}
          </label>
          {currentProduct.id === 'biz_cards' && (
            <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>
              Applies to all templates
            </span>
          )}
        </div>

        {currentProduct.id === 'biz_cards' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              background: 'rgba(var(--tint), 0.035)',
              padding: '0.8rem',
              borderRadius: '9px',
              border: '1px solid rgba(var(--tint), 0.12)',
            }}
          >
            {/* Primary Card Color */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text)' }}>
                  Primary Color <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 500 }}>(Card face &amp; panels)</span>
                </span>
                <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>
                  {effectivePrimaryColor.toUpperCase()}
                </span>
              </div>

              {/* Curated Swatches + Custom Picker */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {PRIMARY_COLOR_PRESETS.map((clr) => {
                  const isSelected = effectivePrimaryColor.toLowerCase() === clr.hex.toLowerCase();
                  return (
                    <button
                      key={clr.hex}
                      type="button"
                      onClick={() => {
                        setPrimaryColor?.(clr.hex);
                        const matched = currentProduct.availableColors.find(
                          (c) => c.hex.toLowerCase() === clr.hex.toLowerCase()
                        );
                        if (matched) onSelectColorId(matched.id);
                      }}
                      aria-label={`Primary ${clr.name}`}
                      title={`${clr.name} (${clr.hex})`}
                      className="focus-ring"
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: clr.hex,
                        border: isSelected ? '2.5px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.25)',
                        boxShadow: isSelected ? '0 0 0 2px rgba(255, 122, 33, 0.4)' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: clr.darkText ? '#0f172a' : '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 900,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isSelected ? '✓' : ''}
                    </button>
                  );
                })}

                {/* Custom Color Input & Hex Box */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
                  <input
                    type="color"
                    aria-label="Custom primary color picker"
                    value={effectivePrimaryColor.startsWith('#') ? effectivePrimaryColor : '#0f172a'}
                    onChange={(e) => {
                      setPrimaryColor?.(e.target.value);
                      const matched = currentProduct.availableColors.find(
                        (c) => c.hex.toLowerCase() === e.target.value.toLowerCase()
                      );
                      if (matched) onSelectColorId(matched.id);
                    }}
                    style={{ width: '28px', height: '28px', padding: 0, border: '1px solid rgba(255, 255, 255, 0.25)', borderRadius: '6px', cursor: 'pointer', background: 'transparent' }}
                  />
                  <input
                    type="text"
                    maxLength={7}
                    aria-label="Custom primary color hex"
                    value={effectivePrimaryColor}
                    onChange={(e) => {
                      setPrimaryColor?.(e.target.value);
                      const matched = currentProduct.availableColors.find(
                        (c) => c.hex.toLowerCase() === e.target.value.toLowerCase()
                      );
                      if (matched) onSelectColorId(matched.id);
                    }}
                    style={{ width: '68px', padding: '0.3rem 0.35rem', borderRadius: '5px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* Secondary Accent Color */}
            <div style={{ borderTop: '1px solid rgba(var(--tint), 0.1)', paddingTop: '0.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text)' }}>
                  Secondary Color <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 500 }}>(Accents, borders &amp; badges)</span>
                </span>
                <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)' }}>
                  {effectiveSecondaryColor.toUpperCase()}
                </span>
              </div>

              {/* Curated Swatches + Custom Picker */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {SECONDARY_COLOR_PRESETS.map((clr) => {
                  const isSelected = effectiveSecondaryColor.toLowerCase() === clr.hex.toLowerCase();
                  return (
                    <button
                      key={clr.hex}
                      type="button"
                      onClick={() => setSecondaryColor(clr.hex)}
                      aria-label={`Secondary ${clr.name}`}
                      title={`${clr.name} (${clr.hex})`}
                      className="focus-ring"
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        background: clr.hex,
                        border: isSelected ? '2.5px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.25)',
                        boxShadow: isSelected ? '0 0 0 2px rgba(255, 122, 33, 0.4)' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: clr.darkText ? '#0f172a' : '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 900,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isSelected ? '✓' : ''}
                    </button>
                  );
                })}

                {/* Custom Secondary Input & Hex Box */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginLeft: 'auto' }}>
                  <input
                    type="color"
                    aria-label="Custom secondary color picker"
                    value={effectiveSecondaryColor.startsWith('#') ? effectiveSecondaryColor : '#ff7a21'}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    style={{ width: '28px', height: '28px', padding: 0, border: '1px solid rgba(255, 255, 255, 0.25)', borderRadius: '6px', cursor: 'pointer', background: 'transparent' }}
                  />
                  <input
                    type="text"
                    maxLength={7}
                    aria-label="Custom secondary color hex"
                    value={effectiveSecondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    style={{ width: '68px', padding: '0.3rem 0.35rem', borderRadius: '5px', border: '1px solid var(--line)', background: 'rgba(var(--tint), 0.06)', color: 'var(--text)', fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
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
        )}
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
          <div style={{ padding: '0.85rem', borderTop: '1px solid rgba(var(--tint), 0.08)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Top Bar: Expand/Collapse All & Reset to Defaults */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.45rem', fontSize: '0.66rem' }}>
                <button
                  type="button"
                  onClick={() => setSubAccordions({ company: true, contact: true, trust: true, cardCopy: true })}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 600 }}
                >
                  Expand all
                </button>
                <span style={{ color: 'rgba(var(--tint), 0.2)' }}>•</span>
                <button
                  type="button"
                  onClick={() => setSubAccordions({ company: false, contact: false, trust: false, cardCopy: false })}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontWeight: 600 }}
                >
                  Collapse all
                </button>
              </div>
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

            {/* ============================================================ */}
            {/* SUB-ACCORDION 1: 🏢 Company & Branding */}
            {/* ============================================================ */}
            <div
              style={{
                borderRadius: '8px',
                border: '1px solid rgba(var(--tint), 0.10)',
                background: 'rgba(var(--tint), 0.02)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => toggleSubAccordion('company')}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  background: subAccordions.company ? 'rgba(var(--tint), 0.05)' : 'transparent',
                  border: 'none',
                  borderBottom: subAccordions.company ? '1px solid rgba(var(--tint), 0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>🏢</span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em' }}>
                    Company &amp; Branding
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {businessName && (
                    <span style={{ fontSize: '0.64rem', color: 'var(--muted)', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {businessName}
                    </span>
                  )}
                  {subAccordions.company ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}
                </div>
              </button>

              {subAccordions.company && (
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {/* Logo Source Buttons */}
                  <div>
                    <label style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                      Logo / Brand Mark:
                    </label>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          padding: '0.35rem 0.65rem',
                          borderRadius: '6px',
                          border: logoSource === 'upload' ? '1.5px solid #10b981' : '1px solid rgba(var(--tint), 0.14)',
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

                      {siteLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoSource('site')}
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            border: logoSource === 'site' ? '1.5px solid #3b82f6' : '1px solid rgba(var(--tint), 0.14)',
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
                    </div>

                    {/* Uploaded logo thumbnail */}
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
                  </div>

                  {/* Company Name */}
                  <div>
                    <label htmlFor="cfg-biz-name" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                      Company Name:
                    </label>
                    <input
                      id="cfg-biz-name"
                      name="merch_biz_name"
                      type="text"
                      maxLength={40}
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="merch-studio-input"
                    />
                  </div>

                  {/* Tagline */}
                  <div>
                    <label htmlFor="cfg-tagline" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                      Tagline / Trade Specialty:
                    </label>
                    <input
                      id="cfg-tagline"
                      name="merch_tagline"
                      type="text"
                      maxLength={50}
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      className="merch-studio-input"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* SUB-ACCORDION 2: 👤 Team & Contact Details */}
            {/* ============================================================ */}
            <div
              style={{
                borderRadius: '8px',
                border: '1px solid rgba(var(--tint), 0.10)',
                background: 'rgba(var(--tint), 0.02)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => toggleSubAccordion('contact')}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  background: subAccordions.contact ? 'rgba(var(--tint), 0.05)' : 'transparent',
                  border: 'none',
                  borderBottom: subAccordions.contact ? '1px solid rgba(var(--tint), 0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>👤</span>
                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em' }}>
                    Team &amp; Contact Info
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {phone && (
                    <span style={{ fontSize: '0.64rem', color: 'var(--muted)', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {phone}
                    </span>
                  )}
                  {subAccordions.contact ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}
                </div>
              </button>

              {subAccordions.contact && (
                <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {/* Employee / Owner Name & Title (Business Cards) */}
                  {currentProduct.id === 'biz_cards' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label htmlFor="cfg-person-name" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                          Employee / Owner Name:
                        </label>
                        <input
                          id="cfg-person-name"
                          name="merch_person_name"
                          type="text"
                          maxLength={35}
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          value={personName || ''}
                          placeholder="e.g. John Doe"
                          onChange={(e) => setPersonName?.(e.target.value)}
                          className="merch-studio-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="cfg-person-title" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                          Title / Role:
                        </label>
                        <input
                          id="cfg-person-title"
                          name="merch_person_title"
                          type="text"
                          maxLength={30}
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          value={personTitle || ''}
                          placeholder="e.g. Owner / Electrician"
                          onChange={(e) => setPersonTitle?.(e.target.value)}
                          className="merch-studio-input"
                        />
                      </div>
                    </div>
                  )}

                  {/* Primary & Second Phone with Inline Type Selectors */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <label htmlFor="cfg-phone" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700 }}>
                          Primary Phone:
                        </label>
                        {currentProduct.id === 'biz_cards' && (
                          <select
                            id="cfg-phone-type"
                            value={phoneType || 'Office'}
                            onChange={(e) => setPhoneType?.(e.target.value)}
                            aria-label="Primary Phone Type"
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              border: '1px solid rgba(var(--tint), 0.16)',
                              background: 'rgba(15, 23, 42, 0.85)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            <option value="Office">Office</option>
                            <option value="Work">Work</option>
                            <option value="Cell">Cell</option>
                            <option value="Main">Main</option>
                            <option value="Direct">Direct</option>
                            <option value="">No Label</option>
                          </select>
                        )}
                      </div>
                      <input
                        id="cfg-phone"
                        name="merch_phone"
                        type="text"
                        maxLength={20}
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="merch-studio-input"
                      />
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <label htmlFor="cfg-secondary-phone" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700 }}>
                          Second Phone:
                        </label>
                        {currentProduct.id === 'biz_cards' && (
                          <select
                            id="cfg-secondary-phone-type"
                            value={secondaryPhoneType || 'Cell'}
                            onChange={(e) => setSecondaryPhoneType?.(e.target.value)}
                            aria-label="Second Phone Type"
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              border: '1px solid rgba(var(--tint), 0.16)',
                              background: 'rgba(15, 23, 42, 0.85)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            <option value="Cell">Cell</option>
                            <option value="Work">Work</option>
                            <option value="Office">Office</option>
                            <option value="Direct">Direct</option>
                            <option value="">No Label</option>
                          </select>
                        )}
                      </div>
                      <input
                        id="cfg-secondary-phone"
                        name="merch_secondary_phone"
                        type="text"
                        maxLength={20}
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={secondaryPhone || ''}
                        placeholder="e.g. (555) 987-6543"
                        onChange={(e) => setSecondaryPhone?.(e.target.value)}
                        className="merch-studio-input"
                      />
                    </div>
                  </div>

                  {/* Email Address & Fax # */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label htmlFor="cfg-email" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                        Email Address:
                      </label>
                      <input
                        id="cfg-email"
                        name="merch_email"
                        type="email"
                        maxLength={50}
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={email || ''}
                        placeholder="info@yourcompany.com"
                        onChange={(e) => setEmail?.(e.target.value)}
                        className="merch-studio-input"
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-fax" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                        Fax #:
                      </label>
                      <input
                        id="cfg-fax"
                        name="merch_fax"
                        type="text"
                        maxLength={20}
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={fax || ''}
                        placeholder="e.g. (555) 019-2835"
                        onChange={(e) => setFax?.(e.target.value)}
                        className="merch-studio-input"
                      />
                    </div>
                  </div>

                  {/* Website (Full Width) */}
                  <div>
                    <label htmlFor="cfg-website" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                      Website URL:
                    </label>
                    <input
                      id="cfg-website"
                      name="merch_website"
                      type="text"
                      maxLength={60}
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="merch-studio-input"
                    />
                  </div>

                  {/* Non-card products (Field Notepads): Static License Line */}
                  {currentProduct.id !== 'biz_cards' && (
                    <div>
                      <label htmlFor="cfg-license-notepad" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                        License Line:
                      </label>
                      <input
                        id="cfg-license-notepad"
                        name="merch_license"
                        type="text"
                        maxLength={35}
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={license}
                        onChange={(e) => setLicense(e.target.value)}
                        className="merch-studio-input"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* SUB-ACCORDION 3: 🛡️ Trust Badge & Credentials (Biz Cards) */}
            {/* ============================================================ */}
            {currentProduct.id === 'biz_cards' && (
              <div
                style={{
                  borderRadius: '8px',
                  border: '1px solid rgba(var(--tint), 0.10)',
                  background: 'rgba(var(--tint), 0.02)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSubAccordion('trust')}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    background: subAccordions.trust ? 'rgba(var(--tint), 0.05)' : 'transparent',
                    border: 'none',
                    borderBottom: subAccordions.trust ? '1px solid rgba(var(--tint), 0.08)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '0.85rem' }}>🛡️</span>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em' }}>
                      Trust Badge &amp; Credentials
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {license && (
                      <span style={{ fontSize: '0.64rem', color: 'var(--gold-ink)', fontWeight: 700, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {license}
                      </span>
                    )}
                    {subAccordions.trust ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}
                  </div>
                </button>

                {subAccordions.trust && (
                  <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {/* Badge Type Selector */}
                    <div>
                      <label htmlFor="cfg-credential-type" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                        Badge / Trust Line Type:
                      </label>
                      <select
                        id="cfg-credential-type"
                        value={credentialType || 'license'}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setCredentialType?.(newType);
                          if (!license || license === 'LIC# ROC-389142' || license.includes('LIC#') || license.includes('Years') || license.includes('Owned') || license.includes('Bonded')) {
                            if (newType === 'years_in_biz') setLicense('25+ Years in Business');
                            else if (newType === 'family_owned') setLicense('Father & Son Owned');
                            else if (newType === 'bonded_insured') setLicense('Fully Bonded & Insured');
                            else if (newType === 'license') setLicense('LIC# ROC-389142');
                          }
                        }}
                        className="merch-studio-input"
                        style={{ cursor: 'pointer' }}
                      >
                        <option value="license">License #</option>
                        <option value="years_in_biz"># of Years in Biz</option>
                        <option value="family_owned">Father &amp; Son / Family Owned</option>
                        <option value="bonded_insured">Bonded &amp; Insured</option>
                        <option value="custom">Custom Highlight</option>
                      </select>
                    </div>

                    {/* Badge Text Input */}
                    <div>
                      <label htmlFor="cfg-license" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                        Badge Display Text:
                      </label>
                      <input
                        id="cfg-license"
                        name="merch_license"
                        type="text"
                        maxLength={35}
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={license}
                        placeholder={
                          credentialType === 'years_in_biz'
                            ? 'e.g. 25+ Years in Business'
                            : credentialType === 'family_owned'
                            ? 'e.g. Father & Son Owned'
                            : credentialType === 'bonded_insured'
                            ? 'e.g. Fully Bonded & Insured'
                            : 'e.g. LIC# ROC-389142'
                        }
                        onChange={(e) => setLicense(e.target.value)}
                        className="merch-studio-input"
                      />
                    </div>

                    {/* Quick 1-Touch Presets */}
                    <div>
                      <span style={{ fontSize: '0.64rem', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '0.3rem' }}>
                        Popular 1-Touch Presets:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {[
                          { type: 'license', label: '📜 LIC #', text: 'LIC# ROC-389142' },
                          { type: 'years_in_biz', label: '★ 25+ Years', text: '25+ Years in Business' },
                          { type: 'family_owned', label: '👨‍👦 Father & Son', text: 'Father & Son Owned' },
                          { type: 'family_owned', label: '👨‍👩‍👧 Family Owned', text: 'Family Owned & Operated' },
                          { type: 'bonded_insured', label: '🛡️ Bonded & Insured', text: 'Licensed, Bonded & Insured' },
                        ].map((preset) => (
                          <button
                            key={preset.text}
                            type="button"
                            onClick={() => {
                              setCredentialType?.(preset.type);
                              setLicense(preset.text);
                            }}
                            style={{
                              fontSize: '0.64rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '5px',
                              border: license === preset.text ? '1px solid var(--gold-ink)' : '1px solid rgba(var(--tint), 0.12)',
                              background: license === preset.text ? 'rgba(var(--tint), 0.14)' : 'rgba(var(--tint), 0.04)',
                              color: license === preset.text ? 'var(--gold-ink)' : 'var(--text)',
                              cursor: 'pointer',
                              lineHeight: 1.2,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Live Card Appearance Preview Box */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.45rem 0.65rem',
                        borderRadius: '6px',
                        background: 'rgba(var(--tint), 0.035)',
                        border: '1px dashed rgba(var(--tint), 0.14)',
                        marginTop: '0.15rem',
                      }}
                    >
                      <span style={{ fontSize: '0.64rem', color: '#94a3b8', fontWeight: 700 }}>Card Appearance:</span>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        {renderCardCredential(license, credentialType, effectiveSecondaryColor)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================ */}
            {/* SUB-ACCORDION 4: ✨ Card Copy & Badges (Advanced Overrides) */}
            {/* ============================================================ */}
            {currentProduct.id === 'biz_cards' && (
              <div
                style={{
                  borderRadius: '8px',
                  border: '1px solid rgba(var(--tint), 0.10)',
                  background: 'rgba(var(--tint), 0.02)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSubAccordion('cardCopy')}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    background: subAccordions.cardCopy ? 'rgba(var(--tint), 0.05)' : 'transparent',
                    border: 'none',
                    borderBottom: subAccordions.cardCopy ? '1px solid rgba(var(--tint), 0.08)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ fontSize: '0.85rem' }}>✨</span>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.02em' }}>
                      Card Copy &amp; Badges
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.60rem', color: 'var(--muted)', fontWeight: 600, background: 'rgba(var(--tint), 0.06)', padding: '1px 5px', borderRadius: '3px' }}>
                      Advanced
                    </span>
                    {subAccordions.cardCopy ? <ChevronUp size={14} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--muted)' }} />}
                  </div>
                </button>

                {subAccordions.cardCopy && (
                  <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ fontSize: '0.64rem', color: 'var(--muted)', marginBottom: '0.1rem' }}>
                      Overrides individual card template default badges &amp; footers.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label htmlFor="cfg-badge-label" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                          Header Badge:
                        </label>
                        <input
                          id="cfg-badge-label"
                          name="merch_badge_label"
                          type="text"
                          maxLength={32}
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          value={badgeLabel}
                          placeholder={activeCardTemplate.badgeLabel}
                          onChange={(e) => setBadgeLabel(e.target.value)}
                          className="merch-studio-input"
                        />
                      </div>
                      <div>
                        <label htmlFor="cfg-rating-badge" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                          Sub-Badge / Tag:
                        </label>
                        <input
                          id="cfg-rating-badge"
                          name="merch_rating_badge"
                          type="text"
                          maxLength={36}
                          autoComplete="off"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          value={ratingBadgeText}
                          placeholder={activeCardTemplate.ratingBadgeText}
                          onChange={(e) => setRatingBadgeText(e.target.value)}
                          className="merch-studio-input"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="cfg-bullet-text" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                        Service Highlight / Bullet Line:
                      </label>
                      <input
                        id="cfg-bullet-text"
                        name="merch_bullet_text"
                        type="text"
                        maxLength={60}
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={bulletText}
                        placeholder={activeCardTemplate.bulletText || 'Fast Estimates • Clear Communication'}
                        onChange={(e) => setBulletText(e.target.value)}
                        className="merch-studio-input"
                      />
                    </div>

                    <div>
                      <label htmlFor="cfg-footer-text" style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                        Footer Notice / Disclaimer:
                      </label>
                      <input
                        id="cfg-footer-text"
                        name="merch_footer_text"
                        type="text"
                        maxLength={65}
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        value={footerText}
                        placeholder={activeCardTemplate.footerText || 'Commercial & Residential Specialists • Free Estimates'}
                        onChange={(e) => setFooterText(e.target.value)}
                        className="merch-studio-input"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Colors for non-card products */}
            {currentProduct.id !== 'biz_cards' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
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
                      autoComplete="off"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="merch-studio-input"
                      style={{ padding: '0.35rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.70rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
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
                      autoComplete="off"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="merch-studio-input"
                      style={{ padding: '0.35rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              </div>
            )}
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

        {/* 5 Small Quantity Buttons */}
        <div
          role="radiogroup"
          aria-label="Quantity tiers"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${currentProduct.pricingTiers.length}, 1fr)`,
            gap: '0.35rem',
          }}
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
                  padding: '0.55rem 0.2rem',
                  borderRadius: '7px',
                  border: isSelected ? '2px solid var(--accent, #ff7a21)' : '1px solid rgba(var(--tint), 0.12)',
                  background: isSelected
                    ? 'linear-gradient(145deg, rgba(255, 122, 33, 0.22), rgba(255, 122, 33, 0.08))'
                    : 'rgba(var(--tint), 0.04)',
                  color: isSelected ? '#ffffff' : 'var(--text)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 2px 10px rgba(255, 122, 33, 0.25)' : 'none',
                }}
              >
                <strong
                  style={{
                    display: 'block',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    color: isSelected ? '#ffffff' : 'var(--text)',
                    lineHeight: 1.15,
                  }}
                >
                  {tier.quantity}
                </strong>
                {tier.isPopular && (
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.52rem',
                      fontWeight: 800,
                      color: isSelected ? '#fed7aa' : '#38bdf8',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      lineHeight: 1,
                      marginTop: '2px',
                    }}
                  >
                    Popular
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Tier Price Card - Only Show Price of Selected */}
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem 0.9rem',
            borderRadius: '8px',
            border: '1px solid rgba(var(--tint), 0.12)',
            background: 'rgba(var(--tint), 0.03)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--text)' }}>
                {activeTier.quantity.toLocaleString()} {currentProduct.id === 'biz_cards' ? 'Cards' : 'Pads'}
              </span>
              {activeTier.isPopular && (
                <span
                  style={{
                    fontSize: '0.58rem',
                    fontWeight: 800,
                    color: '#38bdf8',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  Most Popular
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '2px' }}>
              ${activeTier.unitPrice.toFixed(2)}/each
              {activeTier.savingsPercent ? (
                <span style={{ color: '#10b981', fontWeight: 700, marginLeft: '6px' }}>
                  • Save {activeTier.savingsPercent}%
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              ${activeTier.totalPrice.toFixed(2)}
            </div>
            <span style={{ fontSize: '0.62rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Wholesale Rate
            </span>
          </div>
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
