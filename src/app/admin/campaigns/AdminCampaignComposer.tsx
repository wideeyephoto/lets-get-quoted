'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import {
  PLATFORM_AUDIENCES,
  type PlatformAudienceId,
  type PlatformCampaignInput,
} from '@/lib/admin-campaign-types';
import {
  PLATFORM_CAMPAIGN_TEMPLATES,
  type PlatformCampaignTemplate,
} from '@/lib/platform-campaign-templates';
import { EMAIL_THEMES, type EmailThemeId } from '@/emails/brand';
import {
  getAudienceReachAction,
  previewPlatformCampaignAction,
  sendPlatformCampaignBlastAction,
  sendTestPlatformEmailAction,
} from './actions';
import styles from '../admin.module.css';

type Props = {
  adminEmail: string;
  initialAudienceReach: Record<string, number>;
  onCampaignSent?: () => void;
};

export default function AdminCampaignComposer({
  adminEmail,
  initialAudienceReach,
  onCampaignSent,
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('feature-launch');
  const [audience, setAudience] = useState<PlatformAudienceId>('all_contractors');
  const [customEmails, setCustomEmails] = useState<string>('');
  const [senderName, setSenderName] = useState<string>("Let's Get Quoted Product Team");
  const [senderEmail, setSenderEmail] = useState<string>('hello@letsgetquoted.com');
  const [replyTo, setReplyTo] = useState<string>('hello@letsgetquoted.com');
  const [theme, setTheme] = useState<EmailThemeId>('spotlight');
  const [eyebrow, setEyebrow] = useState<string>('Product Update');
  const [subject, setSubject] = useState<string>(
    "New on Let's Get Quoted: Instant Client Approvals & Live Tracking",
  );
  const [preheader, setPreheader] = useState<string>(
    'See what is new in your dashboard today to win more jobs faster.',
  );
  const [heading, setHeading] = useState<string>(
    'Exciting new features are now live in your account',
  );
  const [body, setBody] = useState<string>(
    `Hi {{first_name}},\n\nWe have just released a series of updates designed to help {{business_name}} close jobs faster and save hours on administration each week.\n\nHere is what is new:\n\n• One-Click Quote Approvals: Homeowners can now approve and sign estimates directly from their phone in seconds.\n• Live Arrival Tracking: Automated SMS notifications let your customers see when your crew is on their way.\n• Instant Payment Receipts: Clean, branded PDFs automatically delivered when deposits and invoices are cleared.\n\nThese updates are already available in your workspace — no setup required.`,
  );
  const [ctaLabel, setCtaLabel] = useState<string>('Open your dashboard & explore');
  const [ctaUrl, setCtaUrl] = useState<string>('https://letsgetquoted.com/dashboard');

  // Preview state
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile' | 'html'>('desktop');
  const [previewPending, startPreviewTransition] = useTransition();

  // Audience reach state
  const [audienceCount, setAudienceCount] = useState<number>(
    initialAudienceReach['all_contractors'] ?? 0,
  );
  const [sampleRecipients, setSampleRecipients] = useState<string[]>([]);
  const [reachPending, startReachTransition] = useTransition();

  // Test email state
  const [testEmail, setTestEmail] = useState<string>(adminEmail);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testPending, startTestTransition] = useTransition();

  // Blast modal & sending state
  const [showBlastModal, setShowBlastModal] = useState<boolean>(false);
  const [blastPending, startBlastTransition] = useTransition();
  const [blastResult, setBlastResult] = useState<{
    ok: boolean;
    sentCount?: number;
    failedCount?: number;
    totalRecipients?: number;
    message: string;
  } | null>(null);

  // Generate campaign input payload
  const currentCampaignInput = useCallback((): PlatformCampaignInput => ({
    subject,
    preheader,
    eyebrow,
    heading,
    body,
    ctaLabel,
    ctaUrl,
    senderName,
    senderEmail,
    replyTo,
    theme,
    audience,
    customEmails,
  }), [subject, preheader, eyebrow, heading, body, ctaLabel, ctaUrl, senderName, senderEmail, replyTo, theme, audience, customEmails]);

  // Refresh live HTML preview
  const refreshPreview = useCallback(() => {
    startPreviewTransition(async () => {
      const res = await previewPlatformCampaignAction({
        subject,
        preheader,
        eyebrow,
        heading,
        body,
        ctaLabel,
        ctaUrl,
        senderName,
        senderEmail,
        replyTo,
        theme,
      });
      if (res.success && res.html) {
        setPreviewHtml(res.html);
      }
    });
  }, [subject, preheader, eyebrow, heading, body, ctaLabel, ctaUrl, senderName, senderEmail, replyTo, theme]);

  useEffect(() => {
    refreshPreview();
  }, [refreshPreview]);

  // Update audience reach when audience or custom list changes
  useEffect(() => {
    startReachTransition(async () => {
      const res = await getAudienceReachAction(audience, customEmails);
      if (res.success) {
        setAudienceCount(res.count);
        setSampleRecipients(res.sampleEmails);
      }
    });
  }, [audience, customEmails]);

  // Load a template preset
  function applyTemplate(tpl: PlatformCampaignTemplate) {
    setSelectedTemplateId(tpl.id);
    setSubject(tpl.subject);
    setPreheader(tpl.preheader);
    setEyebrow(tpl.eyebrow);
    setHeading(tpl.heading);
    setBody(tpl.body);
    setCtaLabel(tpl.ctaLabel);
    setCtaUrl(tpl.ctaUrl);
    setTheme(tpl.theme);
    setSenderName(tpl.defaultSenderName);
  }

  // Insert token at cursor in active input or append to body
  function insertToken(token: string, target: 'subject' | 'heading' | 'body') {
    if (target === 'subject') setSubject((prev) => `${prev} ${token}`);
    if (target === 'heading') setHeading((prev) => `${prev} ${token}`);
    if (target === 'body') setBody((prev) => `${prev} ${token}`);
  }

  // Send a test email
  function handleSendTest() {
    setTestResult(null);
    startTestTransition(async () => {
      const res = await sendTestPlatformEmailAction(
        {
          subject,
          preheader,
          eyebrow,
          heading,
          body,
          ctaLabel,
          ctaUrl,
          senderName,
          senderEmail,
          replyTo,
          theme,
        },
        testEmail,
      );

      if (res.success) {
        setTestResult({ ok: true, message: `Test email dispatched to ${testEmail}!` });
      } else {
        setTestResult({ ok: false, message: res.error || 'Failed to send test email.' });
      }
    });
  }

  // Execute full campaign blast
  function handleExecuteBlast() {
    startBlastTransition(async () => {
      const res = await sendPlatformCampaignBlastAction(currentCampaignInput());
      if (res.success) {
        setBlastResult({
          ok: true,
          sentCount: res.sentCount,
          failedCount: res.failedCount,
          totalRecipients: res.totalRecipients,
          message: `Campaign broadcast successfully delivered to ${res.sentCount} of ${res.totalRecipients} recipients!`,
        });
        onCampaignSent?.();
      } else {
        setBlastResult({
          ok: false,
          message: res.error || 'Broadcast failed to execute.',
        });
      }
    });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)', gap: '1.5rem', alignItems: 'start' }}>
      {/* LEFT COLUMN: COMPOSER CONTROLS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        {/* Template Selector Card */}
        <section className={styles.panel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
            <h2 className={styles.panelTitle} style={{ margin: 0 }}>Template Presets</h2>
            <span className={styles.muted} style={{ fontSize: '0.74rem' }}>6 curated presets</span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {PLATFORM_CAMPAIGN_TEMPLATES.map((tpl) => {
              const active = selectedTemplateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className={`${styles.tabBtn} ${active ? styles.tabActive : ''}`}
                  style={{ fontSize: '0.76rem', padding: '0.35rem 0.65rem' }}
                >
                  {tpl.name}
                </button>
              );
            })}
          </div>
        </section>

        {/* Audience Targeting Card */}
        <section className={styles.panel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <h2 className={styles.panelTitle} style={{ margin: 0 }}>Target Audience</h2>
            <span className={`${styles.pill} ${audienceCount > 0 ? styles.good : styles.neutral}`}>
              {reachPending ? 'Calculating...' : `${audienceCount} deliverable recipient${audienceCount === 1 ? '' : 's'}`}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.5rem', marginBottom: '0.8rem' }}>
            {PLATFORM_AUDIENCES.map((aud) => {
              const isSelected = audience === aud.id;
              return (
                <label
                  key={aud.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '0.6rem',
                    background: isSelected ? 'rgba(255, 122, 33, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${isSelected ? 'rgba(255, 122, 33, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isSelected ? '#ffffff' : 'rgba(247, 245, 239, 0.9)' }}>
                      <input
                        type="radio"
                        name="audience"
                        value={aud.id}
                        checked={isSelected}
                        onChange={() => setAudience(aud.id)}
                        style={{ marginRight: '0.4rem', accentColor: '#ff7a21' }}
                      />
                      {aud.label}
                    </span>
                    <span style={{ fontSize: '0.62rem', opacity: 0.8, color: '#ff9447' }}>{aud.badge}</span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(247, 245, 239, 0.55)', paddingLeft: '1.2rem', lineHeight: 1.3 }}>
                    {aud.description}
                  </span>
                </label>
              );
            })}
          </div>

          {audience === 'custom' && (
            <div style={{ marginTop: '0.8rem' }}>
              <label className={styles.formLabel} style={{ display: 'block', marginBottom: '0.3rem' }}>
                Paste Recipient Emails (comma, space, or newline separated)
              </label>
              <textarea
                className={styles.input}
                value={customEmails}
                onChange={(e) => setCustomEmails(e.target.value)}
                placeholder="contractor1@example.com, owner@roofingpro.com&#10;sales@hvacservice.com"
                rows={3}
                style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem' }}
              />
            </div>
          )}

          {sampleRecipients.length > 0 && audience !== 'custom' && (
            <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.7rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(247, 245, 239, 0.5)', letterSpacing: '0.05em' }}>
                Sample Audience Recipients:
              </span>
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                {sampleRecipients.map((s, idx) => (
                  <span key={idx} className={`${styles.pill} ${styles.neutral}`} style={{ fontSize: '0.66rem' }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Sender & Theme Settings */}
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Sender & Theme Configuration</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.8rem' }}>
            <div>
              <label className={styles.formLabel} htmlFor="sender-name-input">From Name</label>
              <input
                id="sender-name-input"
                className={styles.input}
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="Let's Get Quoted"
              />
            </div>
            <div>
              <label className={styles.formLabel} htmlFor="sender-email-input">From Email</label>
              <select
                id="sender-email-input"
                className={styles.input}
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem' }}
              >
                <option value="hello@letsgetquoted.com">hello@letsgetquoted.com</option>
                <option value="support@letsgetquoted.com">support@letsgetquoted.com</option>
                <option value="updates@letsgetquoted.com">updates@letsgetquoted.com</option>
                <option value="brett@letsgetquoted.com">brett@letsgetquoted.com</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
            <div>
              <label className={styles.formLabel} htmlFor="reply-to-input">Reply-To Address</label>
              <input
                id="reply-to-input"
                className={styles.input}
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder="hello@letsgetquoted.com"
              />
            </div>
            <div>
              <label className={styles.formLabel} htmlFor="email-theme-select">Email Theme Shell</label>
              <select
                id="email-theme-select"
                className={styles.input}
                value={theme}
                onChange={(e) => setTheme(e.target.value as EmailThemeId)}
                style={{ width: '100%', marginTop: '0.25rem' }}
              >
                {EMAIL_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.outcome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Message Content Composer */}
        <section className={styles.panel}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <h2 className={styles.panelTitle} style={{ margin: 0 }}>Message Content</h2>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <span className={styles.muted} style={{ fontSize: '0.7rem' }}>Insert tag:</span>
              <button
                type="button"
                onClick={() => insertToken('{{business_name}}', 'body')}
                className={`${styles.pill} ${styles.accent}`}
                style={{ cursor: 'pointer', fontSize: '0.66rem' }}
              >
                + Business
              </button>
              <button
                type="button"
                onClick={() => insertToken('{{first_name}}', 'body')}
                className={`${styles.pill} ${styles.accent}`}
                style={{ cursor: 'pointer', fontSize: '0.66rem' }}
              >
                + Name
              </button>
              <button
                type="button"
                onClick={() => insertToken('{{app_url}}', 'body')}
                className={`${styles.pill} ${styles.neutral}`}
                style={{ cursor: 'pointer', fontSize: '0.66rem' }}
              >
                + App Link
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <label className={styles.formLabel} htmlFor="subject-input">Subject Line</label>
                <span className={styles.muted} style={{ fontSize: '0.68rem' }}>{subject.length} chars</span>
              </div>
              <input
                id="subject-input"
                className={styles.input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ width: '100%', marginTop: '0.2rem', fontWeight: 600 }}
                placeholder="Announcement subject..."
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div>
                <label className={styles.formLabel} htmlFor="preheader-input">Preheader (Preview Text)</label>
                <input
                  id="preheader-input"
                  className={styles.input}
                  value={preheader}
                  onChange={(e) => setPreheader(e.target.value)}
                  style={{ width: '100%', marginTop: '0.2rem' }}
                  placeholder="Inbox preview snippet..."
                />
              </div>
              <div>
                <label className={styles.formLabel} htmlFor="eyebrow-input">Eyebrow Kicker</label>
                <input
                  id="eyebrow-input"
                  className={styles.input}
                  value={eyebrow}
                  onChange={(e) => setEyebrow(e.target.value)}
                  style={{ width: '100%', marginTop: '0.2rem' }}
                  placeholder="PRODUCT UPDATE"
                />
              </div>
            </div>

            <div>
              <label className={styles.formLabel} htmlFor="heading-input">Main Email Heading</label>
              <input
                id="heading-input"
                className={styles.input}
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                style={{ width: '100%', marginTop: '0.2rem' }}
                placeholder="Headline inside the email..."
              />
            </div>

            <div>
              <label className={styles.formLabel} htmlFor="body-input">Body Copy (Paragraphs &amp; Bullet points)</label>
              <textarea
                id="body-input"
                className={styles.input}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                style={{ width: '100%', marginTop: '0.2rem', lineHeight: 1.5 }}
                placeholder="Write your email announcement..."
              />
              <span className={styles.muted} style={{ fontSize: '0.7rem', marginTop: '0.2rem', display: 'block' }}>
                Double line breaks create paragraphs. Lines starting with • or - become bullet lists.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div>
                <label className={styles.formLabel} htmlFor="cta-label-input">CTA Button Label (Optional)</label>
                <input
                  id="cta-label-input"
                  className={styles.input}
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  style={{ width: '100%', marginTop: '0.2rem' }}
                  placeholder="Open dashboard"
                />
              </div>
              <div>
                <label className={styles.formLabel} htmlFor="cta-url-input">CTA Button URL</label>
                <input
                  id="cta-url-input"
                  className={styles.input}
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  style={{ width: '100%', marginTop: '0.2rem' }}
                  placeholder="https://letsgetquoted.com/dashboard"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Test Send & Broadcast Action Card */}
        <section className={styles.panel} style={{ borderTop: '2px solid #ff7a21' }}>
          <h2 className={styles.panelTitle}>Test Send &amp; Delivery Guard</h2>
          
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
            <input
              className={styles.input}
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="admin@company.com"
              style={{ flex: 1, minWidth: '220px' }}
            />
            <button
              type="button"
              onClick={handleSendTest}
              disabled={testPending || !testEmail}
              className="button small secondary"
              style={{ whiteSpace: 'nowrap' }}
            >
              {testPending ? 'Sending Test...' : 'Send Live Test'}
            </button>
          </div>

          {testResult && (
            <div
              className={`${styles.banner} ${testResult.ok ? styles.ok : styles.err}`}
              style={{ padding: '0.5rem 0.8rem', fontSize: '0.78rem', marginBottom: '0.8rem' }}
            >
              {testResult.message}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.8rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff' }}>Ready to broadcast?</span>
              <span className={styles.muted} style={{ fontSize: '0.74rem', display: 'block' }}>
                Sends to {audienceCount} verified recipients on {audience.replace(/_/g, ' ')}.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setBlastResult(null);
                setShowBlastModal(true);
              }}
              disabled={audienceCount === 0 || !subject || !body}
              className="button primary"
              style={{ padding: '0.55rem 1.25rem', fontWeight: 800 }}
            >
              Send Campaign Blast →
            </button>
          </div>
        </section>
      </div>

      {/* RIGHT COLUMN: LIVE VISUAL PREVIEW */}
      <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <section className={styles.panel} style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={styles.pulseDot} style={{ background: previewPending ? '#fbbf24' : '#34d399' }} />
              <strong style={{ fontSize: '0.82rem', color: '#ffffff' }}>Live Email Preview</strong>
            </div>
            <div className={styles.filterTabs}>
              <button
                type="button"
                className={`${styles.filterTab} ${viewMode === 'desktop' ? styles.on : ''}`}
                onClick={() => setViewMode('desktop')}
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
              >
                Desktop (600px)
              </button>
              <button
                type="button"
                className={`${styles.filterTab} ${viewMode === 'mobile' ? styles.on : ''}`}
                onClick={() => setViewMode('mobile')}
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
              >
                Mobile (375px)
              </button>
              <button
                type="button"
                className={`${styles.filterTab} ${viewMode === 'html' ? styles.on : ''}`}
                onClick={() => setViewMode('html')}
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
              >
                HTML
              </button>
            </div>
          </div>

          {/* Email Header Simulation */}
          <div
            style={{
              padding: '0.6rem 0.8rem',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '0.5rem 0.5rem 0 0',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderBottom: 'none',
              fontSize: '0.74rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.15rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span className={styles.muted}>From:</span>
              <strong style={{ color: '#ffffff' }}>{senderName} &lt;{senderEmail}&gt;</strong>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span className={styles.muted}>Subject:</span>
              <strong style={{ color: '#ff9447' }}>{subject || '(Empty subject)'}</strong>
            </div>
            {preheader && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className={styles.muted}>Snippet:</span>
                <span style={{ color: 'rgba(247, 245, 239, 0.65)' }}>{preheader}</span>
              </div>
            )}
          </div>

          {/* Preview Viewport Frame */}
          <div
            style={{
              background: '#0d131f',
              padding: '0.8rem',
              borderRadius: '0 0 0.5rem 0.5rem',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              minHeight: '480px',
              maxHeight: 'calc(100vh - 12rem)',
              overflowY: 'auto',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {viewMode === 'html' ? (
              <pre
                style={{
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: '#94a3b8',
                  width: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  margin: 0,
                  userSelect: 'all',
                }}
              >
                {previewHtml}
              </pre>
            ) : (
              <div
                style={{
                  width: viewMode === 'mobile' ? '375px' : '100%',
                  maxWidth: '600px',
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  transition: 'width 0.2s ease',
                  background: '#ffffff',
                }}
              >
                <iframe
                  title="Live Platform Email Preview"
                  srcDoc={previewHtml}
                  style={{
                    width: '100%',
                    height: '620px',
                    border: 'none',
                    display: 'block',
                    background: '#ffffff',
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            )}
          </div>

          {/* Deliverability & Compliance Checks */}
          <div style={{ marginTop: '0.8rem', padding: '0.6rem 0.75rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '0.5rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#34d399' }}>
              ✓ Deliverability &amp; CAN-SPAM Compliance Ready
            </span>
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.72rem', color: 'rgba(247, 245, 239, 0.65)', lineHeight: 1.45 }}>
              <li>Verified sender domain authentication via SPF &amp; DKIM.</li>
              <li>RFC 8058 one-click List-Unsubscribe headers included.</li>
              <li>Platform opt-out suppression ledger automatically applied.</li>
            </ul>
          </div>
        </section>
      </div>

      {/* CONFIRMATION BLAST MODAL */}
      {showBlastModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            className={styles.panel}
            style={{
              maxWidth: '540px',
              width: '100%',
              background: '#08121f',
              border: '1px solid rgba(255, 122, 33, 0.4)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
              padding: '1.6rem',
            }}
          >
            <p className={styles.eyebrow} style={{ color: '#ff7a21' }}>Broadcast Confirmation</p>
            <h2 className={styles.title} style={{ fontSize: '1.3rem', margin: '0.3rem 0 0.8rem' }}>
              Confirm Platform Campaign Send
            </h2>

            {blastResult ? (
              <div>
                <div
                  className={`${styles.banner} ${blastResult.ok ? styles.ok : styles.err}`}
                  style={{ marginBottom: '1rem' }}
                >
                  <strong>{blastResult.ok ? 'Broadcast Complete' : 'Broadcast Error'}</strong>
                  <p style={{ margin: '0.3rem 0 0' }}>{blastResult.message}</p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBlastModal(false);
                      setBlastResult(null);
                    }}
                    className="button small"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.84rem', color: 'rgba(247, 245, 239, 0.85)', lineHeight: 1.5, margin: '0 0 1rem' }}>
                  You are about to broadcast this email to{' '}
                  <strong style={{ color: '#ffffff' }}>{audienceCount} recipients</strong> across the{' '}
                  <strong style={{ color: '#ff9447' }}>{audience.replace(/_/g, ' ')}</strong> audience.
                </p>

                <div
                  style={{
                    padding: '0.8rem',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '0.6rem',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontSize: '0.78rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    marginBottom: '1.2rem',
                  }}
                >
                  <div><span className={styles.muted}>From:</span> {senderName} &lt;{senderEmail}&gt;</div>
                  <div><span className={styles.muted}>Subject:</span> <strong>{subject}</strong></div>
                  <div><span className={styles.muted}>Audience Count:</span> {audienceCount} deliverable recipients</div>
                  <div><span className={styles.muted}>Theme:</span> {theme}</div>
                </div>

                <p className={styles.muted} style={{ fontSize: '0.74rem', margin: '0 0 1.2rem' }}>
                  This action will immediately begin queued delivery in concurrent batches with verified opt-out enforcement.
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowBlastModal(false)}
                    disabled={blastPending}
                    className="button small secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteBlast}
                    disabled={blastPending}
                    className="button small primary"
                    style={{ background: '#ff7a21', borderColor: '#ff7a21', color: '#ffffff', fontWeight: 800 }}
                  >
                    {blastPending ? 'Broadcasting Batches...' : `Authorize & Send (${audienceCount})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
