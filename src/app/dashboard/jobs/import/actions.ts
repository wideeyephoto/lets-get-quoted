'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { runAnalyze, runApply } from '@/lib/smart-import-run';
import { type FieldSources, type SmartImportPreview, type CommitResult } from '@/lib/smart-import';
import { JOB_FIELDS } from '@/lib/import-fields';
import { importJobs } from '@/lib/jobs';

const MAX_IMPORT_ROWS = 2000;

export async function analyzeJobsImport(text: string): Promise<SmartImportPreview> {
  await requireOwnerContext();
  return runAnalyze(text, JOB_FIELDS, 'job');
}

export async function previewJobsImport(text: string, sources: FieldSources, hasHeader: boolean) {
  await requireOwnerContext();
  const rows = runApply(text, JOB_FIELDS, sources, hasHeader);
  return { sampleRows: rows.slice(0, 6), totalRows: rows.length };
}

export async function commitJobsImport(text: string, sources: FieldSources, hasHeader: boolean): Promise<CommitResult> {
  const { supabase, accountId } = await requireOwnerContext();
  const rows = runApply(text, JOB_FIELDS, sources, hasHeader).slice(0, MAX_IMPORT_ROWS);
  if (rows.length === 0) return { imported: 0, duplicates: 0, skipped: 0, error: 'norows' };

  const result = await importJobs(
    supabase,
    accountId,
    rows.map((r) => ({
      clientName: r.clientName,
      clientPhone: r.clientPhone,
      clientEmail: r.clientEmail,
      address: r.address,
      scope: r.scope,
      status: r.status,
      scheduledFor: r.scheduledFor,
      estimatedHours: r.estimatedHours,
      quotedAmount: r.quotedAmount,
    })),
  );
  revalidatePath('/dashboard/jobs');
  return result;
}
