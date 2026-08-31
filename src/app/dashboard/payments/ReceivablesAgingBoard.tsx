'use client';

import { useState } from 'react';
import type { ReceivableItem, ReceivablesSummary } from '@/lib/receivables-data';
import { sendPaymentReminderAction, batchSendOverdueRemindersAction } from './actions';
import { getClientInitials, getAvatarColor } from '@/lib/avatar-utils';

interface Props {
  receivables: ReceivableItem[];
  summary: ReceivablesSummary;
  onOpenManualPayment: (jobId: string, invoiceId?: string, amount?: number) => void;
  onOpenBatchSettle?: () => void;
  onOpenPromiseToPay?: (payment: { id: string; clientName: string; amount: number }) => void;
  onOpenNoiGenerator?: (payment: { id: string; clientName: string; amount: number }) => void;
  onOpenLienWaiver?: (payment: { id: string; clientName: string; amount: number; jobId?: string }) => void;
  onOpenConsolidatedBilling?: () => void;
  onOpenRetainageTracker?: () => void;
  onOpenDrawCalendar?: () => void;
  onSuccess: (message: string) => void;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReceivablesAgingBoard({
  receivables,
  summary,
  onOpenManualPayment,
  onOpenBatchSettle,
  onOpenPromiseToPay,
  onOpenNoiGenerator,
  onOpenLienWaiver,
  onOpenConsolidatedBilling,
  onOpenRetainageTracker,
  onOpenDrawCalendar,
  onSuccess,
}: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleSendReminder(paymentId: string) {
    setLoadingId(paymentId);
    const formData = new FormData();
    formData.set('paymentId', paymentId);
    formData.set('channel', 'sms');

    const res = await sendPaymentReminderAction(formData);
    setLoadingId(null);
    if (res.success) {
      onSuccess(res.message || 'Payment reminder sent.');
    } else {
      alert(res.error || 'Failed to send reminder.');
    }
  }

  async function handleBatchOverdueReminders() {
    if (!confirm(`Send SMS payment links to all overdue customers now?`)) return;
    setBatchLoading(true);
    const formData = new FormData();
    const res = await batchSendOverdueRemindersAction(formData);
    setBatchLoading(false);
    if (res.success) {
      onSuccess(res.message || 'Reminders broadcasted.');
    } else {
      alert(res.error || 'Failed to broadcast reminders.');
    }
  }

  function handleCopyPayLink(paymentId: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.letsgetquoted.com';
    navigator.clipboard.writeText(`${origin}/pay/${paymentId}`);
    setCopiedId(paymentId);
    setTimeout(() => setCopiedId(null), 2500);
  }

  const columns = [
    { key: 'current', label: 'Current (0–14 Days)', items: receivables.filter((r) => r.agingBucket === 'current'), color: '#10b981' },
    { key: '1_15', label: '1–15 Days Overdue', items: receivables.filter((r) => r.agingBucket === '1_15'), color: '#f59e0b' },
    { key: '16_30', label: '16–30 Days Overdue', items: receivables.filter((r) => r.agingBucket === '16_30'), color: '#f97316' },
    { key: '31_60', label: '31–60 Days Overdue', items: receivables.filter((r) => r.agingBucket === '31_60'), color: '#ef4444' },
    { key: '60_plus', label: '60+ Days Past Due', items: receivables.filter((r) => r.agingBucket === '60_plus'), color: '#991b1b' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Action Banner for Broadcast Overdue Reminders & Batch Settle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.85rem 1rem',
          background: summary.overdueCount > 0 ? 'rgba(239, 68, 68, 0.06)' : 'var(--panel-subtle, rgba(0,0,0,0.02))',
          border: `1px solid ${summary.overdueCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-subtle, #e2e8f0)'}`,
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.25rem' }}>{summary.overdueCount > 0 ? '⚠️' : '✓'}</span>
          <div>
            <strong style={{ fontSize: '0.92rem' }}>
              {summary.overdueCount > 0
                ? `${summary.overdueCount} Overdue ${summary.overdueCount === 1 ? 'Invoice' : 'Invoices'} (${formatUsd(summary.totalOverdue)})`
                : 'All Accounts Current'}
            </strong>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Total Outstanding: <strong>{formatUsd(summary.totalOutstanding)}</strong> across {summary.totalReceivablesCount} active invoices
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {onOpenConsolidatedBilling && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
              onClick={onOpenConsolidatedBilling}
              title="Consolidate multi-job accounts for property managers"
            >
              🏢 Consolidated Billing
            </button>
          )}

          {onOpenRetainageTracker && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
              onClick={onOpenRetainageTracker}
              title="Track commercial escrow retainage withholdings"
            >
              🏗️ Retainage Tracker
            </button>
          )}

          {onOpenBatchSettle && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
              onClick={onOpenBatchSettle}
            >
              🧾 Settle Multiple Invoices
            </button>
          )}

