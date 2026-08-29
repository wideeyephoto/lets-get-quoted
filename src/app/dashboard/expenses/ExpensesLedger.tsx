'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { ExpenseRow, ExpenseMetrics } from '@/lib/expense-ledger';
import type { CostType } from '@/lib/jobs';
import type { CostSource } from '@/lib/cost-truth';
import ModalDialog from '@/components/modal-dialog';
import JobExpenseFields from '@/components/job-expense-fields';
import { readReceiptAction, createCostAction } from '@/app/dashboard/jobs/actions';

interface Props {
  initialRows: ExpenseRow[];
  initialMetrics: ExpenseMetrics;
  jobs: Array<{ id: string; ref: string; clientName: string; status: string }>;
  crew: Array<{ id: string; name: string; role_label: string | null; hourly_rate: number }>;
}

const CATEGORY_TABS: Array<{ value: CostType | 'all'; label: string }> = [
  { value: 'all', label: 'All Categories' },
  { value: 'material', label: 'Materials & Receipts' },
  { value: 'labor', label: 'Labor & Wages' },
  { value: 'sub', label: 'Subcontractors' },
  { value: 'other', label: 'Other Costs' },
];

function formatMoney(n: number): string {
  const rounded = Math.round(n) || 0;
  return (rounded < 0 ? '-$' : '$') + Math.abs(rounded).toLocaleString('en-US');
}

