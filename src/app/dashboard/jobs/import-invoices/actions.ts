'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { runAnalyze, runApply } from '@/lib/smart-import-run';
import { type ImportField, type FieldSources, type SmartImportPreview, type CommitResult } from '@/lib/smart-import';
import { importInvoices } from '@/lib/invoice-import';

const MAX_IMPORT_ROWS = 2000;

const INVOICE_FIELDS: ImportField[] = [
  { key: 'clientName', label: 'Customer', keywords: ['client', 'customer', 'name', 'contact', 'bill to'], hint: "the customer's name", required: true, compose: 'space' },
  { key: 'clientPhone', label: 'Phone', keywords: ['phone', 'mobile', 'cell', 'tel'], hint: "the customer's phone number" },
  { key: 'clientEmail', label: 'Email', keywords: ['email', 'e-mail', 'mail'], hint: "the customer's email" },
  { key: 'address', label: 'Address', keywords: ['address', 'street', 'city', 'location', 'zip', 'postal'], hint: 'the customer / service address', compose: 'comma' },
  { key: 'description', label: 'Description', keywords: ['description', 'item', 'service', 'work', 'scope', 'memo', 'details', 'line'], hint: 'what the invoice is for' },
  { key: 'date', label: 'Date', keywords: ['date', 'invoice date', 'issued', 'created'], hint: 'the invoice date' },
  { key: 'total', label: 'Total', keywords: ['total', 'amount', 'balance', 'grand total', 'invoice total', 'price'], hint: 'the invoice total in US dollars' },
  { key: 'status', label: 'Status', keywords: ['status', 'stage', 'state'], hint: 'the invoice status — paid, sent, draft, or void' },
];

export async function analyzeInvoicesImport(text: string): Promise<SmartImportPreview> {
  await requireOwnerContext();
  return runAnalyze(text, INVOICE_FIELDS, 'invoice');
}

export async function previewInvoicesImport(text: string, sources: FieldSources, hasHeader: boolean) {
  await requireOwnerContext();
  const rows = runApply(text, INVOICE_FIELDS, sources, hasHeader);
  return { sampleRows: rows.slice(0, 6), totalRows: rows.length };
}

export async function commitInvoicesImport(text: string, sources: FieldSources, hasHeader: boolean): Promise<CommitResult> {
  const { supabase, accountId } = await requireOwnerContext();
  const rows = runApply(text, INVOICE_FIELDS, sources, hasHeader).slice(0, MAX_IMPORT_ROWS);
  if (rows.length === 0) return { imported: 0, duplicates: 0, skipped: 0, error: 'norows' };

  const result = await importInvoices(
    supabase,
    accountId,
    rows.map((r) => ({
      clientName: r.clientName,
      clientPhone: r.clientPhone,
      clientEmail: r.clientEmail,
      address: r.address,
      description: r.description,
      date: r.date,
      total: r.total,
      status: r.status,
    })),
  );

  // Safety net — the page gates on this, so it should not normally be reached.
  if (result.needsSetup) throw new Error('Financial import needs a one-time database update. Run: node scripts/deploy-schema.mjs');

  revalidatePath('/dashboard/jobs');
  return { imported: result.imported, duplicates: result.duplicates, skipped: result.skipped };
}
