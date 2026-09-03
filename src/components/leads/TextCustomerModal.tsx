'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getAccountMessagingCapabilityAction,
  sendLeadClientDashboardSmsAction,
  sendLeadPrivateSmsAction,
} from '@/app/dashboard/leads/text-actions';
import type { MessagingCapability } from '@/lib/dashboard-sms-dispatch';
import styles from './TextCustomerModal.module.css';

export interface TextCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  customerName: string;
  phone: string;
  initialMessage?: string;
}

export default function TextCustomerModal({
  isOpen,
  onClose,
  leadId,
  customerName,
  phone,
  initialMessage = '',
}: TextCustomerModalProps) {
  const [capability, setCapability] = useState<MessagingCapability | null>(null);
  const [customText, setCustomText] = useState(initialMessage);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFeedback(null);
      return;
    }
    let active = true;
    getAccountMessagingCapabilityAction()
      .then((cap) => {
        if (active) setCapability(cap);
      })
      .catch((err) => {
        console.error('Failed to load messaging capability:', err);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const hasDedicated = Boolean(capability?.hasDedicatedNumber);

  const handleSend = async () => {
    setIsSending(true);
    setFeedback(null);

    try {
      if (hasDedicated) {
        const res = await sendLeadPrivateSmsAction(leadId, phone, customText);
        if (res.success) {
          setFeedback({ type: 'success', text: res.message || 'Message sent successfully.' });
          setTimeout(() => onClose(), 1600);
        } else {
          setFeedback({ type: 'error', text: res.error || 'Failed to send message.' });
        }
      } else {
        const res = await sendLeadClientDashboardSmsAction(leadId, phone);
        if (res.success) {
          setFeedback({ type: 'success', text: res.message || 'Client Dashboard link sent successfully.' });
          setTimeout(() => onClose(), 1600);
        } else {
          setFeedback({ type: 'error', text: res.error || 'Failed to send link.' });
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.headRow}>
          <h3 className={styles.title}>
            💬 Text {customerName}
          </h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted, #94a3b8)', display: 'block', marginBottom: '0.35rem' }}>
            Recipient: <strong style={{ color: 'var(--text, #f8fafc)' }}>{phone}</strong>
          </span>

          {hasDedicated ? (
            <span className={styles.laneBadge} data-lane="dedicated">
              📱 Dedicated 2-Way Line ({capability?.dedicatedNumber})
            </span>
          ) : (
            <span className={styles.laneBadge} data-lane="shared">
              📢 Shared Line {capability?.sharedNumber ? `(${capability.sharedNumber})` : ''}
            </span>
          )}
        </div>

        {hasDedicated ? (
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 650, display: 'block', marginBottom: '0.35rem' }}>
              Private Message:
            </label>
            <textarea
              className={styles.textarea}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={`Hi ${customerName}, ...`}
              disabled={isSending}
              rows={3}
            />
          </div>
        ) : (
          <>
            <div className={styles.infoBox}>
              This message will be sent from our verified shared notification line. To ensure high carrier deliverability, it delivers a direct link to the homeowner&rsquo;s <strong>Client Dashboard</strong> where they can view the project and complete next steps.
            </div>

            <div className={styles.previewBox}>
              &ldquo;[Your Business Name] here &mdash; view your project portal and next steps: https://letsgetquoted.com/client/jobs/&hellip; Reply STOP to opt out.&rdquo;
            </div>

            <div className={styles.upgradeCallout}>
              <span>Want to text back-and-forth privately with homeowners?</span>
              <Link href="/dashboard/messages/dedicated-number" className={styles.upgradeLink} onClick={onClose}>
                Activate 2-Way Number &rarr;
              </Link>
            </div>
          </>
        )}

        {feedback && (
          <div className={feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}>
            {feedback.text}
          </div>
        )}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isSending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSend}
            disabled={isSending || (hasDedicated && !customText.trim())}
          >
            {isSending
              ? 'Sending…'
              : hasDedicated
                ? 'Send Private Text →'
                : '⚡ Send Client Dashboard Link →'}
          </button>
        </div>
      </div>
    </div>
  );
}
