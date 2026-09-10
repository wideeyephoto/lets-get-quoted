'use client';

import React, { useState } from 'react';
import { X, Palette, Layout, Phone, Globe, Mail, Shield, Check } from 'lucide-react';
import type { CardDesignDocument, CardCuratedTemplateId } from '@/lib/merchandise/card-renderer';
import styles from './card-purchase.module.css';

interface CardDetailsEditorProps {
  document: CardDesignDocument;
  onSave: (updated: CardDesignDocument) => void;
  onCancel: () => void;
}

const TEMPLATE_OPTIONS: { id: CardCuratedTemplateId; label: string; description: string }[] = [
  {
    id: 'clean',
    label: 'Clean & Modern',
    description: 'Crisp white cardstock with prominent contact typography and elegant balance.',
  },
  {
    id: 'bold',
    label: 'High-Impact Bold',
    description: 'Solid brand accent banner and high-contrast styling for maximum visibility.',
  },
  {
    id: 'booking',
    label: 'Instant Booking',
    description: 'Designed around customer action with prominent QR code and instant appointment callout.',
  },
];

const PRESET_COLORS = [
  { label: 'Navy Blue', hex: '#1e3a8a' },
  { label: 'Sky Blue', hex: '#0284c7' },
  { label: 'Forest Green', hex: '#16a34a' },
  { label: 'Charcoal Black', hex: '#0f172a' },
  { label: 'Crimson Red', hex: '#b91c1c' },
  { label: 'Safety Amber', hex: '#d97706' },
];

export default function CardDetailsEditor({
  document,
  onSave,
  onCancel,
}: CardDetailsEditorProps) {
  const [form, setForm] = useState({
    businessName: document.content.businessName,
    trade: document.content.trade || '',
    tagline: document.content.tagline || '',
    phone: document.content.phone,
    website: document.content.website || '',
    email: document.content.email || '',
    license: document.content.license || '',
    templateId: document.templateId,
    accentColor: document.colors.accentColor,
    qrDestination: document.qr.destinationUrl,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSave = () => {
    const newErrors: Record<string, string> = {};
    if (!form.businessName.trim() || form.businessName.trim().length < 2) {
      newErrors.businessName = 'Business name must be at least 2 characters';
    }
    if (!form.phone.replace(/\D/g, '') || form.phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = 'Valid 10-digit phone number is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const updatedDoc: CardDesignDocument = {
      ...document,
      templateId: form.templateId,
      content: {
        ...document.content,
        businessName: form.businessName.trim(),
        trade: form.trade.trim() || undefined,
        tagline: form.tagline.trim() || undefined,
        phone: form.phone.trim(),
        website: form.website.trim() || undefined,
        email: form.email.trim() || undefined,
        license: form.license.trim() || undefined,
      },
      colors: {
        ...document.colors,
        accentColor: form.accentColor,
      },
      qr: {
        ...document.qr,
        destinationUrl: form.qrDestination.trim() || document.qr.destinationUrl,
      },
    };

    onSave(updatedDoc);
  };

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalWindow} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3 className={styles.modalTitle}>Edit Business Card Details</h3>
            <p className={styles.modalSubtitle}>
              Customize the details, color accent, and layout printed on your cards.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className={styles.modalCloseBtn}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Layout Template Selector */}
        <div className={styles.formField}>
          <label className={styles.inputLabel}>
            <Layout size={14} />
            <span>Curated Layout</span>
          </label>
          <div className={styles.templateOptionGrid}>
            {TEMPLATE_OPTIONS.map((tmpl) => {
              const isActive = form.templateId === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, templateId: tmpl.id }))}
                  className={`${styles.templateCard} ${isActive ? styles.templateCardActive : ''}`}
                >
                  <div className={styles.templateCardHeader}>
                    <span className={styles.templateCardLabel}>{tmpl.label}</span>
                    {isActive && <Check size={16} style={{ color: 'var(--accent)' }} />}
                  </div>
                  <p className={styles.templateCardDesc}>{tmpl.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent Color Picker */}
        <div className={styles.formField}>
          <label className={styles.inputLabel}>
            <Palette size={14} />
            <span>Brand Accent Color</span>
          </label>
          <div className={styles.colorRow}>
            {PRESET_COLORS.map((col) => {
              const isActive = form.accentColor.toLowerCase() === col.hex.toLowerCase();
              return (
                <button
                  key={col.hex}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, accentColor: col.hex }))}
                  style={{ backgroundColor: col.hex }}
                  className={`${styles.colorSwatch} ${isActive ? styles.colorSwatchActive : ''}`}
                  title={col.label}
                  aria-label={col.label}
                />
              );
            })}
            <input
              type="color"
              value={form.accentColor}
              onChange={(e) => setForm((prev) => ({ ...prev, accentColor: e.target.value }))}
              className={styles.colorCustomInput}
              title="Custom color"
              aria-label="Custom color"
            />
          </div>
        </div>

        {/* Contact Form Fields */}
        <div className={styles.formGrid}>
          <div className={`${styles.formField} ${styles.formColSpan2}`}>
            <label className={styles.inputLabel}>Company Name *</label>
            <input
              type="text"
              value={form.businessName}
              onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
              className={`${styles.formInput} ${errors.businessName ? styles.formInputError : ''}`}
            />
            {errors.businessName && <span className={styles.formErrorText}>{errors.businessName}</span>}
          </div>

          <div className={styles.formField}>
            <label className={styles.inputLabel}>Trade Specialty</label>
            <input
              type="text"
              placeholder="e.g. Roofing & Restoration"
              value={form.trade}
              onChange={(e) => setForm((prev) => ({ ...prev, trade: e.target.value }))}
              className={styles.formInput}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.inputLabel}>
              <Phone size={13} />
              <span>Telephone Number *</span>
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              className={`${styles.formInput} ${errors.phone ? styles.formInputError : ''}`}
            />
            {errors.phone && <span className={styles.formErrorText}>{errors.phone}</span>}
          </div>

          <div className={styles.formField}>
            <label className={styles.inputLabel}>
              <Globe size={13} />
              <span>Website URL</span>
            </label>
            <input
              type="text"
              placeholder="e.g. www.apexroofing.com"
              value={form.website}
              onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
              className={styles.formInput}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.inputLabel}>
              <Mail size={13} />
              <span>Email Address</span>
            </label>
            <input
              type="email"
              placeholder="e.g. quotes@apexroofing.com"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              className={styles.formInput}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.inputLabel}>
              <Shield size={13} />
              <span>License or Registration #</span>
            </label>
            <input
              type="text"
              placeholder="e.g. LIC #94820"
              value={form.license}
              onChange={(e) => setForm((prev) => ({ ...prev, license: e.target.value }))}
              className={styles.formInput}
            />
          </div>

          <div className={`${styles.formField} ${styles.formColSpan2}`}>
            <label className={styles.inputLabel}>QR Code Target Destination</label>
            <input
              type="url"
              value={form.qrDestination}
              onChange={(e) => setForm((prev) => ({ ...prev, qrDestination: e.target.value }))}
              className={styles.formInput}
              placeholder="https://..."
            />
            <span className={styles.formHelperText}>
              When customers scan the card with their phone camera, it directs them immediately to this URL.
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.modalFooter}>
          <button
            type="button"
            onClick={onCancel}
            className={styles.modalSecondaryBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={styles.modalPrimaryBtn}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
