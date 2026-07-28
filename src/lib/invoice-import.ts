import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreateClientId } from '@/lib/clients';
import { normalizeUsPhone } from '@/lib/phone';
import { parseImportedDate } from '@/lib/jobs';
import type { InvoiceStatus } from '@/lib/invoices';

// CRM migration — invoices + payments. Each source row is an invoice; because
// invoices.job_id / payments.job_id are NOT NULL, every imported invoice also
// creates a completed job shell (the agreed model). Imported paid invoices get a
// payments row flagged imported=true so history never touches Stripe/payouts and
// stays out of the trailing-volume fee bracket. Deduped by the same
// name+scope+date+amount job signature so a re-import is safe.

export type InvoiceImportRow = {
  clientName: string | null;
  clientPhone: string | null;
  clientEmail: string | null;
  address: string | null;
  description: string | null;
  date: string | null;
  total: string | null;
  status: string | null;
};

export type InvoiceImportResult = { imported: number; duplicates: number; skipped: number; needsSetup?: boolean };

function money(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
}

// Free-text invoice status -> our enum + whether it's been paid (drives whether
// we record a payment). Unknown/blank is treated as unpaid — we never invent
// revenue that wasn't in the file.
export function mapInvoiceStatus(raw: string | null): { invoiceStatus: InvoiceStatus; paid: boolean } {
  const s = (raw ?? '').trim().toLowerCase();
  // Check the negatives first — "unpaid"/"not paid" contain "paid".
  if (/(unpaid|not paid|outstanding|overdue|balance due|owe)/.test(s)) return { invoiceStatus: 'sent', paid: false };
  if (/(void|cancel|refund)/.test(s)) return { invoiceStatus: 'void', paid: false };
  if (/(draft)/.test(s)) return { invoiceStatus: 'draft', paid: false };
  if (/(sign|accept|approv)/.test(s)) return { invoiceStatus: 'signed', paid: false };
  if (/(paid|complete|closed|settled)/.test(s)) return { invoiceStatus: 'paid', paid: true };
  return { invoiceStatus: 'sent', paid: false };
}

// The financial import needs payments.imported so history stays out of the fee
// bracket. Probe once; refuse the import if it hasn't been migrated yet.
export async function financialImportReady(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('payments').select('imported').limit(1);
  return !error;
}

type Plan = {
  jobRef: string;
  invRef: string;
  job: Record<string, unknown>;
  invoice: Record<string, unknown>;
  itemDescription: string;
  amount: number;
  paid: boolean;
  paidAt: string | undefined;
};

