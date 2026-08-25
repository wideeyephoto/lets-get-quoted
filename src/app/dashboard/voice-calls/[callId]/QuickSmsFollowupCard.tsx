'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './call-detail.module.css';

type Props = {
  callerPhone: string | null;
  callerName: string | null;
  summary: string | null;
  businessName: string | null;
};

export default function QuickSmsFollowupCard({
  callerPhone,
  callerName,
  summary,
  businessName,
}: Props) {
  const displayName = callerName ? callerName.split(' ')[0] : 'there';
  const displayBiz = businessName || 'our team';

  const defaultDraft = summary
    ? `Hi ${displayName}, this is ${displayBiz}. Following up on your recent call regarding "${summary.trim().slice(0, 80)}". When is a good time for us to connect?`
    : `Hi ${displayName}, this is ${displayBiz}. Thanks for calling earlier. How can we help you today?`;

  const [message, setMessage] = useState(defaultDraft);
  const [copied, setCopied] = useState(false);

  if (!callerPhone) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  // Format sms link for mobile devices
  const smsHref = `sms:${callerPhone}?&body=${encodeURIComponent(message)}`;
  const messagesWorkspaceHref = `/dashboard/messages?q=${encodeURIComponent(callerPhone)}`;

  return (
    <div className={styles.card} style={{ border: '1px solid rgba(59, 130, 246, 0.25)', background: 'rgba(59, 130, 246, 0.03)' }}>
      <div className={styles.cardHeader}>
        <span style={{ color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          💬 1-Click SMS Follow-up
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--mute-t62, #94a3b8)' }}>
          Pre-composed from AI call summary
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            padding: '0.65rem 0.85rem',
            borderRadius: '8px',
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#fff',
            fontSize: '0.85rem',
            lineHeight: 1.4,
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
          aria-label="Follow-up SMS message draft"
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              background: copied ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
              border: `1px solid ${copied ? 'rgba(34, 197, 94, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`,
              color: copied ? '#86efac' : '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {copied ? '✓ Copied Draft' : '📋 Copy Text'}
          </button>

          <a
            href={smsHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#93c5fd',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📱 Text via Device
          </a>

          <Link
            href={messagesWorkspaceHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              background: 'var(--accent, #3b82f6)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'all 0.15s ease',
            }}
          >
            💬 Open in LGQ Messages →
          </Link>
        </div>
      </div>
    </div>
  );
}