function formatMoneyExact(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return (rounded < 0 ? '-$' : '$') + Math.abs(rounded).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const SOURCE_BADGES: Record<CostSource, { label: string; tone: string }> = {
  receipt: { label: 'Receipt Photo', tone: 'status-paid' },
  supplier_invoice: { label: 'Supplier Invoice', tone: 'status-paid' },
  clocked: { label: 'Clocked Time', tone: 'status-paid' },
  price_book: { label: 'Price Book', tone: 'status-sent' },
  estimated: { label: 'Estimated', tone: 'status-pending' },
  unspecified: { label: 'Unspecified', tone: 'status-archived' },
};

const CATEGORY_BADGES: Record<CostType, { label: string; style: React.CSSProperties }> = {
  material: { label: 'Material', style: { background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa' } },
  labor: { label: 'Labor', style: { background: 'rgba(168, 85, 247, 0.12)', color: '#c084fc' } },
  sub: { label: 'Subcontractor', style: { background: 'rgba(234, 179, 8, 0.12)', color: '#facc15' } },
  receipt: { label: 'Receipt', style: { background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa' } },
  other: { label: 'Other', style: { background: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1' } },
};

export default function ExpensesLedger({ initialRows, initialMetrics, jobs, crew }: Props) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CostType | 'all'>('all');
  const [selectedSource, setSelectedSource] = useState<CostSource | 'all'>('all');
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [selectedModalJobId, setSelectedModalJobId] = useState<string>(jobs[0]?.id || '');

  const filteredRows = useMemo(() => {
    return initialRows.filter((row) => {
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'material') {
          if (row.type !== 'material' && row.type !== 'receipt') return false;
        } else if (row.type !== selectedCategory) {
          return false;
        }
      }

      if (selectedSource !== 'all' && row.cost_source !== selectedSource) {
        return false;
      }

      if (selectedJobId !== 'all' && row.job_id !== selectedJobId) {
        return false;
      }

      if (query.trim()) {
        const q = query.toLowerCase();
        const descMatch = (row.description || '').toLowerCase().includes(q);
        const suppMatch = (row.supplier || '').toLowerCase().includes(q);
        const crewMatch = (row.crew_name || '').toLowerCase().includes(q);
        const jobRefMatch = (row.job_ref || '').toLowerCase().includes(q);
        const clientMatch = (row.job_client_name || '').toLowerCase().includes(q);
        if (!descMatch && !suppMatch && !crewMatch && !jobRefMatch && !clientMatch) {
          return false;
        }
      }

      return true;
    });
  }, [initialRows, query, selectedCategory, selectedSource, selectedJobId]);

  const filteredTotal = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (Number(r.amount) || 0) + (Number(r.burden_amount) || 0), 0);
  }, [filteredRows]);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedCategory !== 'all') params.set('type', selectedCategory);
    if (selectedSource !== 'all') params.set('source', selectedSource);
    if (selectedJobId !== 'all') params.set('jobId', selectedJobId);
    if (query.trim()) params.set('query', query.trim());
    return `/api/export/expenses?${params.toString()}`;
  }, [selectedCategory, selectedSource, selectedJobId, query]);

  return (
    <div className="expenses-ledger-workspace">
      {/* Metric Summary Cards */}
      <div className="workspace-metric-grid" style={{ marginBottom: '1.5rem' }}>
        <article className="workspace-metric-card accent">
          <span className="workspace-metric-label">Total Logged Spend</span>
          <strong className="workspace-metric-value">{formatMoney(initialMetrics.totalSpend)}</strong>
          <p className="workspace-metric-note">{initialMetrics.transactionCount} cost entries across all jobs</p>
        </article>

        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Materials &amp; Supplies</span>
          <strong className="workspace-metric-value">{formatMoney(initialMetrics.materialsTotal)}</strong>
          <p className="workspace-metric-note">Lumber, fixtures, supplier accounts &amp; slips</p>
        </article>

        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Loaded Labor</span>
          <strong className="workspace-metric-value">{formatMoney(initialMetrics.laborTotal)}</strong>
          <p className="workspace-metric-note">
            {formatMoney(initialMetrics.laborWagesTotal)} wages + {formatMoney(initialMetrics.laborBurdenTotal)} burden
          </p>
        </article>

        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Cost Evidence Ratio</span>
          <strong className="workspace-metric-value">{Math.round(initialMetrics.evidencedRatio * 100)}%</strong>
          <p className="workspace-metric-note">{initialMetrics.evidencedCount} backed by receipts, invoices or clocks</p>
        </article>
      </div>

      {/* Control Header & Filters */}
      <section className="panel workspace-section-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>
            {/* Search */}
            <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '380px' }}>
              <input
                type="text"
                placeholder="Search vendor, description, job, crew…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, rgba(255,255,255,0.05))',
                  color: 'inherit',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            {/* Job Filter */}
            <select
              aria-label="Filter by job"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                background: 'var(--card-bg, rgba(255,255,255,0.05))',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              <option value="all">All Jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.ref} — {j.clientName}
                </option>
              ))}
            </select>

            {/* Source Filter */}
            <select
              aria-label="Filter by cost provenance source"
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value as CostSource | 'all')}
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                background: 'var(--card-bg, rgba(255,255,255,0.05))',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              <option value="all">All Provenance Sources</option>
              <option value="receipt">Receipt Photo</option>
              <option value="supplier_invoice">Supplier Invoice</option>
              <option value="clocked">Clocked Time</option>
              <option value="price_book">Price Book</option>
              <option value="estimated">Estimated Recollection</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <a href={exportUrl} className="btn secondary" download style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>⬇ Export CSV</span>
            </a>

            <ModalDialog triggerClassName="btn primary" triggerLabel="+ Add Expense" title="Log New Expense">
              <form action={async (formData) => {
                const targetJob = formData.get('jobId') ? String(formData.get('jobId')) : selectedModalJobId;
                if (!targetJob) return;
                await createCostAction(targetJob, formData);
              }} className="cost-form">
                <div className="field">
                  <label htmlFor="modal-job-select">Select Job</label>
                  <select
                    id="modal-job-select"
                    name="jobId"
                    value={selectedModalJobId}
                    onChange={(e) => setSelectedModalJobId(e.target.value)}
                    required
                  >
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.ref} — {j.clientName} ({j.status})
                      </option>
                    ))}
                  </select>
                </div>

                <JobExpenseFields
                  crew={crew as unknown as Parameters<typeof JobExpenseFields>[0]['crew']}
                  onReadReceipt={readReceiptAction}
                />

                <div className="modal-actions" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="submit" className="btn primary">Save Expense</button>
                </div>
              </form>
            </ModalDialog>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="tabs" style={{ margin: 0 }}>
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`tab${selectedCategory === tab.value ? ' active' : ''}`}
              onClick={() => setSelectedCategory(tab.value)}
              style={{ cursor: 'pointer', background: 'none', border: 'none' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Expenses Table */}
      <section className="panel workspace-section-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(var(--tint), 0.02)' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            Showing <strong>{filteredRows.length}</strong> of <strong>{initialRows.length}</strong> records
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 650 }}>
            Filtered Total: <strong style={{ color: '#ffd166' }}>{formatMoneyExact(filteredTotal)}</strong>
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
            <p className="empty-state" style={{ margin: 0 }}>
              No expense records match your current filters.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="report-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', background: 'rgba(var(--tint), 0.03)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Job</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Description</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Supplier / Vendor</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Provenance</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Logged By</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const badge = CATEGORY_BADGES[row.type] || CATEGORY_BADGES.other;
                  const source = SOURCE_BADGES[row.cost_source] || SOURCE_BADGES.unspecified;
                  const totalCost = (Number(row.amount) || 0) + (Number(row.burden_amount) || 0);

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        {formatDate(row.created_at)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                        {row.job_id ? (
                          <Link href={`/dashboard/jobs/${row.job_id}?open=costs`} style={{ fontWeight: 600, textDecoration: 'none', color: '#60a5fa' }}>
                            {row.job_ref || 'Job'}
                            <small style={{ display: 'block', color: 'var(--muted)', fontWeight: 400 }}>
                              {row.job_client_name || ''}
                            </small>
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, ...badge.style }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', maxWidth: '280px' }}>
                        <span style={{ fontWeight: 500 }}>{row.description}</span>
                        {row.hours ? (
                          <small style={{ display: 'block', color: 'var(--muted)' }}>
                            {row.hours} hrs @ ${row.rate ? Number(row.rate).toFixed(2) : '0.00'}/hr
                            {row.burden_amount ? ` (+${formatMoneyExact(row.burden_amount)} burden)` : ''}
                          </small>
                        ) : null}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: row.supplier ? 'inherit' : 'var(--muted)' }}>
                        {row.supplier || '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                        <span className={`status-badge ${source.tone}`} style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>
                          {source.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '0.82rem' }}>
                        {row.crew_name || 'Owner'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 650 }}>
                        {formatMoneyExact(totalCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