export async function importInvoices(
  supabase: SupabaseClient,
  accountId: string,
  rows: InvoiceImportRow[],
): Promise<InvoiceImportResult> {
  if (!(await financialImportReady(supabase))) {
    return { imported: 0, duplicates: 0, skipped: 0, needsSetup: true };
  }

  const [{ data: existingJobs }, { data: existingInv }] = await Promise.all([
    supabase.from('jobs').select('ref, client_name, scope, scheduled_for, quoted_amount').eq('account_id', accountId),
    supabase.from('invoices').select('ref').eq('account_id', accountId),
  ]);

  const sig = (name: string, scope: string, date: string | null, amount: number) =>
    `${name.trim().toLowerCase()}|${scope.trim().toLowerCase()}|${date ?? ''}|${amount}`;

  let maxJob = 1000;
  let maxInv = 2000;
  const signatures = new Set<string>();
  for (const j of existingJobs ?? []) {
    const m = /^J-(\d+)$/.exec((j as { ref?: string }).ref ?? '');
    if (m) maxJob = Math.max(maxJob, parseInt(m[1], 10));
    signatures.add(sig(String(j.client_name ?? ''), String(j.scope ?? ''), (j.scheduled_for as string | null) ?? null, Number(j.quoted_amount) || 0));
  }
  for (const inv of existingInv ?? []) {
    const m = /^INV-(\d+)$/.exec((inv as { ref?: string }).ref ?? '');
    if (m) maxInv = Math.max(maxInv, parseInt(m[1], 10));
  }

  const clientCache = new Map<string, string | null>();
  async function resolveClientId(name: string, phone: string | null, email: string | null, address: string | null): Promise<string | null> {
    const np = phone ? normalizeUsPhone(phone) : null;
    const ne = email ? email.trim().toLowerCase() : null;
    const key = np ? `p:${np}` : ne ? `e:${ne}` : null;
    if (!key) return null;
    const cached = clientCache.get(key);
    if (cached !== undefined) return cached;
    const id = await findOrCreateClientId(supabase, accountId, { name, phone, email, address });
    clientCache.set(key, id);
    return id;
  }

  const plans: Plan[] = [];
  let duplicates = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = (row.clientName ?? '').trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const desc = (row.description ?? '').trim();
    const date = parseImportedDate(row.date);
    const total = money(row.total);
    const signature = sig(name, desc, date, total);
    if (signatures.has(signature)) {
      duplicates += 1;
      continue;
    }
    signatures.add(signature);

    const { invoiceStatus, paid } = mapInvoiceStatus(row.status);
    const clientId = await resolveClientId(name, row.clientPhone, row.clientEmail, row.address);
    maxJob += 1;
    maxInv += 1;
    const jobRef = `J-${maxJob}`;
    const invRef = `INV-${maxInv}`;
    const createdAt = date ? `${date}T12:00:00Z` : undefined;
    const jobStatus = paid ? 'complete' : invoiceStatus === 'void' ? 'archived' : 'in_progress';

    plans.push({
      jobRef,
      invRef,
      job: {
        account_id: accountId,
        ref: jobRef,
        client_name: name,
        client_phone: row.clientPhone?.trim() || null,
        client_email: row.clientEmail?.trim() || null,
        address: row.address?.trim() || null,
        scope: desc || null,
        status: jobStatus,
        quoted_amount: total,
        client_id: clientId,
        photo_paths: [],
        ...(createdAt ? { created_at: createdAt } : {}),
      },
      invoice: {
        account_id: accountId,
        ref: invRef,
        status: invoiceStatus,
        total,
        ...(createdAt ? { created_at: createdAt } : {}),
      },
      itemDescription: desc || 'Imported invoice',
      amount: total,
      paid,
      paidAt: createdAt,
    });
  }

  if (plans.length === 0) return { imported: 0, duplicates, skipped };

  // Phase A — jobs (map our pre-allocated ref back to the new id).
  const jobIdByRef = new Map<string, string>();
  for (let i = 0; i < plans.length; i += 500) {
    const chunk = plans.slice(i, i + 500).map((p) => p.job);
    const { data, error } = await supabase.from('jobs').insert(chunk).select('id, ref');
    if (error) {
      console.error('Invoice import (jobs) chunk failed:', error.message);
      continue;
    }
    for (const r of data ?? []) jobIdByRef.set(r.ref as string, r.id as string);
  }

  // Phase B — invoices (only for plans whose job landed).
  const withJob = plans.filter((p) => jobIdByRef.has(p.jobRef));
  const invIdByRef = new Map<string, string>();
  for (let i = 0; i < withJob.length; i += 500) {
    const chunk = withJob.slice(i, i + 500).map((p) => ({ ...p.invoice, job_id: jobIdByRef.get(p.jobRef) }));
    const { data, error } = await supabase.from('invoices').insert(chunk).select('id, ref');
    if (error) {
      console.error('Invoice import (invoices) chunk failed:', error.message);
      continue;
    }
    for (const r of data ?? []) invIdByRef.set(r.ref as string, r.id as string);
  }

  // Phase C — line items + imported payments (only for fully-created invoices).
  const done = withJob.filter((p) => invIdByRef.has(p.invRef));
  const items = done.map((p) => ({ invoice_id: invIdByRef.get(p.invRef), description: p.itemDescription, amount: p.amount, sort_order: 0 }));
  for (let i = 0; i < items.length; i += 500) {
    await supabase.from('invoice_items').insert(items.slice(i, i + 500));
  }
  const payments = done
    .filter((p) => p.paid)
    .map((p) => ({
      account_id: accountId,
      job_id: jobIdByRef.get(p.jobRef),
      invoice_id: invIdByRef.get(p.invRef),
      kind: 'final',
      label: 'Imported (historical)',
      amount: p.amount,
      status: 'paid',
      imported: true,
      ...(p.paidAt ? { requested_at: p.paidAt, paid_at: p.paidAt } : {}),
    }));
  for (let i = 0; i < payments.length; i += 500) {
    await supabase.from('payments').insert(payments.slice(i, i + 500));
  }

  const imported = done.length;
  skipped += plans.length - imported; // any plan whose job/invoice insert failed
  return { imported, duplicates, skipped };
}
