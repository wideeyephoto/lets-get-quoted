import type { SupabaseClient } from '@supabase/supabase-js';
import { gridToCsv } from '@/lib/import-formats';
import { listJobs, type Job, type JobStatus } from '@/lib/jobs';
import { listServices } from '@/lib/services';
import { fetchAllPages } from '@/lib/pagination';

// Faithful CSV exports of the account's core records — the mirror of the
// "migrate from another CRM" importer. Column headers match the importer's
// field labels (see import-fields.ts) so anything exported here re-imports
// as-is, plus a few reference-only columns (Ref, Notes, Active) the importer
// simply ignores. One entity per file.

const cell = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

// Money out as a bare number (no "$"), so the importer's parseMoney reads it
// straight back. Integers stay clean; fractional cents keep two places.
const money = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

// Timestamps out as YYYY-MM-DD — readable, and exactly what parseImportedDate wants.
const dateOnly = (iso: string | null | undefined): string => (iso ? String(iso).slice(0, 10) : '');

// Status labels that map back through mapImportedJobStatus on re-import.
const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

type ExportClientRow = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type ExportInvoiceRow = {
  ref: string | null;
  job_id: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
};

export async function buildClientsCsv(supabase: SupabaseClient, accountId: string): Promise<string> {
  const data = await fetchAllPages<ExportClientRow>((from, to) =>
    supabase
      .from('clients')
      .select('name, phone, email, address, notes')
      .eq('account_id', accountId)
      .order('name', { ascending: true })
      .range(from, to),
  );

  const grid: string[][] = [['Name', 'Phone', 'Email', 'Address', 'Notes']];
  for (const c of data) {
    grid.push([cell(c.name), cell(c.phone), cell(c.email), cell(c.address), cell(c.notes)]);
  }
  return gridToCsv(grid);
}

export async function buildServicesCsv(supabase: SupabaseClient, accountId: string): Promise<string> {
  const services = await listServices(supabase, accountId);
  const grid: string[][] = [['Name', 'Price', 'Unit', 'Description', 'Active']];
  for (const s of services) {
    grid.push([cell(s.name), money(s.unit_price), cell(s.unit), cell(s.description), s.active ? 'true' : 'false']);
  }
  return gridToCsv(grid);
}

export async function buildJobsCsv(supabase: SupabaseClient, accountId: string): Promise<string> {
  const jobs = await listJobs(supabase, accountId);
  const grid: string[][] = [
    ['Ref', 'Customer', 'Phone', 'Email', 'Address', 'Job / scope', 'Status', 'Date', 'Est. hours', 'Amount'],
  ];
  for (const j of jobs) {
    grid.push([
      cell(j.ref),
      cell(j.client_name),
      cell(j.client_phone),
      cell(j.client_email),
      cell(j.address),
      cell(j.scope),
      JOB_STATUS_LABEL[j.status] ?? cell(j.status),
      dateOnly(j.scheduled_for),
      j.estimated_hours === null || j.estimated_hours === undefined ? '' : String(j.estimated_hours),
      money(j.quoted_amount),
    ]);
  }
  return gridToCsv(grid);
}

export async function buildInvoicesCsv(supabase: SupabaseClient, accountId: string): Promise<string> {
  const [invoices, jobs] = await Promise.all([
    fetchAllPages<ExportInvoiceRow>((from, to) =>
      supabase
        .from('invoices')
        .select('ref, job_id, status, total, created_at')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .range(from, to),
    ),
    listJobs(supabase, accountId),
  ]);
  const jobById = new Map<string, Job>(jobs.map((job) => [job.id, job]));
  const grid: string[][] = [
    ['Ref', 'Customer', 'Phone', 'Email', 'Address', 'Description', 'Date', 'Total', 'Status'],
  ];
  for (const inv of invoices) {
    const job = jobById.get(inv.job_id as string);
    grid.push([
      cell(inv.ref),
      cell(job?.client_name),
      cell(job?.client_phone),
      cell(job?.client_email),
      cell(job?.address),
      cell(job?.scope),
      dateOnly(inv.created_at as string),
      money(inv.total as number),
      cell(inv.status),
    ]);
  }
  return gridToCsv(grid);
}
