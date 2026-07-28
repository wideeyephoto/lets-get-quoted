'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { runAnalyze, runApply } from '@/lib/smart-import-run';
import { parseMoney, type ImportField, type FieldSources, type SmartImportPreview, type CommitResult } from '@/lib/smart-import';
import { importServices } from '@/lib/services';

const MAX_IMPORT_ROWS = 2000;

// Order matters for the rule-based match: unit_price is listed before unit so a
// "unit price" header maps to price, not unit.
const SERVICE_FIELDS: ImportField[] = [
  { key: 'name', label: 'Name', keywords: ['name', 'service', 'item', 'product', 'title'], hint: 'the service or product name', required: true },
  { key: 'unit_price', label: 'Price', keywords: ['unit price', 'price', 'rate', 'amount', 'cost', 'fee', 'charge'], hint: 'the price per unit in US dollars' },
  { key: 'unit', label: 'Unit', keywords: ['unit', 'uom', 'per', 'measure'], hint: 'the unit sold in — one of each, hour, sqft, visit, job' },
  { key: 'description', label: 'Description', keywords: ['description', 'desc', 'details', 'notes'], hint: 'a longer description of the service' },
];

export async function analyzeServicesImport(text: string): Promise<SmartImportPreview> {
  await requireOwnerContext();
  return runAnalyze(text, SERVICE_FIELDS, 'price book service');
}

export async function previewServicesImport(text: string, sources: FieldSources, hasHeader: boolean) {
  await requireOwnerContext();
  const rows = runApply(text, SERVICE_FIELDS, sources, hasHeader);
  return { sampleRows: rows.slice(0, 6), totalRows: rows.length };
}

export async function commitServicesImport(text: string, sources: FieldSources, hasHeader: boolean): Promise<CommitResult> {
  const { supabase, accountId } = await requireOwnerContext();
  const rows = runApply(text, SERVICE_FIELDS, sources, hasHeader).slice(0, MAX_IMPORT_ROWS);
  if (rows.length === 0) return { imported: 0, duplicates: 0, skipped: 0, error: 'norows' };

  const result = await importServices(
    supabase,
    accountId,
    rows.map((r) => ({ name: r.name, description: r.description, unitPrice: parseMoney(r.unit_price), unit: r.unit })),
  );
  revalidatePath('/dashboard/services');
  return result;
}
