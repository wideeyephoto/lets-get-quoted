'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { runAnalyze, runApply } from '@/lib/smart-import-run';
import { parseMoney, type FieldSources, type SmartImportPreview, type CommitResult } from '@/lib/smart-import';
import { SERVICE_FIELDS } from '@/lib/import-fields';
import { importServices } from '@/lib/services';

const MAX_IMPORT_ROWS = 2000;

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
