'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { requireOfficeContext } from '@/lib/auth';
import { parseTable, parseMoney, type ImportField } from '@/lib/smart-import';
import { runAnalyze, runApply } from '@/lib/smart-import-run';
import { CLIENT_FIELDS, SERVICE_FIELDS, JOB_FIELDS, INVOICE_FIELDS } from '@/lib/import-fields';
import { classifyGrid, roughRowCount, type ImportEntity } from '@/lib/import-classify';
import { importClients } from '@/lib/client-import';
import { importServices } from '@/lib/services';
import { importJobs } from '@/lib/jobs';
import { importInvoices } from '@/lib/invoice-import';

const MAX_IMPORT_ROWS = 2000;
const MAX_FILES = 20;

// Run order so linked records resolve correctly: clients first (jobs/invoices
// then match them), services, jobs, invoices last.
const ENTITY_ORDER: ImportEntity[] = ['clients', 'services', 'jobs', 'invoices'];
const FIELDS: Record<ImportEntity, ImportField[]> = {
  clients: CLIENT_FIELDS,
  services: SERVICE_FIELDS,
  jobs: JOB_FIELDS,
  invoices: INVOICE_FIELDS,
};
const AI_LABEL: Record<ImportEntity, string> = {
  clients: 'customer',
  services: 'price book service',
  jobs: 'job',
  invoices: 'invoice',
};

export type MigrationFileInput = { name: string; text: string };
export type MigrationClassified = { name: string; entity: ImportEntity; rowCount: number };
export type MigrationRunItem = { name: string; text: string; entity: ImportEntity | 'skip' };
export type MigrationResult = { name: string; entity: ImportEntity; imported: number; duplicates: number; skipped: number; error?: string };

export async function classifyMigrationFiles(files: MigrationFileInput[]): Promise<MigrationClassified[]> {
  await requireOfficeContext('jobs.write');
  return (files ?? []).slice(0, MAX_FILES).map((f) => {
    const grid = parseTable((f.text ?? '').trim());
    return { name: f.name, entity: classifyGrid(grid), rowCount: roughRowCount(grid) };
  });
}

export async function runMigration(items: MigrationRunItem[]): Promise<MigrationResult[]> {
  const { supabase, accountId } = await requireOfficeContext('jobs.write');
  const active = (items ?? [])
    .slice(0, MAX_FILES)
    .filter((i): i is { name: string; text: string; entity: ImportEntity } => i.entity !== 'skip')
    .sort((a, b) => ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity));

  const results: MigrationResult[] = [];
  for (const item of active) {
    try {
      results.push(await commitOne(supabase, accountId, item.entity, item.text, item.name));
    } catch (e) {
      results.push({ name: item.name, entity: item.entity, imported: 0, duplicates: 0, skipped: 0, error: e instanceof Error ? e.message : 'Import failed' });
    }
  }

  revalidatePath('/dashboard/clients');
  revalidatePath('/dashboard/services');
  revalidatePath('/dashboard/jobs');
  return results;
}

function parseOptionalMoney(value: string | null | undefined): number | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

async function commitOne(
  supabase: SupabaseClient,
  accountId: string,
  entity: ImportEntity,
  text: string,
  name: string,
): Promise<MigrationResult> {
  const fields = FIELDS[entity];
  const analysis = await runAnalyze(text, fields, AI_LABEL[entity]);
  if (!analysis.ok) {
    return { name, entity, imported: 0, duplicates: 0, skipped: 0, error: analysis.error === 'empty' ? 'File was empty' : 'No importable rows found' };
  }
  const rows = runApply(text, fields, analysis.sources, analysis.hasHeader).slice(0, MAX_IMPORT_ROWS);

  if (entity === 'clients') {
    const r = await importClients(supabase, accountId, rows.map((x) => ({ name: x.name, phone: x.phone, email: x.email, address: x.address })));
    return { name, entity, ...r };
  }

  if (entity === 'services') {
    const r = await importServices(
      supabase,
      accountId,
      rows.map((x) => ({
        name: x.name,
        description: x.description,
        unitPrice: parseMoney(x.unit_price),
        unitCost: parseOptionalMoney(x.unit_cost),
        unit: x.unit,
      })),
    );
    return { name, entity, ...r };
  }
  if (entity === 'jobs') {
    const r = await importJobs(supabase, accountId, rows.map((x) => ({
      clientName: x.clientName, clientPhone: x.clientPhone, clientEmail: x.clientEmail, address: x.address,
      scope: x.scope, status: x.status, scheduledFor: x.scheduledFor, estimatedHours: x.estimatedHours, quotedAmount: x.quotedAmount,
    })));
    return { name, entity, ...r };
  }
  const r = await importInvoices(supabase, accountId, rows.map((x) => ({
    clientName: x.clientName, clientPhone: x.clientPhone, clientEmail: x.clientEmail, address: x.address,
    description: x.description, date: x.date, total: x.total, status: x.status,
  })));
  if (r.needsSetup) {
    return { name, entity, imported: 0, duplicates: 0, skipped: 0, error: 'Financial import not enabled — run node scripts/deploy-schema.mjs' };
  }
  return { name, entity, imported: r.imported, duplicates: r.duplicates, skipped: r.skipped };
}
