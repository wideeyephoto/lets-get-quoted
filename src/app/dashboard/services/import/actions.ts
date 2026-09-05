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

function parseOptionalMoney(value: string | null | undefined): number | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export async function commitServicesImport(text: string, sources: FieldSources, hasHeader: boolean): Promise<CommitResult> {
  const { supabase, accountId } = await requireOwnerContext();
  const rows = runApply(text, SERVICE_FIELDS, sources, hasHeader).slice(0, MAX_IMPORT_ROWS);
  if (rows.length === 0) return { imported: 0, duplicates: 0, skipped: 0, error: 'norows' };

  const result = await importServices(
    supabase,
    accountId,
    rows.map((r) => ({
      name: r.name,
      description: r.description,
      unitPrice: parseMoney(r.unit_price),
      unitCost: parseOptionalMoney(r.unit_cost),
      unit: r.unit,
    })),
  );
  revalidatePath('/dashboard/services');
  return result;
}

export async function ocrPriceBookAction(dataUrl: string): Promise<{ ok: true; csv: string; count: number } | { ok: false; error: string }> {
  await requireOwnerContext();
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return { ok: false, error: 'Select a valid image file (JPG, PNG, WebP).' };
  }

  const { readPriceBookOcr } = await import('@/lib/price-book-ocr');
  const result = await readPriceBookOcr({ dataUrl });

  if (!result || result.items.length === 0) {
    return {
      ok: false,
      error: "We couldn't detect any service items or prices in that photo. Please try a clearer, high-contrast photo or a CSV file.",
    };
  }

  return {
    ok: true,
    csv: result.rawCsv,
    count: result.items.length,
  };
}

