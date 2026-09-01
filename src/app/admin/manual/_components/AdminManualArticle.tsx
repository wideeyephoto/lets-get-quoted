'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { ManualArticle, ManualArticleSummary } from '@/lib/admin-manual';
import { ADMIN_MANUAL_VISUAL_COMPONENTS } from '@/components/admin-manual/visuals';
import styles from '../manual.module.css';

interface AdminManualArticleProps {
  article: ManualArticle;
  prevArticle?: ManualArticleSummary | null;
  nextArticle?: ManualArticleSummary | null;
}

export default function AdminManualArticle({
  article,
  prevArticle,
  nextArticle,
}: AdminManualArticleProps) {
  const VisualComponent = article.visualId
    ? ADMIN_MANUAL_VISUAL_COMPONENTS[article.visualId]
    : null;

  // Interactive Checklist with sessionStorage persistence
  const storageKey = `manual_checklist_${article.slug}`;
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showIncidentShare, setShowIncidentShare] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        setCheckedSteps(JSON.parse(saved));
      }
    } catch {
      // Ignore storage read errors
    }
  }, [storageKey]);

  const toggleStep = (stepNumber: number) => {
    setCheckedSteps((prev) => {
      const updated = { ...prev, [stepNumber]: !prev[stepNumber] };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // Ignore storage write errors
      }
      return updated;
    });
  };

  const resetChecklist = () => {
    setCheckedSteps({});
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors
    }
  };

  const totalSteps = article.procedure.length;
  const completedSteps = useMemo(() => {
    return article.procedure.filter((s) => checkedSteps[s.stepNumber]).length;
  }, [article.procedure, checkedSteps]);

  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  const incidentMarkdown = `🚨 *Operating Runbook: ${article.title}*
- *Guide:* https://app.letsgetquoted.com/admin/manual/${article.slug}
- *Chapter:* ${article.chapterTitle}
- *Owner:* ${article.owner} | *Escalation:* ${article.escalationContact}
- *Risk Level:* ${article.riskLevel.toUpperCase()}${article.requiresMfa ? ' (MFA Required)' : ''}
- *Status:* ${completedSteps}/${totalSteps} steps completed (${progressPercent}%)
${article.stopConditions.length > 0 ? `\n*🛑 Stop Conditions:*\n${article.stopConditions.map((c) => `• ${c}`).join('\n')}` : ''}
${article.routes.length > 0 ? `\n*🔗 Primary Console Route:* https://app.letsgetquoted.com${article.routes[0]?.href}` : ''}`;

  return (
    <article className={styles.articleShell}>
      <nav className={styles.articleNav} aria-label="Manual breadcrumbs">
        <Link href="/admin/manual" className={styles.backLink}>
          &larr; Back to Admin Manual Directory
        </Link>
        <div className={styles.articleTopActions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setShowIncidentShare(!showIncidentShare)}
            title="Format incident brief for Slack"
          >
            📋 {showIncidentShare ? 'Hide Incident Brief' : 'Share to Slack'}
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() =>
              copyToClipboard(
                `https://app.letsgetquoted.com/admin/manual/${article.slug}`,
                'permalink',
              )
            }
          >
            {copiedKey === 'permalink' ? '✓ Link Copied' : '🔗 Copy Permalink'}
          </button>
        </div>
      </nav>

      {/* Incident Slack Brief Card */}
      {showIncidentShare && (
        <div className={styles.incidentShareBox}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#38bdf8' }}>
              Incident Bridge Runbook Snippet (Markdown)
            </span>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => copyToClipboard(incidentMarkdown, 'incident_md')}
            >
              {copiedKey === 'incident_md' ? '✓ Copied to Clipboard!' : 'Copy Incident Markdown'}
            </button>
          </div>
          <pre className={styles.incidentSharePre}>{incidentMarkdown}</pre>
        </div>
      )}

      <header className={styles.header}>
        <div className={styles.headerTitleRow}>
          <h1 className={styles.title}>{article.title}</h1>
          <div className={styles.cardBadgeRow}>
            <span
              className={`${styles.badge} ${
                article.riskLevel === 'production' ? styles.badgeProduction : styles.badgeGeneral
              }`}
            >
              Risk: {article.riskLevel}
            </span>
            {article.requiresMfa && (
              <span className={`${styles.badge} ${styles.badgeMfa}`}>MFA Required</span>
            )}
            {article.requiredPermission && (
              <span className={styles.badge}>Permission: {article.requiredPermission}</span>
            )}
          </div>
        </div>

        <p className={styles.subtitle}>{article.summary}</p>

        <div className={styles.metaRow}>
          <span>
            Chapter: <strong>{article.chapterTitle}</strong>
          </span>
          <span>
            Owner: <strong>{article.owner}</strong>
          </span>
          <span>
            Backup: <strong>{article.backupOwner}</strong>
          </span>
          <span>
            Last Verified: <strong>{article.lastVerified}</strong> (commit{' '}
            <code>{article.lastVerifiedCommit}</code>)
          </span>
          <span>
            Status: <strong>{article.status}</strong>
          </span>
        </div>
      </header>

      {/* Table of Contents Quick Jump */}
      <nav className={styles.tocNav} aria-label="Table of Contents">
        <span className={styles.tocTitle}>Jump to:</span>
        {VisualComponent && (
          <a href="#visual" className={styles.tocLink}>
            Architecture Visual
          </a>
        )}
        <a href="#use-when" className={styles.tocLink}>
          Use This When
        </a>
        {article.prerequisites.length > 0 && (
          <a href="#prerequisites" className={styles.tocLink}>
            Prerequisites
          </a>
        )}
        {article.routes.length > 0 && (
          <a href="#routes" className={styles.tocLink}>
            Console Routes
          </a>
        )}
        <a href="#procedure" className={styles.tocLink}>
          Procedure ({completedSteps}/{totalSteps})
        </a>
        {article.stopConditions.length > 0 && (
          <a href="#stop-conditions" className={styles.tocLink}>
            Stop Conditions
          </a>
        )}
        <a href="#impact" className={styles.tocLink}>
          Impact
        </a>
        <a href="#audit" className={styles.tocLink}>
          Audit
        </a>
        <a href="#rollback" className={styles.tocLink}>
          Rollback
        </a>
        {article.authoritativeFiles.length > 0 && (
          <a href="#files" className={styles.tocLink}>
            Source Files
          </a>
        )}
      </nav>

      {VisualComponent && (
        <section id="visual" className={styles.sectionBlock} aria-label="Architecture & Flow Visual">
          <VisualComponent />
        </section>
      )}

      <div className={styles.articlePanel}>
        {/* Purpose & Outcome */}
        <section id="use-when" className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Use This When</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.92rem', margin: 0, lineHeight: 1.5 }}>
            {article.useThisWhen}
          </p>

          <h2 className={styles.sectionTitle} style={{ marginTop: '0.75rem' }}>
            Desired Outcome
          </h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.92rem', margin: 0, lineHeight: 1.5 }}>
            {article.desiredOutcome}
          </p>
        </section>

        {/* Prerequisites */}
        {article.prerequisites.length > 0 && (
          <section id="prerequisites" className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>Prerequisites & Authorizations</h2>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.25rem',
                color: '#cbd5e1',
                fontSize: '0.88rem',
                lineHeight: 1.6,
              }}
            >
              {article.prerequisites.map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Associated Routes */}
        {article.routes.length > 0 && (
          <section id="routes" className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>Relevant Admin Console Routes</h2>
            <div className={styles.routeList}>
              {article.routes.map((route, idx) => (
                <Link key={idx} href={route.href} className={styles.routePill} target="_blank">
                  <span>&rarr;</span>
                  <span>{route.label}</span>
                  <code style={{ fontSize: '0.75rem', opacity: 0.8 }}>({route.href})</code>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Step-by-Step Procedure with Interactive Checklist */}
        <section id="procedure" className={styles.sectionBlock}>
          <div className={styles.sectionTitle}>
            <span>Step-by-Step Operating Procedure</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#38bdf8' }}>
              {completedSteps} of {totalSteps} Completed ({progressPercent}%)
            </span>
          </div>

          {/* Interactive Progress Meter */}
          <div className={styles.progressMeter}>
            <div className={styles.progressHeader}>
              <span className={styles.progressStatus}>
                {completedSteps === totalSteps && totalSteps > 0
                  ? '✓ All Runbook Steps Completed'
                  : `Incident Checklist: ${completedSteps}/${totalSteps} Steps`}
              </span>
              {completedSteps > 0 && (
                <button
                  type="button"
                  onClick={resetChecklist}
                  className={styles.progressResetBtn}
                  title="Reset checklist progress for this guide"
                >
                  Reset Checklist
                </button>
              )}
            </div>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className={styles.stepList}>
            {article.procedure.map((step) => {
              const isChecked = !!checkedSteps[step.stepNumber];
              return (
                <div
                  key={step.stepNumber}
                  className={`${styles.stepItem} ${isChecked ? styles.stepItemChecked : ''}`}
                >
                  <div className={styles.stepCheckboxWrapper}>
                    <input
                      type="checkbox"
                      id={`step-${article.slug}-${step.stepNumber}`}
                      checked={isChecked}
                      onChange={() => toggleStep(step.stepNumber)}
                      className={styles.stepCheckbox}
                      aria-label={`Mark step ${step.stepNumber} complete`}
                    />
                    <div
                      className={`${styles.stepNumber} ${
                        isChecked ? styles.stepNumberChecked : ''
                      }`}
                    >
                      {isChecked ? '✓' : step.stepNumber}
                    </div>
                  </div>
                  <div className={styles.stepContent}>
                    <label
                      htmlFor={`step-${article.slug}-${step.stepNumber}`}
                      className={`${styles.stepItemTitle} ${
                        isChecked ? styles.stepItemTitleChecked : ''
                      }`}
                      style={{ cursor: 'pointer' }}
                    >
                      {step.title}
                    </label>
                    <p className={styles.stepInstruction}>{step.instruction}</p>
                    {step.caution && (
                      <div className={styles.cautionBox}>Caution: {step.caution}</div>
                    )}
                    {step.verification && (
                      <div className={styles.verificationBox}>
                        <span>Verification: {step.verification}</span>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem' }}
                          onClick={() =>
                            copyToClipboard(step.verification ?? '', `verif_${step.stepNumber}`)
                          }
                        >
                          {copiedKey === `verif_${step.stepNumber}` ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Stop Conditions */}
        {article.stopConditions.length > 0 && (
          <section id="stop-conditions" className={styles.stopBox} aria-label="Stop Conditions">
            <h3 className={styles.stopTitle}>
              <span>🛑</span> Stop Conditions — Do NOT Proceed If:
            </h3>
            <ul className={styles.stopList}>
              {article.stopConditions.map((cond, idx) => (
                <li key={idx}>{cond}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Expected Results & Impact */}
        <section id="impact" className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Expected Result & Business Impact</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
            <strong>Result:</strong> {article.expectedResult}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '0.75rem',
              marginTop: '0.5rem',
            }}
          >
            <div
              style={{
                background: 'rgba(8,18,31,0.5)',
                padding: '0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ color: '#38bdf8', fontSize: '0.8rem', fontWeight: 600 }}>
                Customer Impact
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {article.impact.customer}
              </div>
            </div>
            <div
              style={{
                background: 'rgba(8,18,31,0.5)',
                padding: '0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ color: '#34d399', fontSize: '0.8rem', fontWeight: 600 }}>
                Business Impact
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {article.impact.business}
              </div>
            </div>
          </div>
        </section>

        {/* Audit & Evidence */}
        <section id="audit" className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Audit Log & Post-Action Evidence</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: 0 }}>
            <strong>Audit Expectation:</strong> {article.auditLogExpectation}
          </p>
          {article.evidenceAfterward.length > 0 && (
            <ul
              style={{
                margin: '0.5rem 0 0',
                paddingLeft: '1.25rem',
                color: '#94a3b8',
                fontSize: '0.85rem',
              }}
            >
              {article.evidenceAfterward.map((ev, idx) => (
                <li key={idx}>{ev}</li>
              ))}
            </ul>
          )}
        </section>

        {/* Recovery / Rollback & Escalation */}
        <section id="rollback" className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Recovery, Rollback & Escalation</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: 0 }}>
            <strong>Rollback:</strong> {article.recoveryOrRollback}
          </p>
          <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: '0.4rem 0 0' }}>
            <strong>Escalation Contact:</strong>{' '}
            <span style={{ color: '#38bdf8' }}>{article.escalationContact}</span>
          </p>
        </section>

        {/* Authoritative Source Files */}
        {article.authoritativeFiles.length > 0 && (
          <section id="files" className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>Authoritative Source Files</h2>
            <div className={styles.codeLinkList}>
              {article.authoritativeFiles.map((file, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={styles.codeFile}
                  onClick={() => copyToClipboard(file, `file_${idx}`)}
                  title="Click to copy source file path"
                >
                  <span>{file}</span>
                  <span className={styles.copyIcon}>
                    {copiedKey === `file_${idx}` ? '✓' : '📋'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Linear Chapter Navigation (Previous / Next Article) */}
      {(prevArticle || nextArticle) && (
        <nav className={styles.adjacentNav} aria-label="Chapter navigation">
          {prevArticle ? (
            <Link href={`/admin/manual/${prevArticle.slug}`} className={styles.adjacentCard}>
              <span className={styles.adjacentLabel}>&larr; Previous Guide</span>
              <span className={styles.adjacentTitle}>{prevArticle.title}</span>
            </Link>
          ) : (
            <div />
          )}

          {nextArticle ? (
            <Link
              href={`/admin/manual/${nextArticle.slug}`}
              className={`${styles.adjacentCard} ${styles.adjacentNext}`}
            >
              <span className={styles.adjacentLabel}>Next Guide &rarr;</span>
              <span className={styles.adjacentTitle}>{nextArticle.title}</span>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      )}
    </article>
  );
}

