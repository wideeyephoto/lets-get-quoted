'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { runAnalyze, runApply } from '@/lib/smart-import-run';
import { type ImportField, type FieldSources, type SmartImportPreview, type CommitResult } from '@/lib/smart-import';
import { importJobs } from '@/lib/jobs';

const MAX_IMPORT_ROWS = 2000;

// Declaration order = rule-based match priority. Address is before scope so a
// "location" column maps to the address, not the job description.
const JOB_FIELDS: ImportField[] = [
  { key: 'clientName', label: 'Customer', keywords: ['client', 'customer', 'name', 'contact', 'bill to'], hint: "the customer's name", required: true, compose: 'space' },
  { key: 'clientPhone', label: 'Phone', keywords: ['phone', 'mobile', 'cell', 'tel'], hint: "the customer's phone number" },
  { key: 'clientEmail', label: 'Email', keywords: ['email', 'e-mail', 'mail'], hint: "the customer's email" },
  { key: 'address', label: 'Address', keywords: ['address', 'street', 'city', 'location', 'addr', 'zip', 'postal'], hint: 'the job / service address', compose: 'comma' },
  { key: 'scope', label: 'Job / scope', keywords: ['scope', 'job', 'service', 'work', 'project', 'description', 'summary', 'details'], hint: 'what the job is (the scope of work)' },
  { key: 'status', label: 'Status', keywords: ['status', 'stage'], hint: 'the job status (new, in progress, complete, archived)' },
  { key: 'scheduledFor', label: 'Date', keywords: ['date', 'scheduled', 'appointment', 'service date', 'start'], hint: 'the scheduled date' },
  { key: 'estimatedHours', label: 'Est. hours', keywords: ['hours', 'hrs', 'duration', 'estimated hours'], hint: 'estimated labor hours' },
  { key: 'quotedAmount', label: 'Amount', keywords: ['amount', 'total', 'price', 'quote', 'value', 'revenue', 'invoice total', 'job total'], hint: 'the quoted / job dollar amount' },
];

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
