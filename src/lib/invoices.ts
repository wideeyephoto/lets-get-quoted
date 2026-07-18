import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getJob } from '@/lib/jobs';

export type InvoiceStatus = 'draft' | 'sent' | 'signed' | 'paid' | 'void';

export type Invoice = {
  id: string;
  account_id: string;
  job_id: string;
  ref: string;
  status: InvoiceStatus;
  total: number;
  signed_at: string | null;
  signer_name: string | null;
  created_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  description: string;
  amount: number;
  sort_order: number;
};

export function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

async function generateInvoiceRef(supabase: SupabaseClient, accountId: string): Promise<string> {
  const { data } = await supabase
    .from('invoices')
    .select('ref')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(1);

  const lastRef = data?.[0]?.ref as string | undefined;
  const lastNumber = lastRef ? parseInt(lastRef.replace(/^INV-/, ''), 10) : NaN;
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 2001;

  return `INV-${nextNumber}`;
}

export async function listInvoices(supabase: SupabaseClient, accountId: string, jobId: string): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as Invoice[];
}

export function selectPrimaryInvoice(invoices: Invoice[]): Invoice | null {
  return [...invoices]
    .filter((invoice) => invoice.status !== 'void')
    .sort((a, b) => {
      const totalDifference = Number(b.total) - Number(a.total);
      if (totalDifference !== 0) return totalDifference;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0] ?? null;
}

export async function getInvoiceWithItems(
  supabase: SupabaseClient,
  accountId: string,
  invoiceId: string
): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', invoiceId)
    .maybeSingle();

  if (error || !invoice) {
    return null;
  }

  const { data: items, error: itemsError } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true });

  if (itemsError) {
    throw itemsError;
  }

  return { invoice: invoice as Invoice, items: (items ?? []) as InvoiceItem[] };
}

export async function createInvoice(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  status: InvoiceStatus
): Promise<Invoice> {
  // Same ownership check used for costs/payments — RLS only checks
  // invoices.account_id, not that job_id truly belongs to this account.
  const job = await getJob(supabase, accountId, jobId);
  if (!job) {
    throw new Error('Job not found for this account.');
  }

  const ref = await generateInvoiceRef(supabase, accountId);

  const { data, error } = await supabase
    .from('invoices')
    .insert({ account_id: accountId, job_id: jobId, ref, status, total: 0 })
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to create invoice');
  }

  return data as Invoice;
}

async function recalculateInvoiceTotal(supabase: SupabaseClient, invoiceId: string): Promise<void> {
  const { data: items, error } = await supabase
    .from('invoice_items')
    .select('amount')
    .eq('invoice_id', invoiceId);

  if (error) {
    throw error;
  }

  const total = (items ?? []).reduce((sum, item) => sum + Number(item.amount), 0);

  const { error: updateError } = await supabase.from('invoices').update({ total }).eq('id', invoiceId);

  if (updateError) {
    throw updateError;
  }
}

export async function addInvoiceItem(
  supabase: SupabaseClient,
  accountId: string,
  invoiceId: string,
  input: { description: string; amount: number }
): Promise<InvoiceItem> {
  const existing = await getInvoiceWithItems(supabase, accountId, invoiceId);
  if (!existing) {
    throw new Error('Invoice not found for this account.');
  }

  if (input.amount <= 0) {
    throw new Error('Line item amount must be greater than 0.');
  }

  const nextSortOrder = existing.items.length;

  const { data, error } = await supabase
    .from('invoice_items')
    .insert({
      invoice_id: invoiceId,
      description: input.description,
      amount: input.amount,
      sort_order: nextSortOrder,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to add line item');
  }

  await recalculateInvoiceTotal(supabase, invoiceId);

  return data as InvoiceItem;
}

export async function deleteInvoiceItem(
  supabase: SupabaseClient,
  accountId: string,
  invoiceId: string,
  itemId: string
): Promise<void> {
  const existing = await getInvoiceWithItems(supabase, accountId, invoiceId);
  if (!existing) {
    throw new Error('Invoice not found for this account.');
  }

  const { error } = await supabase.from('invoice_items').delete().eq('id', itemId).eq('invoice_id', invoiceId);

  if (error) {
    throw error;
  }

  await recalculateInvoiceTotal(supabase, invoiceId);
}

export async function updateInvoiceStatus(
  supabase: SupabaseClient,
  accountId: string,
  invoiceId: string,
  status: InvoiceStatus
): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('account_id', accountId)
    .eq('id', invoiceId);

  if (error) {
    throw error;
  }
}

export async function deleteInvoice(supabase: SupabaseClient, accountId: string, invoiceId: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('account_id', accountId).eq('id', invoiceId);

  if (error) {
    throw error;
  }
}

export type PublicInvoiceRecord = Invoice & {
  job: { client_name: string; ref: string } | null;
  account: { business_name: string } | null;
};

// Public read — the client signing an invoice has no user session, so this
// always uses the admin client and returns only what the public invoice page
// needs to render (mirrors getPublicPayment's pattern).
export async function getPublicInvoice(
  invoiceId: string
): Promise<{ invoice: PublicInvoiceRecord; items: InvoiceItem[] } | null> {
  const admin = createAdminClient();

  const { data: invoice, error } = await admin
    .from('invoices')
    .select('*, job:jobs(client_name, ref), account:accounts(business_name)')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error || !invoice) {
    return null;
  }

  const { data: items, error: itemsError } = await admin
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true });

  if (itemsError) {
    throw itemsError;
  }

  return { invoice: invoice as unknown as PublicInvoiceRecord, items: (items ?? []) as InvoiceItem[] };
}

// Records the client's e-signature. Idempotent by design: once signed, the
// first signer_name/signed_at stick — a client re-opening the link (or
// resubmitting the form) can't overwrite who actually signed it.
export async function signInvoice(invoiceId: string, signerName: string): Promise<void> {
  const admin = createAdminClient();

  const { data: invoice, error: fetchError } = await admin
    .from('invoices')
    .select('account_id, job_id, status, signed_at')
    .eq('id', invoiceId)
    .maybeSingle();

  if (fetchError || !invoice) {
    throw new Error('Invoice not found.');
  }

  if (invoice.status === 'void') {
    throw new Error('This invoice has been voided and can no longer be signed.');
  }

  if (invoice.signed_at) {
    return;
  }

  const { error } = await admin
    .from('invoices')
    .update({ status: 'signed', signed_at: new Date().toISOString(), signer_name: signerName })
    .eq('id', invoiceId);

  if (error) {
    throw error;
  }

  await admin
    .from('leads')
    .update({ status: 'won', updated_at: new Date().toISOString() })
    .eq('account_id', invoice.account_id)
    .eq('converted_job', invoice.job_id)
    .eq('status', 'quoted');

  await admin
    .from('jobs')
    .update({ status: 'in_progress' })
    .eq('account_id', invoice.account_id)
    .eq('id', invoice.job_id)
    .eq('status', 'new_lead');
}
