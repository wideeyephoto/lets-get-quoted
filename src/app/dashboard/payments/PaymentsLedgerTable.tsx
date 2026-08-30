'use client';

import { useState, useMemo } from 'react';
import type { PaymentLedgerItem, PaymentsLedgerSummary } from '@/lib/payments-ledger-data';
import type { ModalType } from './PaymentModals';
import { getClientInitials, getAvatarColor } from '@/lib/avatar-utils';

interface Props {
  initialRows: PaymentLedgerItem[];
  summary: PaymentsLedgerSummary;
  onOpenModal: (type: ModalType, payment?: PaymentLedgerItem) => void;
}

type SortField = 'date' | 'amount' | 'client' | 'status';
type SortOrder = 'asc' | 'desc';

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getMethodIcon(method: string): string {
  const m = method.toLowerCase();
  if (m.includes('card')) return '💳';
  if (m.includes('ach')) return '🏦';
  if (m.includes('check')) return '📜';
  if (m.includes('cash')) return '💵';
  if (m.includes('zelle')) return '📱';
  if (m.includes('wire')) return '🌐';
  return '💰';
}

function StatusGlowPill({ status }: { status: string }) {
  switch (status) {
    case 'paid':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'rgba(16, 185, 129, 0.12)',
            color: '#059669',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            boxShadow: '0 0 10px -2px rgba(16, 185, 129, 0.2)',
          }}
        >
          <span style={{ fontSize: '0.7rem' }}>✓</span> Paid
        </span>
      );
    case 'processing':
    case 'requested':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#d97706',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <span style={{ fontSize: '0.7rem' }}>⏳</span> Pending
        </span>
      );
    case 'failed':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#dc2626',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}
        >
          <span style={{ fontSize: '0.7rem' }}>✕</span> Failed
        </span>
      );
    case 'refunded':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'rgba(100, 116, 139, 0.12)',
            color: '#475569',
            border: '1px solid rgba(100, 116, 139, 0.25)',
          }}
        >
          <span style={{ fontSize: '0.7rem' }}>↩</span> Refunded
        </span>
      );
    case 'disputed':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            background: 'rgba(220, 38, 38, 0.12)',
            color: '#dc2626',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            boxShadow: '0 0 10px -2px rgba(220, 38, 38, 0.25)',
          }}
        >
          <span style={{ fontSize: '0.7rem' }}>🛡️</span> Disputed
        </span>
      );
    default:
      return (
        <span className={`status-pill status-${status}`} style={{ textTransform: 'capitalize' }}>
          {status}
        </span>
      );
  }
}

export default function PaymentsLedgerTable({ initialRows, summary, onOpenModal }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  const filteredAndSortedRows = useMemo(() => {
    let result = initialRows.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.kind !== typeFilter) return false;
      if (methodFilter !== 'all') {
        const m = p.paymentMethod.toLowerCase();
        if (methodFilter === 'card' && !m.includes('card')) return false;
        if (methodFilter === 'ach' && !m.includes('ach')) return false;
        if (methodFilter === 'manual' && (m.includes('card') || m.includes('ach'))) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesClient = p.clientName.toLowerCase().includes(q);
        const matchesRef = p.jobRef.toLowerCase().includes(q);
        const matchesLabel = p.label.toLowerCase().includes(q);
        const matchesInvoice = (p.invoiceRef || '').toLowerCase().includes(q);
        if (!matchesClient && !matchesRef && !matchesLabel && !matchesInvoice) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        const dateA = new Date(a.paidAt || a.requestedAt).getTime();
        const dateB = new Date(b.paidAt || b.requestedAt).getTime();
        cmp = dateA - dateB;
      } else if (sortField === 'amount') {
        cmp = a.amount - b.amount;
      } else if (sortField === 'client') {
        cmp = a.clientName.localeCompare(b.clientName);
      } else if (sortField === 'status') {
        cmp = a.status.localeCompare(b.status);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [initialRows, search, statusFilter, methodFilter, typeFilter, sortField, sortOrder]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Sleek Compact Filter Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--panel-subtle, rgba(0,0,0,0.015))',
          padding: '0.65rem 0.85rem',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.45rem', flex: 1, minWidth: '220px', maxWidth: '380px' }}>
          <input
            type="text"
            placeholder="🔍 Search client, job ref, invoice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
            style={{ width: '100%', fontSize: '0.82rem', padding: '0.35rem 0.65rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
          >
            <option value="all">All Statuses ({initialRows.length})</option>
            <option value="paid">Paid</option>
            <option value="requested">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="disputed">Disputed</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="input"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
          >
            <option value="all">All Methods</option>
            <option value="card">Cards</option>
            <option value="ach">ACH Bank Debit</option>
            <option value="manual">Offline (Cash/Check/Zelle)</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
          >
            <option value="all">All Stages</option>
            <option value="deposit">Deposit</option>
            <option value="stage">Milestone</option>
            <option value="final">Final Balance</option>
          </select>
        </div>
      </div>

      {/* Transactions Table with Micro-Hover & Monograms */}
      <div className="table-responsive" style={{ overflowX: 'auto', border: '1px solid var(--border-subtle, #e2e8f0)', borderRadius: '8px' }}>
        <table className="data-table" style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--panel-subtle, rgba(0,0,0,0.02))' }}>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('date')}>
                Date {sortField === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('client')}>
                Customer &amp; Job {sortField === 'client' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Description &amp; Stage</th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Method</th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('amount')}>
                Gross {sortField === 'amount' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Fee</th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Net</th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center', cursor: 'pointer' }} onClick={() => handleSort('status')}>
                Status {sortField === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>🔍</div>
                  <strong>No transactions match your filter</strong>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Try clearing filters or search query.</p>
                </td>
              </tr>
            ) : (
              filteredAndSortedRows.map((p) => {
                const dateStr = p.paidAt
                  ? new Date(p.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : new Date(p.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const avatar = getAvatarColor(p.clientName);
                const initials = getClientInitials(p.clientName);

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderTop: '1px solid var(--border-subtle, #e2e8f0)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Date */}
                    <td style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                      {dateStr}
                    </td>

                    {/* Customer & Monogram Avatar */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '999px',
                            background: avatar.bg,
                            color: avatar.color,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <strong style={{ fontSize: '0.86rem', display: 'block' }}>{p.clientName}</strong>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{p.jobRef}</span>
                        </div>
                      </div>
                    </td>

                    {/* Description */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <span style={{ fontSize: '0.84rem' }}>{p.label}</span>
                      {p.invoiceRef && (
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Inv #{p.invoiceRef}
                        </span>
                      )}
                    </td>

                    {/* Method */}
                    <td style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8rem' }}>
                        {getMethodIcon(p.paymentMethod)} {p.paymentMethod}
                      </span>
                    </td>

                    {/* Gross */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 600 }}>
                      {formatUsd(p.amount)}
                    </td>

                    {/* Fee */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      {p.platformFee > 0 ? `-${formatUsd(p.platformFee)}` : '$0.00'}
                    </td>

                    {/* Net */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 600, color: 'var(--primary, #10b981)' }}>
                      {formatUsd(p.netAmount)}
                    </td>

                    {/* Status Glow Pill */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                      <StatusGlowPill status={p.status} />
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.74rem' }}
                          title="View on-screen QR code"
                          onClick={() => onOpenModal('qr_code', p)}
                        >
                          📱 QR
                        </button>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.74rem' }}
                          onClick={() => onOpenModal('payment_detail', p)}
                        >
                          Details
                        </button>
                        {p.status === 'paid' && (
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.74rem' }}
                            onClick={() => onOpenModal('refund', p)}
                          >
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
