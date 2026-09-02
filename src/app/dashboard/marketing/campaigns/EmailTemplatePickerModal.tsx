'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import {
  EMAIL_THEMES,
  normalizeEmailTheme,
  recommendEmailTheme,
  safeAccent,
  type EmailBrand,
  type EmailThemeId,
} from '@/emails/brand';
import { renderSampleEmailPreviewSync } from '@/emails/renderers';
import { updateEmailThemeAction } from '../actions';
import styles from './EmailTemplatePickerModal.module.css';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  currentTheme?: string | null;
  websiteTemplate?: string | null;
  businessName?: string;
  accent?: string | null;
  logoUrl?: string | null;
  onThemeSaved?: (theme: EmailThemeId) => void;
};

export default function EmailTemplatePickerModal({
  isOpen,
  onClose,
  currentTheme,
  websiteTemplate,
  businessName = 'Your business',
  accent,
  logoUrl,
  onThemeSaved,
}: Props) {
  const initialTheme = normalizeEmailTheme(currentTheme);
  const [selectedTheme, setSelectedTheme] = useState<EmailThemeId>(initialTheme);
  const [mounted, setMounted] = useState(false);
  const [isSaving, startSaveTransition] = useTransition();
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedTheme(normalizeEmailTheme(currentTheme));
      setSavedSuccess(false);
      setErrorMessage(null);
    }
  }, [isOpen, currentTheme]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  const recommendedTheme = useMemo(() => {
    return websiteTemplate ? recommendEmailTheme(websiteTemplate) : null;
  }, [websiteTemplate]);

  const brandData: Partial<EmailBrand> = useMemo(
    () => ({
      businessName,
      accent: safeAccent(accent),
      logoUrl: logoUrl ?? null,
      phone: '(555) 234-5678',
      siteUrl: 'https://yourbusiness.com',
      replyTo: 'hello@yourbusiness.com',
    }),
    [businessName, accent, logoUrl]
  );

  // Precomputed previews for all themes on the campaign scenario
  const themePreviews = useMemo(() => {
    const map = new Map<EmailThemeId, string>();
    for (const theme of EMAIL_THEMES) {
      const res = renderSampleEmailPreviewSync(theme.id, 'campaign', brandData);
      map.set(theme.id, res.html);
    }
    return map;
  }, [brandData]);

  const handleSave = () => {
    setErrorMessage(null);
    startSaveTransition(async () => {
      try {
        const formData = new FormData();
        formData.append('emailTheme', selectedTheme);
        await updateEmailThemeAction(formData);
        setSavedSuccess(true);
        onThemeSaved?.(selectedTheme);
        setTimeout(() => {
          onClose();
        }, 350);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not save email template.');
      }
    });
  };

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose Email Template"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className={styles.topAccentRim} />

        {/* Modal Header */}
        <div className={styles.header}>
          <div>
            <div className={styles.headerBadge}>Email Appearance</div>
            <h2 className={styles.title}>Choose Email Template</h2>
            <p className={styles.subtitle}>
              Select the design layout and styling for your customer emails, campaigns, and test sends.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close email template selector"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.body}>
          {recommendedTheme && (
            <div className={styles.matchPrompt}>
              <div className={styles.matchPromptText}>
                <strong>Match my website:</strong> Your website uses the{' '}
                <span className={styles.templateHighlight}>{websiteTemplate}</span> template. We recommend{' '}
                <span className={styles.templateHighlight}>
                  {EMAIL_THEMES.find((t) => t.id === recommendedTheme)?.name}
                </span>{' '}
                for brand consistency.
              </div>
              {selectedTheme !== recommendedTheme && (
                <button
                  type="button"
                  className={styles.matchApplyBtn}
                  onClick={() => setSelectedTheme(recommendedTheme)}
                >
                  Apply {EMAIL_THEMES.find((t) => t.id === recommendedTheme)?.name}
                </button>
              )}
            </div>
          )}

          {/* Theme Cards Grid */}
          <div className={styles.grid} role="radiogroup" aria-label="Available email templates">
            {EMAIL_THEMES.map((theme) => {
              const isChecked = theme.id === selectedTheme;
              const isRecommendedWebsite = theme.id === recommendedTheme;
              const isDefaultRecommended = theme.id === 'studio' && !recommendedTheme;
              const html = themePreviews.get(theme.id) || '';

              return (
                <label
                  key={theme.id}
                  className={`${styles.card} ${isChecked ? styles.cardSelected : ''}`}
                  onClick={() => setSelectedTheme(theme.id)}
                >
                  <input
                    className={styles.radio}
                    type="radio"
                    name="modalEmailTheme"
                    value={theme.id}
                    checked={isChecked}
                    onChange={() => setSelectedTheme(theme.id)}
                  />
                  <div className={styles.cardTop}>
                    <div className={styles.titleArea}>
                      <strong className={styles.themeTitle}>{theme.name}</strong>
                      {isRecommendedWebsite ? (
                        <span className={styles.websiteBadge}>Matches Website</span>
                      ) : isDefaultRecommended ? (
                        <span className={styles.recommendedBadge}>Recommended</span>
                      ) : null}
                    </div>
                    <span className={styles.check} aria-hidden="true">
                      {isChecked ? '✓' : ''}
                    </span>
                  </div>

                  <div className={styles.preview} aria-hidden="true">
                    <iframe
                      className={styles.iframe}
                      srcDoc={html}
                      title={`${theme.name} email preview`}
                      tabIndex={-1}
                      sandbox=""
                    />
                  </div>

                  <div className={styles.descriptionArea}>
                    <span className={styles.outcome}>{theme.outcome}</span>
                    <p className={styles.description}>{theme.description}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {errorMessage && (
            <p style={{ color: 'var(--red, #ef4444)', fontSize: '0.82rem', margin: 0 }} role="alert">
              ⚠️ {errorMessage}
            </p>
          )}
        </div>

        {/* Modal Footer */}
        <div className={styles.footer}>
          <p className={styles.footerNote}>
            All quotes, invoices, visit reminders, and campaigns share this unified design.
          </p>
          <div className={styles.footerActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                'Saving template…'
              ) : savedSuccess ? (
                'Saved ✓'
              ) : (
                `Use ${EMAIL_THEMES.find((t) => t.id === selectedTheme)?.name || 'Theme'}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
