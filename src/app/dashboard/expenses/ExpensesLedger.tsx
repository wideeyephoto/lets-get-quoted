'use client';

import { useState, useMemo, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ExpenseRow, ExpenseMetrics } from '@/lib/expense-ledger';
import type { Cost, CostType } from '@/lib/jobs';
import type { CostSource } from '@/lib/cost-truth';
import ExpenseDetailDrawer from './ExpenseDetailDrawer';
import {
  createCostAction,
  deleteCostAction,
} from '@/app/dashboard/jobs/actions';

interface Props {
  initialRows: ExpenseRow[];
  totalCount?: number;
  canManageCosts?: boolean;
  initialMetrics: ExpenseMetrics;
  jobs: Array<{ id: string; ref: string; clientName: string; status: string }>;
  crew: Array<{ id: string; name: string; role_label: string | null; hourly_rate: number }>;
  accountTimeZone?: string;
  availableSuppliers?: string[];
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

function toLocalDateStr(iso: string, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

function formatDate(iso: string, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: timeZone || undefined,
    });
  } catch {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}

function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
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

type SortKey = 'date' | 'amount' | 'job' | 'category' | 'supplier';

export default function ExpensesLedger({
  initialRows,
  totalCount = initialRows.length,
  canManageCosts = true,
  initialMetrics,
  jobs,
  crew,
  accountTimeZone = 'America/New_York',
  availableSuppliers = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CostType | 'all'>('all');
  const [selectedSource, setSelectedSource] = useState<CostSource | 'all'>('all');
  const [selectedJobId, setSelectedJobId] = useState<string>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState<string>('all');

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Live row state for instant updates and autosave sync
  const [rows, setRows] = useState<ExpenseRow[]>(initialRows);
  const [liveTotalCount, setLiveTotalCount] = useState<number>(totalCount);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setLiveTotalCount(totalCount);
  }, [totalCount]);

  // Quick Add state (first 3 fields visible: Job, Item, Cost)
  const [quickJobId, setQuickJobId] = useState<string>('');
  const [quickItem, setQuickItem] = useState<string>('');
  const [quickCost, setQuickCost] = useState<string>('');
  const [isQuickAdding, setIsQuickAdding] = useState<boolean>(false);

  // Active drawer for full details & autosaving
  const [activeDrawerExpense, setActiveDrawerExpense] = useState<ExpenseRow | null>(null);

  // Available unique suppliers
  const suppliers = useMemo(() => {
    if (availableSuppliers && availableSuppliers.length > 0) {
      return availableSuppliers;
    }
    const set = new Set<string>();
    for (const r of rows) {
      if (r.supplier && r.supplier.trim()) {
        set.add(r.supplier.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [availableSuppliers, rows]);

  // Date preset handler aligned to account timezone
  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const todayStr = toLocalDateStr(now.toISOString(), accountTimeZone);
    const [y, m] = todayStr.split('-').map(Number); // m is 1..12

    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'this_month') {
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setDateFrom(start);
      setDateTo(end);
    } else if (preset === 'last_month') {
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevYear = m === 1 ? y - 1 : y;
      const lastDay = new Date(prevYear, prevMonth, 0).getDate();
      const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const end = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setDateFrom(start);
      setDateTo(end);
    } else if (preset === 'this_quarter') {
      const q = Math.floor((m - 1) / 3);
      const startMonth = q * 3 + 1;
      const endMonth = startMonth + 2;
      const lastDay = new Date(y, endMonth, 0).getDate();
      const start = `${y}-${String(startMonth).padStart(2, '0')}-01`;
      const end = `${y}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      setDateFrom(start);
      setDateTo(end);
    } else if (preset === 'ytd') {
      const start = `${y}-01-01`;
      setDateFrom(start);
      setDateTo(todayStr);
    }
  };

  const isFiltered = useMemo(() => {
    return (
      query.trim() !== '' ||
      selectedCategory !== 'all' ||
      selectedSource !== 'all' ||
      selectedJobId !== 'all' ||
      selectedSupplier !== 'all' ||
      dateFrom !== '' ||
      dateTo !== ''
    );
  }, [query, selectedCategory, selectedSource, selectedJobId, selectedSupplier, dateFrom, dateTo]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
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

      if (selectedJobId !== 'all') {
        if (selectedJobId === 'overhead') {
          if (row.job_id) return false;
        } else if (row.job_id !== selectedJobId) {
          return false;
        }
      }

      if (selectedSupplier !== 'all' && (row.supplier || '').trim() !== selectedSupplier) {
        return false;
      }

      if (dateFrom) {
        const rowDate = toLocalDateStr(row.created_at, accountTimeZone);
        if (rowDate < dateFrom) return false;
      }

      if (dateTo) {
        const rowDate = toLocalDateStr(row.created_at, accountTimeZone);
        if (rowDate > dateTo) return false;
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
  }, [rows, query, selectedCategory, selectedSource, selectedJobId, selectedSupplier, dateFrom, dateTo, accountTimeZone]);

  // Sorted rows
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') {
        cmp = a.created_at.localeCompare(b.created_at);
      } else if (sortKey === 'amount') {
        const aTotal = (Number(a.amount) || 0) + (Number(a.burden_amount) || 0);
        const bTotal = (Number(b.amount) || 0) + (Number(b.burden_amount) || 0);
        cmp = aTotal - bTotal;
      } else if (sortKey === 'job') {
        cmp = (a.job_ref || '').localeCompare(b.job_ref || '');
      } else if (sortKey === 'category') {
        cmp = a.type.localeCompare(b.type);
      } else if (sortKey === 'supplier') {
        cmp = (a.supplier || '').localeCompare(b.supplier || '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredRows, sortKey, sortDir]);

  // Paginated slice
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  // Dynamic responsive metrics
  const displayMetrics = useMemo(() => {
    if (!isFiltered) {
      return initialMetrics;
    }

    let materialsTotal = 0;
    let laborWagesTotal = 0;
    let laborBurdenTotal = 0;
    let subcontractorsTotal = 0;
    let otherTotal = 0;
    let evidencedCount = 0;

    for (const r of filteredRows) {
      const amt = Number(r.amount) || 0;
      const burden = Number(r.burden_amount) || 0;
      if (r.type === 'material' || r.type === 'receipt') {
        materialsTotal += amt;
      } else if (r.type === 'labor') {
        laborWagesTotal += amt;
        laborBurdenTotal += burden;
      } else if (r.type === 'sub') {
        subcontractorsTotal += amt;
      } else {
        otherTotal += amt;
      }

      if (r.cost_source === 'receipt' || r.cost_source === 'supplier_invoice' || r.cost_source === 'clocked') {
        evidencedCount += 1;
      }
    }

    const laborTotal = Math.round((laborWagesTotal + laborBurdenTotal) * 100) / 100;
    const totalSpend = Math.round((materialsTotal + laborTotal + subcontractorsTotal + otherTotal) * 100) / 100;
    const evidencedRatio = filteredRows.length > 0 ? evidencedCount / filteredRows.length : 0;

    return {
      totalSpend,
      materialsTotal: Math.round(materialsTotal * 100) / 100,
      laborWagesTotal: Math.round(laborWagesTotal * 100) / 100,
      laborBurdenTotal: Math.round(laborBurdenTotal * 100) / 100,
      laborTotal,
      subcontractorsTotal: Math.round(subcontractorsTotal * 100) / 100,
      otherTotal: Math.round(otherTotal * 100) / 100,
      transactionCount: filteredRows.length,
      evidencedCount,
      evidencedRatio,
    };
  }, [isFiltered, initialMetrics, filteredRows]);

  const filteredTotal = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + (Number(r.amount) || 0) + (Number(r.burden_amount) || 0), 0);
  }, [filteredRows]);

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedCategory !== 'all') params.set('type', selectedCategory);
    if (selectedSource !== 'all') params.set('source', selectedSource);
    if (selectedJobId !== 'all') params.set('jobId', selectedJobId);
    if (selectedSupplier !== 'all') params.set('supplier', selectedSupplier);
    if (query.trim()) params.set('query', query.trim());
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    return `/api/export/expenses?${params.toString()}`;
  }, [selectedCategory, selectedSource, selectedJobId, selectedSupplier, query, dateFrom, dateTo]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc');
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = quickItem.trim();
    const amt = Number(quickCost);
    if (!item || isNaN(amt) || amt <= 0) return;

    setIsQuickAdding(true);
    try {
      const formData = new FormData();
      formData.set('jobId', quickJobId || 'overhead');
      formData.set('type', 'material');
      formData.set('description', item);
      formData.set('amount', quickCost.trim());
      formData.set('costSource', 'estimated');

      const targetJob = quickJobId && quickJobId !== 'overhead' ? quickJobId : null;
      const created = (await createCostAction(targetJob, formData)) as Cost;

      const matchedJob = jobs.find((j) => j.id === quickJobId);
      const newRow: ExpenseRow = {
        ...created,
        job_id: targetJob,
        job_ref: matchedJob?.ref || null,
        job_client_name: matchedJob?.clientName || null,
        job_status: matchedJob?.status || null,
      };

      setRows((prev) => [newRow, ...prev.filter((r) => r.id !== newRow.id)]);
      setLiveTotalCount((c) => c + 1);
      setQuickItem('');
      setQuickCost('');
      setActiveDrawerExpense(newRow);

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add expense');
    } finally {
      setIsQuickAdding(false);
    }
  };

  const handleUpdateRow = (updated: ExpenseRow) => {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (activeDrawerExpense?.id === updated.id) {
      setActiveDrawerExpense(updated);
    }
  };

  const handleDeleteRow = (deletedId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== deletedId));
    setLiveTotalCount((c) => Math.max(0, c - 1));
    if (activeDrawerExpense?.id === deletedId) {
      setActiveDrawerExpense(null);
    }
  };

  const handleDelete = async (row: ExpenseRow) => {
    const confirmed = window.confirm(`Delete "${row.description || 'this expense'}" ($${(Number(row.amount) || 0).toFixed(2)})?`);
    if (!confirmed) return;

    setRows((prev) => prev.filter((r) => r.id !== row.id));
    setLiveTotalCount((c) => Math.max(0, c - 1));
    if (activeDrawerExpense?.id === row.id) {
      setActiveDrawerExpense(null);
    }

    startTransition(async () => {
      await deleteCostAction(row.job_id, row.id);
      router.refresh();
    });
  };

  return (
    <div className="expenses-ledger-workspace">
      {/* Metric Summary Cards */}
      <div className="workspace-metric-grid" style={{ marginBottom: '1.5rem' }}>
        <article className="workspace-metric-card accent">
          <span className="workspace-metric-label">Total Logged Spend</span>
          <strong className="workspace-metric-value">{formatMoney(displayMetrics.totalSpend)}</strong>
          <p className="workspace-metric-note">
            {displayMetrics.transactionCount} cost entries {isFiltered ? 'in filtered scope' : 'across all jobs & overhead'}
          </p>
        </article>

        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Materials &amp; Supplies</span>
          <strong className="workspace-metric-value">{formatMoney(displayMetrics.materialsTotal)}</strong>
          <p className="workspace-metric-note">Lumber, fixtures, supplier accounts &amp; slips</p>
        </article>

        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Loaded Labor</span>
          <strong className="workspace-metric-value">{formatMoney(displayMetrics.laborTotal)}</strong>
          <p className="workspace-metric-note">
            {formatMoney(displayMetrics.laborWagesTotal)} wages + {formatMoney(displayMetrics.laborBurdenTotal)} burden
          </p>
        </article>

        <article className="workspace-metric-card">
          <span className="workspace-metric-label">Cost Evidence Ratio</span>
          <strong className="workspace-metric-value">{Math.round(displayMetrics.evidencedRatio * 100)}%</strong>
          <p className="workspace-metric-note">
            {displayMetrics.evidencedCount} backed by receipts, invoices or clocks
          </p>
        </article>
      </div>

      {/* Control Header & Filters */}
      <section className="panel workspace-section-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>
            {/* Search */}
            <div style={{ position: 'relative', minWidth: '220px', flex: 1, maxWidth: '320px' }}>
              <input
                type="text"
                placeholder="Search vendor, description, job, crew…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCurrentPage(1);
                }}
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
              onChange={(e) => {
                setSelectedJobId(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--line)',
                background: 'var(--card-bg, rgba(255,255,255,0.05))',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              <option value="all">All Jobs &amp; Overhead</option>
              <option value="overhead">— General Overhead (No Job)</option>
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
              onChange={(e) => {
                setSelectedSource(e.target.value as CostSource | 'all');
                setCurrentPage(1);
              }}
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
              <option value="estimated">Estimated</option>
            </select>

            {/* Supplier / Vendor Filter */}
            {suppliers.length > 0 && (
              <select
                aria-label="Filter by supplier / vendor"
                value={selectedSupplier}
                onChange={(e) => {
                  setSelectedSupplier(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, rgba(255,255,255,0.05))',
                  color: 'inherit',
                  fontSize: '0.9rem',
                }}
              >
                <option value="all">All Suppliers / Vendors</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <a href={exportUrl} className="btn secondary" download style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>⬇ Export CSV</span>
            </a>
          </div>
        </div>

        {/* Date Range Presets & Custom Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--muted)', marginRight: '0.25rem' }}>Date:</span>
          {[
            { id: 'all', label: 'All Time' },
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'this_quarter', label: 'This Quarter' },
            { id: 'ytd', label: 'YTD' },
            { id: 'custom', label: 'Custom' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`tab${datePreset === preset.id ? ' active' : ''}`}
              onClick={() => handleDatePreset(preset.id)}
              style={{
                fontSize: '0.82rem',
                padding: '0.25rem 0.6rem',
                borderRadius: '4px',
                cursor: 'pointer',
                background: datePreset === preset.id ? 'rgba(59, 130, 246, 0.15)' : 'none',
                color: datePreset === preset.id ? '#60a5fa' : 'inherit',
                border: datePreset === preset.id ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
              }}
            >
              {preset.label}
            </button>
          ))}

          {(datePreset === 'custom' || dateFrom || dateTo) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem' }}>
              <input
                type="date"
                aria-label="Start date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setDatePreset('custom');
                  setCurrentPage(1);
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, rgba(255,255,255,0.05))',
                  color: 'inherit',
                  fontSize: '0.82rem',
                }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>to</span>
              <input
                type="date"
                aria-label="End date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setDatePreset('custom');
                  setCurrentPage(1);
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, rgba(255,255,255,0.05))',
                  color: 'inherit',
                  fontSize: '0.82rem',
                }}
              />
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div className="tabs" style={{ margin: 0 }}>
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`tab${selectedCategory === tab.value ? ' active' : ''}`}
              onClick={() => {
                setSelectedCategory(tab.value);
                setCurrentPage(1);
              }}
              style={{ cursor: 'pointer', background: 'none', border: 'none' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Expenses Table */}
      <section className="panel workspace-section-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Quick Add Form: Job, Item, Cost */}
        {canManageCosts && (
          <form
            onSubmit={handleQuickAdd}
            style={{
              padding: '0.85rem 1.25rem',
              borderBottom: '1px solid var(--line)',
              background: 'rgba(var(--tint), 0.03)',
              display: 'flex',
              alignItems: 'flex-end',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 200px', minWidth: '170px' }}>
              <label htmlFor="quick-job-select" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.3rem' }}>
                Job
              </label>
              <select
                id="quick-job-select"
                value={quickJobId}
                onChange={(e) => setQuickJobId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.48rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, rgba(255,255,255,0.05))',
                  color: 'inherit',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">General Overhead (No Job)</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.ref} — {j.clientName} ({j.status})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '2 1 240px', minWidth: '180px' }}>
              <label htmlFor="quick-item-input" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.3rem' }}>
                Item / Description
              </label>
              <input
                id="quick-item-input"
                type="text"
                value={quickItem}
                onChange={(e) => setQuickItem(e.target.value)}
                placeholder="e.g. 2x4 Lumber, Dump fee, Tools..."
                required
                style={{
                  width: '100%',
                  padding: '0.48rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, rgba(255,255,255,0.05))',
                  color: 'inherit',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div style={{ flex: '0 1 140px', minWidth: '110px' }}>
              <label htmlFor="quick-cost-input" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.3rem' }}>
                Cost ($)
              </label>
              <input
                id="quick-cost-input"
                type="number"
                step="0.01"
                min="0.01"
                value={quickCost}
                onChange={(e) => setQuickCost(e.target.value)}
                placeholder="0.00"
                required
                style={{
                  width: '100%',
                  padding: '0.48rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--card-bg, rgba(255,255,255,0.05))',
                  color: 'inherit',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div>
              <button
                type="submit"
                className="btn primary"
                disabled={isQuickAdding || !quickItem.trim() || !quickCost || Number(quickCost) <= 0}
                style={{
                  padding: '0.48rem 1rem',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {isQuickAdding ? (
                  <>
                    <span className="spinner" style={{ width: '12px', height: '12px' }} />
                    <span>Adding…</span>
                  </>
                ) : (
                  <span>+ Add Expense</span>
                )}
              </button>
            </div>
          </form>
        )}

        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(var(--tint), 0.02)', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            Showing <strong>{sortedRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, sortedRows.length)}</strong> of <strong>{sortedRows.length}</strong> matching ({liveTotalCount} total)
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 650 }}>
            Filtered Total: <strong style={{ color: '#ffd166' }}>{formatMoneyExact(filteredTotal)}</strong>
          </span>
        </div>

        {sortedRows.length === 0 ? (
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
                  <th
                    style={{ padding: '0.75rem 1rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('date')}
                  >
                    Date {sortKey === 'date' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    style={{ padding: '0.75rem 1rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('job')}
                  >
                    Job {sortKey === 'job' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    style={{ padding: '0.75rem 1rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('category')}
                  >
                    Category {sortKey === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Description</th>
                  <th
                    style={{ padding: '0.75rem 1rem', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('supplier')}
                  >
                    Supplier / Vendor {sortKey === 'supplier' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Provenance &amp; Receipt</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Logged By</th>
                  <th
                    style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => toggleSort('amount')}
                  >
                    Amount {sortKey === 'amount' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  {canManageCosts && <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => {
                  const badge = CATEGORY_BADGES[row.type] || CATEGORY_BADGES.other;
                  const source = SOURCE_BADGES[row.cost_source] || SOURCE_BADGES.unspecified;
                  const totalCost = (Number(row.amount) || 0) + (Number(row.burden_amount) || 0);

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: '1px solid var(--line)',
                        cursor: canManageCosts ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (canManageCosts) setActiveDrawerExpense(row);
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        {formatDate(row.created_at, accountTimeZone)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                        {row.job_id ? (
                          <Link
                            href={`/dashboard/jobs/${row.job_id}?open=costs`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontWeight: 600, textDecoration: 'none', color: '#60a5fa' }}
                          >
                            {row.job_ref || 'Job'}
                            <small style={{ display: 'block', color: 'var(--muted)', fontWeight: 400 }}>
                              {row.job_client_name || ''}
                            </small>
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>— General Overhead</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, ...badge.style }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', maxWidth: '280px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500 }}>{row.description}</span>
                          {row.client_charge_payment_id && (
                            <span className="status-badge status-paid" style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem' }}>
                              Rebilled
                            </span>
                          )}
                          {!row.client_charge_payment_id && row.client_charge_requested_at && (
                            <span className="status-badge status-pending" style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem' }}>
                              Rebill Pending
                            </span>
                          )}
                        </div>
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                          <span className={`status-badge ${source.tone}`} style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem' }}>
                            {source.label}
                          </span>
                          {isSafeHttpUrl(row.receipt_url) && (
                            <a
                              href={row.receipt_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#60a5fa', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                            >
                              <span>🧾 View Receipt ↗</span>
                            </a>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: '0.82rem' }}>
                        {row.crew_name || 'Owner / Office'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 650 }}>
                        {formatMoneyExact(totalCost)}
                      </td>
                      {canManageCosts && (
                        <td
                          style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', textAlign: 'center' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Edit expense details"
                              onClick={() => setActiveDrawerExpense(row)}
                              style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '0.95rem' }}
                            >
                              ✎
                            </button>

                            <button
                              type="button"
                              className="icon-btn"
                              title="Delete expense"
                              onClick={() => handleDelete(row)}
                              disabled={isPending}
                              style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '0.9rem', color: '#f87171' }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(var(--tint), 0.01)' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Page {currentPage} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn secondary"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem' }}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Slide-over Expense Detail Drawer */}
      <ExpenseDetailDrawer
        expense={activeDrawerExpense}
        onClose={() => setActiveDrawerExpense(null)}
        onUpdate={handleUpdateRow}
        onDelete={handleDeleteRow}
        jobs={jobs}
        crew={crew}
        suppliers={suppliers}
        accountTimeZone={accountTimeZone}
        canManageCosts={canManageCosts}
      />
    </div>
  );
}
