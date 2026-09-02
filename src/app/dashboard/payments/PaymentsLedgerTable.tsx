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
            color: 'var(--good, #047857)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
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
            color: 'var(--warn, #b45309)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
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
            color: 'var(--bad, #dc2626)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
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
            color: 'var(--muted, #475569)',
            border: '1px solid rgba(100, 116, 139, 0.3)',
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
            color: 'var(--bad, #dc2626)',
            border: '1px solid rgba(220, 38, 38, 0.35)',
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

export default function PaymentsLedgerTable({ initialRows, summary: _summary, onOpenModal }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  function handleToggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  function handleSelectAll(rows: PaymentLedgerItem[]) {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  }

  function exportRowsToCsv(rows: PaymentLedgerItem[], filename = 'payments_export.csv') {
    const headers = ['Date', 'Customer', 'Job Ref', 'Invoice Ref', 'Description', 'Method', 'Gross', 'Fee', 'Net', 'Status', 'Transaction ID'];
    const csvRows = [headers.join(',')];

    for (const r of rows) {
      const dateStr = r.paidAt ? r.paidAt.slice(0, 10) : r.requestedAt.slice(0, 10);
      const values = [
        `"${dateStr}"`,
        `"${r.clientName.replace(/"/g, '""')}"`,
        `"${r.jobRef}"`,
        `"${r.invoiceRef || ''}"`,
        `"${r.label.replace(/"/g, '""')}"`,
        `"${r.paymentMethod}"`,
        r.amount.toFixed(2),
        r.platformFee.toFixed(2),
        r.netAmount.toFixed(2),
        `"${r.status}"`,
        `"${r.id}"`,
      ];
      csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const filteredAndSortedRows = useMemo(() => {
    const result = initialRows.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.kind !== typeFilter) return false;
      if (methodFilter !== 'all') {
        const m = p.paymentMethod.toLowerCase();
        if (methodFilter === 'card' && !m.includes('card')) return false;
        if (methodFilter === 'ach' && !m.includes('ach')) return false;
        if (methodFilter === 'cash' && !m.includes('cash')) return false;
        if (methodFilter === 'check' && !m.includes('check')) return false;
        if (methodFilter === 'zelle' && !m.includes('zelle')) return false;
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

  const selectedRows = useMemo(() => {
    return initialRows.filter((r) => selectedIds.has(r.id));
  }, [initialRows, selectedIds]);

  const selectedGross = selectedRows.reduce((sum, r) => sum + r.amount, 0);
  const selectedNet = selectedRows.reduce((sum, r) => sum + r.netAmount, 0);

  const filteredGross = filteredAndSortedRows.reduce((sum, r) => sum + r.amount, 0);
  const filteredNet = filteredAndSortedRows.reduce((sum, r) => sum + r.netAmount, 0);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Close overflow menu when clicking elsewhere
  function handleToggleMenu(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpenMenuId((prev) => (prev === id ? null : id));
  }

  return (
    <div
      className="panel"
      style={{ padding: '1.25rem' }}
      onClick={() => {
        if (openMenuId) setOpenMenuId(null);
      }}
    >
      {/* Search & Quick Filter Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
          <input
            type="text"
            className="input"
            placeholder="Search by client, job ref, invoice #, amount…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            id="status-filter-select"
            aria-label="Filter by payment status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input"
            style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
          >
            <option value="all">All Statuses</option>
            <option value="paid">✓ Paid</option>
            <option value="requested">⏳ Pending / Sent</option>
            <option value="failed">✕ Failed</option>
            <option value="refunded">↩ Refunded</option>
            <option value="disputed">🛡️ Disputed</option>
          </select>

          <select
            id="type-filter-select"
            aria-label="Filter by payment category"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="input"
            style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
          >
            <option value="all">All Categories</option>
            <option value="deposit">Deposits</option>
            <option value="progress">Progress Draws</option>
            <option value="final">Final Balances</option>
          </select>
        </div>
      </div>

      {/* Filter Stats & Method Chips */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>
            Showing <strong>{filteredAndSortedRows.length}</strong> of {initialRows.length} transactions
          </span>
          <span style={{ color: 'var(--muted-2, #94a3b8)' }}>•</span>
          <span>Filtered Gross: <strong>{formatUsd(filteredGross)}</strong></span>
          <span style={{ color: 'var(--muted-2, #94a3b8)' }}>•</span>
          <span style={{ color: 'var(--good, #047857)', fontWeight: 600 }}>Net Cash: <strong>{formatUsd(filteredNet)}</strong></span>
        </div>

        {/* Quick Filter Chips */}
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'card', label: '💳 Cards' },
            { key: 'ach', label: '🏦 ACH' },
            { key: 'cash', label: '💵 Cash' },
            { key: 'check', label: '📜 Checks' },
            { key: 'zelle', label: '📱 Zelle' },
          ].map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setMethodFilter(chip.key)}
              style={{
                fontSize: '0.74rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '999px',
                border: methodFilter === chip.key ? '1px solid var(--accent)' : '1px solid var(--line)',
                background: methodFilter === chip.key ? 'rgba(var(--tint), 0.1)' : 'transparent',
                color: methodFilter === chip.key ? 'var(--text)' : 'var(--muted)',
                fontWeight: methodFilter === chip.key ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Floating Multi-Select Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.65rem 1rem',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            animation: 'fadeIn 0.15s ease-out',
            marginBottom: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.86rem' }}>
            <span style={{ padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'var(--primary, #3b82f6)', color: '#fff', fontWeight: 700, fontSize: '0.78rem' }}>
              {selectedIds.size} Selected
            </span>
            <span>
              Total: <strong>{formatUsd(selectedGross)}</strong> gross (<strong>{formatUsd(selectedNet)}</strong> net)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn primary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
              onClick={() => exportRowsToCsv(selectedRows, `selected_payments_${selectedIds.size}.csv`)}
            >
              📥 Export {selectedIds.size} Selected to CSV
            </button>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Streamlined Transactions Table */}
      <div className="table-responsive" style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: '8px' }}>
        <table className="data-table" style={{ width: '100%', fontSize: '0.84rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(var(--tint), 0.03)' }}>
              <th style={{ padding: '0.65rem 0.5rem', width: '32px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  aria-label="Select all transactions"
                  checked={filteredAndSortedRows.length > 0 && selectedIds.size === filteredAndSortedRows.length}
                  onChange={() => handleSelectAll(filteredAndSortedRows)}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('date')}>
                Date {sortField === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('client')}>
                Customer &amp; Job {sortField === 'client' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Description &amp; Stage</th>
              <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Method</th>
              <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('amount')}>
                Amount {sortField === 'amount' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center', cursor: 'pointer' }} onClick={() => handleSort('status')}>
                Status {sortField === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right', width: '130px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>🔍</div>
                  <strong>No transactions match your filter</strong>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Try clearing filters or search query.</p>
                </td>
              </tr>
            ) : (
              filteredAndSortedRows.map((p) => {
                const isSelected = selectedIds.has(p.id);
                const dateStr = p.paidAt
                  ? new Date(p.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : new Date(p.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const avatar = getAvatarColor(p.clientName);
                const initials = getClientInitials(p.clientName);
                const isMenuOpen = openMenuId === p.id;

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderTop: '1px solid var(--line)',
                      background: isSelected ? 'rgba(var(--tint), 0.08)' : 'transparent',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(var(--tint), 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* Checkbox */}
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label={`Select transaction ${p.label}`}
                        checked={isSelected}
                        onChange={() => handleToggleRow(p.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>

                    {/* Date */}
                    <td style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
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
                          <strong style={{ fontSize: '0.86rem', display: 'block', color: 'var(--text)' }}>{p.clientName}</strong>
                          <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{p.jobRef}</span>
                        </div>
                      </div>
                    </td>

                    {/* Description */}
                    <td style={{ padding: '0.6rem 0.8rem' }}>
                      <span style={{ fontSize: '0.84rem', color: 'var(--text)' }}>{p.label}</span>
                      {p.invoiceRef && (
                        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted)' }}>
                          Inv #{p.invoiceRef}
                        </span>
                      )}
                    </td>

                    {/* Method */}
                    <td style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text)' }}>
                        {getMethodIcon(p.paymentMethod)} {p.paymentMethod}
                      </span>
                    </td>

                    {/* Streamlined Amount with Net Cash & Fee Breakdown */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <strong style={{ fontSize: '0.9rem', display: 'block', color: 'var(--text)' }}>
                        {formatUsd(p.amount)}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                        Net {formatUsd(p.netAmount)} {p.platformFee > 0 ? `· Fee -${formatUsd(p.platformFee)}` : '· $0 Fee'}
                      </span>
                    </td>

                    {/* Status Glow Pill */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                      <StatusGlowPill status={p.status} />
                    </td>

                    {/* Decluttered Actions with Context Overflow */}
                    <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', whiteSpace: 'nowrap', position: 'relative' }}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {p.status === 'paid' ? (
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--good, #047857)' }}
                            title="View & Print Official Receipt"
                            onClick={() => onOpenModal('payment_receipt', p)}
                          >
                            🧾 Receipt
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: 600 }}
                            title="View QR code"
                            onClick={() => onOpenModal('qr_code', p)}
                          >
                            📱 QR
                          </button>
                        )}

                        {/* Overflow Action Trigger */}
                        <div style={{ position: 'relative' }}>
                          <button
                            type="button"
                            className="btn secondary"
                            style={{
                              padding: '0.2rem 0.45rem',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                            title="More options"
                            onClick={(e) => handleToggleMenu(p.id, e)}
                          >
                            •••
                          </button>

                          {/* Popup Menu */}
                          {isMenuOpen && (
                            <div
                              style={{
                                position: 'absolute',
                                right: 0,
                                top: '100%',
                                marginTop: '4px',
                                background: 'var(--bg-2)',
                                border: '1px solid var(--line)',
                                borderRadius: '8px',
                                boxShadow: 'var(--shadow-strong)',
                                zIndex: 100,
                                minWidth: '150px',
                                padding: '0.3rem 0',
                                textAlign: 'left',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '0.45rem 0.85rem',
                                  background: 'none',
                                  border: 'none',
                                  textAlign: 'left',
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  color: 'var(--text)',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(var(--tint), 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onOpenModal('payment_detail', p);
                                }}
                              >
                                📋 Full Details
                              </button>

                              <button
                                type="button"
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '0.45rem 0.85rem',
                                  background: 'none',
                                  border: 'none',
                                  textAlign: 'left',
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  color: 'var(--text)',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(var(--tint), 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onOpenModal('qr_code', p);
                                }}
                              >
                                📱 QR Code
                              </button>

                              <button
                                type="button"
                                style={{
                                  display: 'block',
                                  width: '100%',
                                  padding: '0.45rem 0.85rem',
                                  background: 'none',
                                  border: 'none',
                                  textAlign: 'left',
                                  fontSize: '0.78rem',
                                  cursor: 'pointer',
                                  color: 'var(--good, #047857)',
                                  fontWeight: 600,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(var(--tint), 0.08)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onOpenModal('lien_waiver', p);
                                }}
                              >
                                📄 Lien Waiver
                              </button>

                              {p.status === 'paid' && (
                                <button
                                  type="button"
                                  style={{
                                    display: 'block',
                                    width: '100%',
                                    padding: '0.45rem 0.85rem',
                                    background: 'none',
                                    border: 'none',
                                    textAlign: 'left',
                                    fontSize: '0.78rem',
                                    cursor: 'pointer',
                                    color: 'var(--bad, #dc2626)',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(var(--tint), 0.08)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onOpenModal('refund', p);
                                  }}
                                >
                                  ↩ Issue Refund
                                </button>
                              )}
                            </div>
                          )}
                        </div>
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

