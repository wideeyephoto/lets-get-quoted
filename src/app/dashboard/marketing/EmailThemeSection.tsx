'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import SaveButton from '@/components/save-button';
import {
  EMAIL_THEMES,
  normalizeEmailTheme,
  recommendEmailTheme,
  safeAccent,
  type EmailBrand,
  type EmailThemeId,
} from '@/emails/brand';
import {
  EMAIL_PREVIEW_TABS,
  renderSampleEmailPreviewSync,
  type EmailPreviewKind,
} from '@/emails/renderers';
import styles from './EmailThemeSection.module.css';

type Props = {
  businessName: string;
  accent: string | null;
  logoUrl: string | null;
  currentTheme: string | null | undefined;
  websiteTemplate?: string | null;
  userEmail?: string | null;
  replyToEmail?: string | null;
  saveAction?: (formData: FormData) => Promise<void>;
  sendTestAction?: (formData: FormData) => Promise<{ success: boolean; recipient: string }>;
};

export default function EmailThemeSection(props: Props) {
  const initialTheme = normalizeEmailTheme(props.currentTheme);
  const [selectedTheme, setSelectedTheme] = useState<EmailThemeId>(initialTheme);
  const [activeTab, setActiveTab] = useState<EmailPreviewKind>('quote');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  const [isSendingTest, startSendTransition] = useTransition();
  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: '',
  });

  const recommendedTheme = useMemo(() => {
    return props.websiteTemplate ? recommendEmailTheme(props.websiteTemplate) : null;
  }, [props.websiteTemplate]);

  const brandData: Partial<EmailBrand> = useMemo(() => ({
    businessName: props.businessName,
    accent: safeAccent(props.accent),
    logoUrl: props.logoUrl,
    phone: '(555) 234-5678',
    siteUrl: 'https://yourbusiness.com',
    replyTo: props.replyToEmail || props.userEmail || 'hello@yourbusiness.com',
  }), [props.businessName, props.accent, props.logoUrl, props.replyToEmail, props.userEmail]);

  // Active envelope information for the selected preview tab & theme
  const activeEnvelope = useMemo(() => {
    return renderSampleEmailPreviewSync(selectedTheme, activeTab, brandData);
  }, [selectedTheme, activeTab, brandData]);

  // Precomputed previews for all themes on the active tab
  const themePreviews = useMemo(() => {
    const map = new Map<EmailThemeId, string>();
    for (const theme of EMAIL_THEMES) {
      const res = renderSampleEmailPreviewSync(theme.id, activeTab, brandData);
      map.set(theme.id, res.html);
    }
    return map;
  }, [activeTab, brandData]);

  const handleSendTest = () => {
    if (!props.sendTestAction) {
      setTestStatus({
        type: 'success',
        message: `[Demo Mode] Simulated test send for "${EMAIL_THEMES.find((t) => t.id === selectedTheme)?.name}" (${activeTab})!`,
      });
      return;
    }

    if (!props.sendTestAction) {
      setTestStatus({
        type: 'error',
        message: 'Test email action is not available in this view.',
      });
      return;
    }
    const sendAction = props.sendTestAction;

    startSendTransition(async () => {
      try {
        setTestStatus({ type: 'idle', message: '' });
        const formData = new FormData();
        formData.append('emailTheme', selectedTheme);
        formData.append('previewKind', activeTab);
        const result = await sendAction(formData);
        setTestStatus({
          type: 'success',
          message: `Test email sent to ${result.recipient}. Check your inbox!`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to send test email.';
        setTestStatus({ type: 'error', message: msg });
      }
    });
  };

  return (
    <section className="panel workspace-section-card" id="email-theme">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Outgoing email</p>
        <h2>Choose your email appearance</h2>
      </div>

      <p className={`workspace-details-copy ${styles.intro}`}>
        All customer quotes, invoices, visit reminders, campaigns, and account alerts share one cohesive brand theme.
        Every theme includes your logo, brand color, contrasting logo plate, accessible WCAG AA contrast, and reply routing.
      </p>

      {/* Control Toolbar: Template Scenario Tabs & Viewport Switch */}
      <div className={styles.toolbar}>
        <div className={styles.tabGroup} role="tablist" aria-label="Email preview types">
          {EMAIL_PREVIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
              onClick={() => {
                setActiveTab(tab.id);
                setTestStatus({ type: 'idle', message: '' });
              }}
            >
              <span className={styles.tabLabel}>{tab.label}</span>
              <span className={styles.recipientBadge}>{tab.recipientType}</span>
            </button>
          ))}
        </div>

        <div className={styles.viewportToggle} role="group" aria-label="Preview viewport">
          <button
            type="button"
            className={`${styles.viewBtn} ${viewport === 'desktop' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewport('desktop')}
            title="Desktop view (600px)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <span>Desktop</span>
          </button>
          <button
            type="button"
            className={`${styles.viewBtn} ${viewport === 'mobile' ? styles.viewBtnActive : ''}`}
            onClick={() => setViewport('mobile')}
            title="Mobile view (375px)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
            <span>Mobile</span>
          </button>
        </div>
      </div>

      {/* Inbox Envelope Card (Subject, From, Preheader, Reply-To) */}
      <div className={styles.envelopeCard}>
        <div className={styles.envelopeRow}>
          <span className={styles.envelopeLabel}>Subject:</span>
          <span className={styles.envelopeSubject}>{activeEnvelope.subject}</span>
        </div>
        <div className={styles.envelopeMetaRow}>
          <div className={styles.envelopeMetaItem}>
            <span className={styles.envelopeLabel}>From:</span>
            <span className={styles.envelopeVal}>{activeEnvelope.from}</span>
          </div>
          <div className={styles.envelopeMetaItem}>
            <span className={styles.envelopeLabel}>Reply-To:</span>
            <span className={styles.envelopeVal}>{activeEnvelope.replyTo}</span>
            <Link
              href="/dashboard/settings#business-basics"
              style={{ fontSize: '0.72rem', marginLeft: '0.4rem', color: 'var(--accent, #3b82f6)', textDecoration: 'underline' }}
              title="Change customer reply-to email in Settings"
            >
              Change
            </Link>
          </div>
        </div>
        <div className={styles.envelopeRow}>
          <span className={styles.envelopeLabel}>Preheader:</span>
          <span className={styles.envelopePreheader}>{activeEnvelope.preheader}</span>
        </div>
      </div>

      {/* Theme Cards Grid */}
      <form action={props.saveAction}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Email theme</legend>

          {recommendedTheme && (
            <div className={styles.matchPrompt}>
              <div className={styles.matchPromptText}>
                <strong>Match my website:</strong> Your website is using the{' '}
                <span className={styles.templateHighlight}>{props.websiteTemplate}</span> template. We recommend{' '}
                <span className={styles.templateHighlight}>
                  {EMAIL_THEMES.find((t) => t.id === recommendedTheme)?.name}
                </span>{' '}
                for consistent brand continuity across web and email.
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

          <div className={styles.grid}>
            {EMAIL_THEMES.map((theme) => {
              const isChecked = theme.id === selectedTheme;
              const isRecommendedWebsite = theme.id === recommendedTheme;
              const isDefaultRecommended = theme.id === 'studio' && !recommendedTheme;
              const html = themePreviews.get(theme.id) || '';

              return (
                <label
                  className={`${styles.card} ${isChecked ? styles.cardSelected : ''}`}
                  key={theme.id}
                  onClick={() => setSelectedTheme(theme.id)}
                >
                  <input
                    className={styles.radio}
                    type="radio"
                    name="emailTheme"
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
                    <span className={styles.check} aria-hidden="true">✓</span>
                  </div>

                  <div className={`${styles.preview} ${viewport === 'mobile' ? styles.previewMobile : ''}`} aria-hidden="true">
                    <iframe
                      className={`${styles.iframe} ${viewport === 'mobile' ? styles.iframeMobile : ''}`}
                      srcDoc={html}
                      title={`${theme.name} ${activeTab} email preview`}
                      tabIndex={-1}
                      sandbox=""
                    />
                  </div>

                  <div className={styles.descriptionArea}>
                    <p className={styles.description}>{theme.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Test Send Feedback Banner */}
        {testStatus.message && (
          <div
            className={`${styles.feedbackBanner} ${
              testStatus.type === 'error' ? styles.feedbackError : styles.feedbackSuccess
            }`}
            role="alert"
          >
            {testStatus.type === 'success' ? '✓ ' : '⚠ '}
            {testStatus.message}
          </div>
        )}

        {/* Bottom Actions Bar: Send Test + Save Theme */}
        <div className={styles.actionsBar}>
          <div className={styles.testActionBlock}>
            <button
              type="button"
              className={styles.testBtn}
              onClick={handleSendTest}
              disabled={isSendingTest}
            >
              {isSendingTest ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  Sending test...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                  Send test email to myself
                </>
              )}
            </button>
            <span className={styles.testHint}>
              Sends a live test of <strong>{EMAIL_THEMES.find((t) => t.id === selectedTheme)?.name}</strong> (
              {activeTab}) to your inbox.
            </span>
          </div>

          <div className={styles.saveActionBlock}>
            {props.saveAction ? (
              <SaveButton onlyWhenChanged>Save email theme</SaveButton>
            ) : (
              <span className={styles.demoNotice}>Interactive preview demo</span>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
