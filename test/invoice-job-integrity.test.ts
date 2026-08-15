import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addInvoiceItem,
  deleteInvoice,
  deleteInvoiceItem,
  getInvoiceWithItems,
  updateInvoiceCharges,
  updateInvoiceStatus,
  type Invoice,
} from '@/lib/invoices';

type Row = Record<string, unknown>;

function fakeInvoiceClient() {
  const invoice: Invoice = {
    id: 'invoice-b',
    account_id: 'account-a',
    job_id: 'job-b',
    ref: 'INV-2001',
    status: 'draft',
    total: 125,
    discount_percent: 0,
    tax_rate: 0,
    signed_at: null,
    signer_name: null,
    created_at: '2026-08-15T12:00:00.000Z',
  };
  const rows: Record<string, Row[]> = {
    invoices: [invoice as unknown as Row],
    invoice_items: [
      {
        id: 'item-b',
        invoice_id: invoice.id,
        description: 'Repair',
        amount: 125,
        sort_order: 0,
      },
    ],
  };
  const writes: Array<{ table: string; kind: string }> = [];
  const terminalFilters: Array<{ table: string; filters: Array<[string, unknown]> }> = [];

  const client = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const matching = () =>
        (rows[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));

      const query = {
        select() {
          return query;
        },
        insert() {
          writes.push({ table, kind: 'insert' });
          return query;
        },
        update() {
          writes.push({ table, kind: 'update' });
          return query;
        },
        delete() {
          writes.push({ table, kind: 'delete' });
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        async maybeSingle() {
          terminalFilters.push({ table, filters: [...filters] });
          return { data: matching()[0] ?? null, error: null };
        },
        async order() {
          terminalFilters.push({ table, filters: [...filters] });
          return { data: matching(), error: null };
        },
      };

      return query;
    },
  } as unknown as SupabaseClient;

  return { client, writes, terminalFilters };
}

describe('nested invoice/job integrity', () => {
  it('loads an invoice only when account, invoice, and expected job all match', async () => {
    const { client, terminalFilters } = fakeInvoiceClient();

    await expect(getInvoiceWithItems(client, 'account-a', 'invoice-b', 'job-a')).resolves.toBeNull();
    const invoiceLookup = terminalFilters[0];
    expect(invoiceLookup.filters).toContainEqual(['account_id', 'account-a']);
    expect(invoiceLookup.filters).toContainEqual(['id', 'invoice-b']);
    expect(invoiceLookup.filters).toContainEqual(['job_id', 'job-a']);

    const result = await getInvoiceWithItems(client, 'account-a', 'invoice-b', 'job-b');
    expect(result?.invoice.job_id).toBe('job-b');
    expect(result?.items).toHaveLength(1);
  });

  it('rejects every nested mutation before writing when the URL job is wrong', async () => {
    const { client, writes } = fakeInvoiceClient();

    await expect(
      addInvoiceItem(client, 'account-a', 'invoice-b', { description: 'Wrong job', amount: 10 }, 'job-a'),
    ).rejects.toThrow('Invoice not found for this job.');
    await expect(updateInvoiceCharges(client, 'account-a', 'job-a', 'invoice-b', { discountPercent: 0, taxRate: 0 }))
      .rejects.toThrow('Invoice not found for this job.');
    await expect(deleteInvoiceItem(client, 'account-a', 'job-a', 'invoice-b', 'item-b'))
      .rejects.toThrow('Invoice not found for this job.');
    await expect(updateInvoiceStatus(client, 'account-a', 'job-a', 'invoice-b', 'sent'))
      .rejects.toThrow('Invoice not found for this job.');
    await expect(deleteInvoice(client, 'account-a', 'job-a', 'invoice-b'))
      .rejects.toThrow('Invoice not found for this job.');

    expect(writes).toEqual([]);
  });

  it('binds the nested page and action side effects to the verified invoice job', () => {
    const root = process.cwd();
    const page = readFileSync(
      join(root, 'src', 'app', 'dashboard', 'jobs', '[id]', 'invoices', '[invoiceId]', 'page.tsx'),
      'utf8',
    );
    const actions = readFileSync(join(root, 'src', 'app', 'dashboard', 'jobs', 'invoices-actions.ts'), 'utf8');

    expect(page).toContain('getInvoiceWithItems(supabase, accountId, params.invoiceId, params.id)');
    expect(page).toContain('const jobId = invoice.job_id;');
    expect(page).not.toContain('bind(null, params.id, invoice.id');

    const statusAction = actions.slice(
      actions.indexOf('export async function updateInvoiceStatusAction'),
      actions.indexOf('export async function deleteInvoiceAction'),
    );
    expect(statusAction.indexOf('getInvoiceWithItems(supabase, accountId, invoiceId, jobId)'))
      .toBeLessThan(statusAction.indexOf("if (status === 'sent')"));
    expect(statusAction).toContain('const verifiedJobId = invoice.job_id;');
    expect(statusAction).toContain('getJob(supabase, accountId, verifiedJobId)');
    expect(statusAction).toContain('createJobFeedEvent(supabase, accountId, verifiedJobId');
    expect(statusAction).not.toContain('createJobFeedEvent(supabase, accountId, jobId');
  });
});
