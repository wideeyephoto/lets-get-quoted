import React from 'react';
import Link from 'next/link';
import type { ManualArticle } from '@/lib/admin-manual';
import { ADMIN_MANUAL_VISUAL_COMPONENTS } from '@/components/admin-manual/visuals';
import styles from '../manual.module.css';

interface AdminManualArticleProps {
  article: ManualArticle;
}

export default function AdminManualArticle({ article }: AdminManualArticleProps) {
  const VisualComponent = article.visualId
    ? ADMIN_MANUAL_VISUAL_COMPONENTS[article.visualId]
    : null;

  return (
    <article className={styles.articleShell}>
      <nav className={styles.articleNav} aria-label="Manual breadcrumbs">
        <Link href="/admin/manual" className={styles.backLink}>
          &larr; Back to Admin Manual Directory
        </Link>
        <span style={{ color: '#64748b' }}>
          Chapter: <strong>{article.chapterTitle}</strong>
        </span>
      </nav>

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
          <span>Owner: <strong>{article.owner}</strong></span>
          <span>Backup: <strong>{article.backupOwner}</strong></span>
          <span>Last Verified: <strong>{article.lastVerified}</strong> (commit <code>{article.lastVerifiedCommit}</code>)</span>
          <span>Status: <strong>{article.status}</strong></span>
        </div>
      </header>

      {VisualComponent && (
        <section aria-label="Architecture & Flow Visual">
          <VisualComponent />
        </section>
      )}

      <div className={styles.articlePanel}>
        {/* Purpose & Outcome */}
        <section className={styles.sectionBlock}>
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
          <section className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>Prerequisites & Authorizations</h2>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.6 }}>
              {article.prerequisites.map((req, idx) => (
                <li key={idx}>{req}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Associated Routes */}
        {article.routes.length > 0 && (
          <section className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>Relevant Admin Console Routes</h2>
            <div className={styles.routeList}>
              {article.routes.map((route, idx) => (
                <Link key={idx} href={route.href} className={styles.routePill}>
                  <span>&rarr;</span>
                  <span>{route.label}</span>
                  <code style={{ fontSize: '0.75rem', opacity: 0.8 }}>({route.href})</code>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Step-by-Step Procedure */}
        <section className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Step-by-Step Operating Procedure</h2>
          <div className={styles.stepList}>
            {article.procedure.map((step) => (
              <div key={step.stepNumber} className={styles.stepItem}>
                <div className={styles.stepNumber}>{step.stepNumber}</div>
                <div className={styles.stepContent}>
                  <h3 className={styles.stepItemTitle}>{step.title}</h3>
                  <p className={styles.stepInstruction}>{step.instruction}</p>
                  {step.caution && <div className={styles.cautionBox}>Caution: {step.caution}</div>}
                  {step.verification && (
                    <div style={{ color: '#38bdf8', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                      Verification: {step.verification}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Stop Conditions */}
        {article.stopConditions.length > 0 && (
          <section className={styles.stopBox} aria-label="Stop Conditions">
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
        <section className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Expected Result & Business Impact</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
            <strong>Result:</strong> {article.expectedResult}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div style={{ background: 'rgba(8,18,31,0.5)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ color: '#38bdf8', fontSize: '0.8rem', fontWeight: 600 }}>Customer Impact</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginTop: '0.25rem' }}>{article.impact.customer}</div>
            </div>
            <div style={{ background: 'rgba(8,18,31,0.5)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ color: '#34d399', fontSize: '0.8rem', fontWeight: 600 }}>Business Impact</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginTop: '0.25rem' }}>{article.impact.business}</div>
            </div>
          </div>
        </section>

        {/* Audit & Evidence */}
        <section className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Audit Log & Post-Action Evidence</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: 0 }}>
            <strong>Audit Expectation:</strong> {article.auditLogExpectation}
          </p>
          {article.evidenceAfterward.length > 0 && (
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', color: '#94a3b8', fontSize: '0.85rem' }}>
              {article.evidenceAfterward.map((ev, idx) => (
                <li key={idx}>{ev}</li>
              ))}
            </ul>
          )}
        </section>

        {/* Recovery / Rollback & Escalation */}
        <section className={styles.sectionBlock}>
          <h2 className={styles.sectionTitle}>Recovery, Rollback & Escalation</h2>
          <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: 0 }}>
            <strong>Rollback:</strong> {article.recoveryOrRollback}
          </p>
          <p style={{ color: '#cbd5e1', fontSize: '0.88rem', margin: '0.4rem 0 0' }}>
            <strong>Escalation Contact:</strong> <span style={{ color: '#38bdf8' }}>{article.escalationContact}</span>
          </p>
        </section>

        {/* Authoritative Source Files */}
        {article.authoritativeFiles.length > 0 && (
          <section className={styles.sectionBlock}>
            <h2 className={styles.sectionTitle}>Authoritative Source Files</h2>
            <div className={styles.codeLinkList}>
              {article.authoritativeFiles.map((file, idx) => (
                <span key={idx} className={styles.codeFile}>
                  {file}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
