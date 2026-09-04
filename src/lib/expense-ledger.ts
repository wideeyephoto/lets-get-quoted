import type { SupabaseClient } from '@supabase/supabase-js';
import type { Cost, CostType } from '@/lib/jobs';
import type { CostSource } from '@/lib/cost-truth';
import { fetchAllPages } from '@/lib/pagination';

export interface ExpenseRow extends Cost {
  job_ref?: string | null;
  job_client_name?: string | null;
  job_status?: string | null;
}

export interface ExpenseFilters {
  type?: CostType | 'all';
  source?: CostSource | 'all';
  jobId?: string;
  supplier?: string;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface ExpenseMetrics {
  totalSpend: number;
  materialsTotal: number;
  laborWagesTotal: number;
  laborBurdenTotal: number;
  laborTotal: number;
  subcontractorsTotal: number;
  otherTotal: number;
  transactionCount: number;
  evidencedCount: number;
  evidencedRatio: number;
}

export async function listAccountExpenses(
  supabase: SupabaseClient,
  accountId: string,
  filters: ExpenseFilters = {},
): Promise<{ rows: ExpenseRow[]; totalCount: number }> {
  let query = supabase
    .from('costs')
    .select('*, jobs(ref, client_name, status)', { count: 'exact' })
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (filters.type && filters.type !== 'all') {
    if (filters.type === 'material') {
      query = query.in('type', ['material', 'receipt']);
    } else {
      query = query.eq('type', filters.type);
    }
  }

  if (filters.source && filters.source !== 'all') {
    query = query.eq('cost_source', filters.source);
  }

  if (filters.jobId) {
    if (filters.jobId === 'overhead') {
      query = query.is('job_id', null);
    } else {
      query = query.eq('job_id', filters.jobId);
    }
  }

  if (filters.supplier && filters.supplier !== 'all') {
    query = query.eq('supplier', filters.supplier);
  }

  if (filters.dateFrom) {
    query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`);
  }

  if (filters.dateTo) {
    query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`);
  }

  if (filters.query && filters.query.trim()) {
    const q = filters.query.trim();
    query = query.or(`description.ilike.%${q}%,supplier.ilike.%${q}%,crew_name.ilike.%${q}%`);
  }

  const limit = Math.min(5000, Math.max(1, filters.limit ?? 50));
  const offset = Math.max(0, filters.offset ?? 0);
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const rows: ExpenseRow[] = (data ?? []).map((item: Record<string, unknown>) => {
    const job = item.jobs as Record<string, unknown> | null;
    return {
      id: String(item.id),
      account_id: String(item.account_id),
      job_id: item.job_id ? String(item.job_id) : null,
      type: item.type as CostType,
      category: String(item.category ?? 'Other'),
      description: String(item.description ?? ''),
      amount: Number(item.amount) || 0,
      burden_amount: Number(item.burden_amount) || 0,
      crew_id: item.crew_id ? String(item.crew_id) : null,
      crew_name: item.crew_name ? String(item.crew_name) : null,
      crew_role_label: item.crew_role_label ? String(item.crew_role_label) : null,
      supplier: item.supplier ? String(item.supplier) : null,
      receipt_url: item.receipt_url ? String(item.receipt_url) : null,
      client_charge_payment_id: item.client_charge_payment_id ? String(item.client_charge_payment_id) : null,
      client_charge_requested_at: item.client_charge_requested_at ? String(item.client_charge_requested_at) : null,
      cost_source: item.cost_source as CostSource,
      hours: item.hours != null ? Number(item.hours) : null,
      rate: item.rate != null ? Number(item.rate) : null,
      created_at: String(item.created_at),
      job_ref: job?.ref ? String(job.ref) : null,
      job_client_name: job?.client_name ? String(job.client_name) : null,
      job_status: job?.status ? String(job.status) : null,
    };
  });

  return { rows, totalCount: count ?? rows.length };
}

export async function listAllAccountExpenses(
  supabase: SupabaseClient,
  accountId: string,
  filters: ExpenseFilters = {},
): Promise<{ rows: ExpenseRow[]; totalCount: number }> {
  const allRows: ExpenseRow[] = [];
  let offset = 0;
  const BATCH_SIZE = 1000;

  while (true) {
    const { rows, totalCount } = await listAccountExpenses(supabase, accountId, {
      ...filters,
      limit: BATCH_SIZE,
      offset,
    });
    allRows.push(...rows);
    offset += rows.length;
    if (rows.length === 0 || allRows.length >= totalCount || rows.length < BATCH_SIZE) {
      return { rows: allRows, totalCount };
    }
  }
}

