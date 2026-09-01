'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { ManualArticle, ManualArticleSummary } from '@/lib/admin-manual';
import { ADMIN_MANUAL_VISUAL_COMPONENTS } from '@/components/admin-manual/visuals';
import {
  logManualResolutionAction,
  requestDualApprovalAction,
} from '../actions';
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
  const searchParams = useSearchParams();
  const VisualComponent = article.visualId
    ? ADMIN_MANUAL_VISUAL_COMPONENTS[article.visualId]
    : null;

  // Interactive Checklist with sessionStorage persistence
  const storageKey = `manual_checklist_${article.slug}`;
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showIncidentShare, setShowIncidentShare] = useState(false);

  // Incident Stopwatch & SLA Timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Parameterized Command Values (bound to URL search params & inputs)
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (article.interactiveParams) {
      for (const p of article.interactiveParams) {
        const fromUrl = searchParams.get(p.key);
        initial[p.key] = fromUrl || p.default || '';
      }
    }
    return initial;
  });

  // Audit Resolution Modal State
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolutionSuccess, setResolutionSuccess] = useState(false);

  // Dual Approval State
  const [dualAuthRequested, setDualAuthRequested] = useState(false);
  const [dualAuthReason, setDualAuthReason] = useState('');
  const [isRequestingDualAuth, setIsRequestingDualAuth] = useState(false);

  // Sync params if URL search params change
  useEffect(() => {
    if (article.interactiveParams) {
      setParamValues((prev) => {
        const updated = { ...prev };
        for (const p of article.interactiveParams || []) {
          const fromUrl = searchParams.get(p.key);
          if (fromUrl && fromUrl !== prev[p.key]) {
            updated[p.key] = fromUrl;
          }
        }
        return updated;
      });
    }
  }, [searchParams, article.interactiveParams]);

  // Load checklist progress
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

  // Stopwatch Interval
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((sec) => sec + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  const toggleStep = useCallback((stepNumber: number) => {
    setCheckedSteps((prev) => {
      const updated = { ...prev, [stepNumber]: !prev[stepNumber] };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // Ignore storage write errors
      }
      return updated;
    });
  }, [storageKey]);

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

  // Keyboard navigation: 'x' toggles next uncompleted step, 't' toggles timer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setIsTimerRunning((r) => !r);
      } else if (e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        const nextIncomplete = article.procedure.find((s) => !checkedSteps[s.stepNumber]);
        if (nextIncomplete) {
          toggleStep(nextIncomplete.stepNumber);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [article.procedure, checkedSteps, toggleStep]);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback
    }
  };

  // Interpolate :parameter tokens inside shell/SQL commands
  const interpolateCommand = (rawCommand?: string) => {
    if (!rawCommand) return '';
    let interpolated = rawCommand;
    for (const [k, v] of Object.entries(paramValues)) {
      if (v.trim()) {
        interpolated = interpolated.split(`:${k}`).join(v.trim());
      }
    }
    return interpolated;
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isSlaBreached = article.slaMinutes && timerSeconds > article.slaMinutes * 60;

  // Handle Audit Sign-off
  const handleLogResolution = async () => {
    setIsResolving(true);
    const res = await logManualResolutionAction({
      slug: article.slug,
      articleTitle: article.title,
      stepsCompleted: completedSteps,
      totalSteps,
      durationSeconds: timerSeconds,
      targetEntityId: paramValues.accountId || paramValues.disputeId || paramValues.domain || undefined,
      notes: resolutionNotes,
    });
    setIsResolving(false);
    if (res.success) {
      setResolutionSuccess(true);
      setTimeout(() => setResolutionSuccess(false), 4000);
    }
  };

  // Handle Dual Approval Request
  const handleRequestDualApproval = async () => {
    setIsRequestingDualAuth(true);
    const res = await requestDualApprovalAction({
      slug: article.slug,
      articleTitle: article.title,
      targetEntityId: paramValues.accountId || paramValues.disputeId || undefined,
      reason: dualAuthReason || 'High-impact mutation execution',
    });
    setIsRequestingDualAuth(false);
    if (res.success) {
      setDualAuthRequested(true);
    }
  };

  const incidentMarkdown = `🚨 *Operating Runbook: ${article.title}*
- *Guide:* https://app.letsgetquoted.com/admin/manual/${article.slug}
- *Chapter:* ${article.chapterTitle}
- *Owner:* ${article.owner} | *Escalation:* ${article.escalationContact}
- *Risk Level:* ${article.riskLevel.toUpperCase()}${article.requiresMfa ? ' (MFA Required)' : ''}${article.requiresDualAuth ? ' (Dual Auth Required)' : ''}
- *Status:* ${completedSteps}/${totalSteps} steps completed (${progressPercent}%)
- *Duration:* ${formatTimer(timerSeconds)}${article.slaMinutes ? ` (SLA: ${article.slaMinutes}m)` : ''}
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

      {/* Dual Authorization Warning Banner */}
      {article.requiresDualAuth && (
        <div className={styles.dualAuthBanner}>
          <div className={styles.dualAuthHeader}>
            <span style={{ fontSize: '1.1rem' }}>🛡️</span>
            <div>
              <strong>Two-Person Dual-Authorization Rule Required</strong>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#fef08a' }}>
                Executing mutations in this runbook requires secondary manager review and sign-off.
              </p>
            </div>
          </div>
          {!dualAuthRequested ? (
            <div className={styles.dualAuthActionRow}>
              <input
                type="text"
                placeholder="Reason / justification for secondary sign-off..."
                value={dualAuthReason}
                onChange={(e) => setDualAuthReason(e.target.value)}
                className={styles.dualAuthInput}
              />
              <button
                type="button"
                onClick={handleRequestDualApproval}
                disabled={isRequestingDualAuth}
                className={styles.dualAuthBtn}
              >
                {isRequestingDualAuth ? 'Requesting...' : 'Request Secondary Sign-Off'}
              </button>
            </div>
          ) : (
            <div className={styles.dualAuthSuccess}>
              ✓ Dual authorization request logged to audit trail and dispatched to #ops-incidents.
            </div>
          )}
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
            {article.requiresDualAuth && (
              <span className={`${styles.badge} ${styles.badgeDualAuth}`}>Dual Auth</span>
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

      {/* Incident Stopwatch & SLA Bar */}
      <div className={styles.stopwatchBar}>
        <div className={styles.stopwatchLeft}>
          <span className={styles.stopwatchIcon}>⏱️</span>
          <div>
            <span className={styles.stopwatchLabel}>Incident Response Timer: </span>
            <strong className={styles.stopwatchTime}>{formatTimer(timerSeconds)}</strong>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: '0.4rem' }}>
              (Press <kbd className={styles.keyKbd}>t</kbd> to toggle)
            </span>
          </div>
        </div>

        <div className={styles.stopwatchRight}>
          {article.slaMinutes && (
            <span
              className={`${styles.slaBadge} ${
                isSlaBreached ? styles.slaBadgeBreached : styles.slaBadgeHealthy
              }`}
            >
              {isSlaBreached ? '⚠️ SLA Breached' : '🟢 SLA Target'}: {article.slaMinutes}m
            </span>
          )}

          <div className={styles.stopwatchControls}>
            <button
              type="button"
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className={styles.timerBtn}
            >
              {isTimerRunning ? '⏸ Pause' : '▶ Start Timer'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsTimerRunning(false);
                setTimerSeconds(0);
              }}
              className={styles.timerBtnReset}
              title="Reset stopwatch"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      </div>

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
        {article.interactiveParams && article.interactiveParams.length > 0 && (
          <a href="#params" className={styles.tocLink}>
            Live Parameters
          </a>
        )}
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
          Audit & Sign-Off
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

      {/* Parameterized CLI / Query Builder */}
      {article.interactiveParams && article.interactiveParams.length > 0 && (
        <section id="params" className={styles.paramSectionBlock} aria-label="Live Parameters">
          <div className={styles.paramSectionHeader}>
            <span>⚡ Dynamic Parameter Interpolation</span>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Values auto-populate in commands and copy snippets
            </span>
          </div>
          <div className={styles.paramInputGrid}>
            {article.interactiveParams.map((p) => (
              <div key={p.key} className={styles.paramInputGroup}>
                <label htmlFor={`param-${p.key}`} className={styles.paramLabel}>
                  {p.label} (<code>:{p.key}</code>)
                </label>
                <input
                  id={`param-${p.key}`}
                  type="text"
                  placeholder={p.placeholder}
                  value={paramValues[p.key] || ''}
                  onChange={(e) =>
                    setParamValues({ ...paramValues, [p.key]: e.target.value })
                  }
                  className={styles.paramInput}
                />
              </div>
            ))}
          </div>
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
              {completedSteps} of {totalSteps} Completed ({progressPercent}%) · Press <kbd className={styles.keyKbd}>x</kbd> to toggle next
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
              const interpolatedCmd = interpolateCommand(step.commandOrAction);

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
                    {step.commandOrAction && (
                      <div className={styles.stepCommandBox}>
                        <div className={styles.stepCommandHeader}>
                          <span>Command / Query Execution:</span>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => copyToClipboard(interpolatedCmd, `cmd_${step.stepNumber}`)}
                          >
                            {copiedKey === `cmd_${step.stepNumber}` ? '✓ Copied!' : '📋 Copy Command'}
                          </button>
                        </div>
                        <pre className={styles.stepCommandPre}>{interpolatedCmd}</pre>
                      </div>
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

        {/* Audit Log Sign-Off & Evidence */}
        <section id="audit" className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Audit Log Sign-Off & Resolution</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: 0 }}>
            <strong>Audit Expectation:</strong> {article.auditLogExpectation}
          </p>

          <div className={styles.auditSignOffBox}>
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#38bdf8' }}>
              Log Resolution to Admin Audit Trail
            </span>
            <input
              type="text"
              placeholder="Optional notes or ticket reference (e.g. #INC-402)..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              className={styles.auditNoteInput}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={handleLogResolution}
                disabled={isResolving}
                className={styles.auditSubmitBtn}
              >
                {isResolving ? 'Logging to Audit...' : '✓ Complete & Log to Audit Log'}
              </button>
              {resolutionSuccess && (
                <span style={{ color: '#34d399', fontSize: '0.82rem', fontWeight: 600 }}>
                  ✓ Resolution recorded to database audit log!
                </span>
              )}
            </div>
          </div>

          {article.evidenceAfterward.length > 0 && (
            <ul
              style={{
                margin: '0.75rem 0 0',
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