          {onOpenDrawCalendar && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
              onClick={onOpenDrawCalendar}
              title="Open 30-Day Draw Forecast Calendar"
            >
              📅 Draw Horizon Calendar
            </button>
          )}

          {summary.overdueCount > 0 && (
            <button
              type="button"
              className="btn primary"
              style={{ fontSize: '0.82rem', padding: '0.35rem 0.75rem' }}
              disabled={batchLoading}
              onClick={handleBatchOverdueReminders}
            >
              {batchLoading ? 'Broadcasting…' : `⚡ Broadcast SMS Reminders (${summary.overdueCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Aging Columns Board */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        {columns.map((col) => {
          const colTotal = col.items.reduce((sum, item) => sum + item.amountDue, 0);

          return (
            <div
              key={col.key}
              style={{
                background: 'var(--panel-subtle, rgba(0,0,0,0.02))',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle, #e2e8f0)',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                minHeight: '280px',
              }}
            >
              {/* Column Header */}
              <div style={{ borderBottom: `2px solid ${col.color}`, paddingBottom: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: col.color }}>{col.label}</span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      background: col.items.length > 0 ? col.color : 'rgba(0,0,0,0.05)',
                      color: col.items.length > 0 ? '#fff' : 'inherit',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '999px',
                      fontWeight: 600,
                    }}
                  >
                    {col.items.length}
                  </span>
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, marginTop: '0.2rem' }}>
                  {formatUsd(colTotal)}
                </div>
              </div>

              {/* Column Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {col.items.length === 0 ? (
                  <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    No receivables in this bucket.
                  </div>
                ) : (
                  col.items.map((item) => {
                    const avatar = getAvatarColor(item.clientName);
                    const initials = getClientInitials(item.clientName);
                    const hasPromiseDate = Boolean(item.dueDate);

                    return (
                      <div
                        key={item.id}
                        style={{
                          background: '#fff',
                          border: '1px solid var(--border-subtle, #e2e8f0)',
                          borderRadius: '6px',
                          padding: '0.65rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <div
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '999px',
                                background: avatar.bg,
                                color: avatar.color,
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifySelf: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {initials}
                            </div>
                            <div>
                              <strong style={{ fontSize: '0.82rem', display: 'block' }}>{item.clientName}</strong>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.jobRef}</span>
                            </div>
                          </div>
                          <strong style={{ fontSize: '0.88rem', color: 'var(--text-color)' }}>
                            {formatUsd(item.amountDue)}
                          </strong>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', flexWrap: 'wrap', gap: '0.2rem' }}>
                          <span style={{ color: item.daysOverdue > 0 ? col.color : 'var(--text-muted)', fontWeight: item.daysOverdue > 0 ? 600 : 400 }}>
                            {item.daysOverdue > 0 ? `${item.daysOverdue}d overdue` : 'Due on receipt'}
                          </span>
                          <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: item.reliabilityTier === 'A' ? 'rgba(16, 185, 129, 0.1)' : item.reliabilityTier === 'B' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: item.reliabilityTier === 'A' ? '#059669' : item.reliabilityTier === 'B' ? '#d97706' : '#dc2626', fontWeight: 600 }}>
                            Tier {item.reliabilityTier || 'A'}
                          </span>
                        </div>

                        {/* Promise to Pay Badge */}
                        {hasPromiseDate && (
                          <div style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', background: 'rgba(59, 130, 246, 0.08)', color: '#2563eb', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span>📅 Promised:</span>
                            <strong>{new Date(item.dueDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>
                          </div>
                        )}

                        {/* Card Quick Utility Shortcuts */}
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                          {item.clientPhone && (
                            <a
                              href={`tel:${item.clientPhone}`}
                              style={{ color: 'var(--primary, #3b82f6)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}
                              title={`Call ${item.clientPhone}`}
                            >
                              📞 Call
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopyPayLink(item.id)}
                            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem' }}
                          >
                            {copiedId === item.id ? '✓ Copied' : '🔗 Link'}
                          </button>
                          {onOpenPromiseToPay && (
                            <button
                              type="button"
                              onClick={() => onOpenPromiseToPay({ id: item.id, clientName: item.clientName, amount: item.amountDue })}
                              style={{ background: 'none', border: 'none', padding: 0, color: '#2563eb', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600 }}
                            >
                              📅 Promise
                            </button>
                          )}
                          {onOpenLienWaiver && (
                            <button
                              type="button"
                              onClick={() => onOpenLienWaiver({ id: item.id, clientName: item.clientName, amount: item.amountDue, jobId: item.jobId })}
                              style={{ background: 'none', border: 'none', padding: 0, color: '#059669', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600 }}
                              title="Generate Statutory Lien Waiver"
                            >
                              📄 Waiver
                            </button>
                          )}
                          {onOpenNoiGenerator && item.daysOverdue >= 30 && (
                            <button
                              type="button"
                              onClick={() => onOpenNoiGenerator({ id: item.id, clientName: item.clientName, amount: item.amountDue })}
                              style={{ background: 'none', border: 'none', padding: 0, color: '#dc2626', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}
                              title="Generate Statutory Notice of Intent to Lien"
                            >
                              🛡️ NOI
                            </button>
                          )}
                        </div>

                        {/* Card Actions */}
                        <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.1rem', paddingTop: '0.35rem', borderTop: '1px solid var(--border-subtle, #f1f5f9)' }}>
                          <button
                            type="button"
                            className="btn primary"
                            style={{ flex: 1, padding: '0.15rem 0.35rem', fontSize: '0.7rem' }}
                            disabled={loadingId === item.id}
                            onClick={() => handleSendReminder(item.id)}
                          >
                            {loadingId === item.id ? 'Sending…' : '💬 SMS'}
                          </button>
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: '0.15rem 0.35rem', fontSize: '0.7rem' }}
                            onClick={() => onOpenManualPayment(item.jobId, item.source === 'invoice' ? item.id : undefined, item.amountDue)}
                          >
                            💵 Record
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