export async function listAccountSuppliers(
  supabase: SupabaseClient,
  accountId: string,
): Promise<string[]> {
  const rows = await fetchAllPages<{ supplier: string | null }>((from, to) => {
    return supabase
      .from('costs')
      .select('supplier')
      .eq('account_id', accountId)
      .not('supplier', 'is', null)
      .order('supplier', { ascending: true })
      .range(from, to);
  });
  const set = new Set<string>();
  for (const r of rows) {
    if (r.supplier && r.supplier.trim()) {
      set.add(r.supplier.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export async function getExpenseSummaryMetrics(
  supabase: SupabaseClient,
  accountId: string,
  filters: Pick<ExpenseFilters, 'dateFrom' | 'dateTo' | 'jobId' | 'type' | 'source' | 'supplier'> = {},
): Promise<ExpenseMetrics> {
  const rows = await fetchAllPages<{
    type: CostType;
    amount: number;
    burden_amount: number | null;
    cost_source: CostSource;
  }>((from, to) => {
    let query = supabase
      .from('costs')
      .select('type, amount, burden_amount, cost_source')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (filters.jobId) {
      if (filters.jobId === 'overhead') {
        query = query.is('job_id', null);
      } else {
        query = query.eq('job_id', filters.jobId);
      }
    }

    if (filters.type && filters.type !== 'all') {
      if (filters.type === 'material') {
        query = query.in('type', ['material', 'receipt']);
      } else {
        query = query.eq('type', filters.type);
      }
    }

    if (filters.source && filters.source !== 'all') {
      query = query.eq('cost_source', filters.source);
    }

    if (filters.supplier && filters.supplier !== 'all') {
      query = query.eq('supplier', filters.supplier);
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', `${filters.dateFrom}T00:00:00.000Z`);
    }

    if (filters.dateTo) {
      query = query.lte('created_at', `${filters.dateTo}T23:59:59.999Z`);
    }

    return query.range(from, to);
  });

  let materialsTotal = 0;
  let laborWagesTotal = 0;
  let laborBurdenTotal = 0;
  let subcontractorsTotal = 0;
  let otherTotal = 0;
  let evidencedCount = 0;

  for (const item of rows) {
    const amt = Number(item.amount) || 0;
    const burden = Number(item.burden_amount) || 0;
    const type = item.type;
    const source = item.cost_source;

    if (type === 'material' || type === 'receipt') {
      materialsTotal += amt;
    } else if (type === 'labor') {
      laborWagesTotal += amt;
      laborBurdenTotal += burden;
    } else if (type === 'sub') {
      subcontractorsTotal += amt;
    } else {
      otherTotal += amt;
    }

    if (source === 'receipt' || source === 'supplier_invoice' || source === 'clocked') {
      evidencedCount += 1;
    }
  }

  const laborTotal = Math.round((laborWagesTotal + laborBurdenTotal) * 100) / 100;
  const totalSpend = Math.round((materialsTotal + laborTotal + subcontractorsTotal + otherTotal) * 100) / 100;

  return {
    totalSpend,
    materialsTotal: Math.round(materialsTotal * 100) / 100,
    laborWagesTotal: Math.round(laborWagesTotal * 100) / 100,
    laborBurdenTotal: Math.round(laborBurdenTotal * 100) / 100,
    laborTotal,
    subcontractorsTotal: Math.round(subcontractorsTotal * 100) / 100,
    otherTotal: Math.round(otherTotal * 100) / 100,
    transactionCount: rows.length,
    evidencedCount,
    evidencedRatio: rows.length > 0 ? Math.round((evidencedCount / rows.length) * 100) / 100 : 0,
  };
}

export function formatExpenseLocalDate(iso: string, timeZone?: string): string {
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

export function generateExpensesCsv(rows: ExpenseRow[], timeZone?: string): string {
  const headers = [
    'Date',
    'Job Ref',
    'Client',
    'Category',
    'Type',
    'Description',
    'Supplier / Vendor',
    'Amount ($)',
    'Labor Burden ($)',
    'Total Cost ($)',
    'Hours',
    'Rate ($/hr)',
    'Logged By',
    'Cost Provenance Source',
  ];

  const escapeCsv = (val: unknown): string => {
    let s = String(val ?? '');
    // Neutralize spreadsheet formula injection (CWE-1236)
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.join(',')];

  for (const r of rows) {
    const totalCost = (Number(r.amount) || 0) + (Number(r.burden_amount) || 0);
    const dateStr = r.created_at ? (timeZone ? formatExpenseLocalDate(r.created_at, timeZone) : r.created_at.slice(0, 10)) : '';

    const line = [
      escapeCsv(dateStr),
      escapeCsv(r.job_ref || ''),
      escapeCsv(r.job_client_name || ''),
      escapeCsv(r.category),
      escapeCsv(r.type),
      escapeCsv(r.description),
      escapeCsv(r.supplier || ''),
      Number(r.amount).toFixed(2),
      r.burden_amount != null ? Number(r.burden_amount).toFixed(2) : '0.00',
      totalCost.toFixed(2),
      r.hours != null ? Number(r.hours).toFixed(2) : '',
      r.rate != null ? Number(r.rate).toFixed(2) : '',
      escapeCsv(r.crew_name || 'Owner / Office'),
      escapeCsv(r.cost_source),
    ];

    lines.push(line.join(','));
  }

  return lines.join('\n');
}
