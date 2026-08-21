import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { CONNECT_CHARGE_COLUMNS } from '@/lib/stripe';

export type InvoiceStatus = 'draft' | 'sent' | 'signed' | 'paid' | 'void';

export type Invoice = {
  id: string;
  account_id: string;
  job_id: string;
  ref: string;
  status: InvoiceStatus;
  total: number;
  discount_percent: number;
  tax_rate: number;
  signed_at: string | null;
  signer_name: string | null;
  created_at: string;
};

export type InvoiceTotals = {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The one place invoice math lives: subtotal (sum of items), a discount taken as
// a % of subtotal, then tax as a % of the discounted subtotal. Every reader
// (dashboard, public page, email, PDF) derives its breakdown from this so the
// numbers can never disagree.
export function computeInvoiceTotals(
  items: Array<{ amount: number }>,
  discountPercent: number,
  taxRate: number,
): InvoiceTotals {
  const safeDiscount = Number.isFinite(discountPercent) ? Math.min(100, Math.max(0, discountPercent)) : 0;
  const safeTax = Number.isFinite(taxRate) ? Math.max(0, taxRate) : 0;
  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.amount), 0));
  const discountAmount = round2(subtotal * (safeDiscount / 100));
  const taxable = round2(subtotal - discountAmount);
  const taxAmount = round2(taxable * (safeTax / 100));
  const total = round2(taxable + taxAmount);
  return { subtotal, discountPercent: safeDiscount, discountAmount, taxRate: safeTax, taxAmount, total };
}

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  description: string;
  amount: number;
  sort_order: number;
};

export function formatMoney(n: number): string {
  // Kept in step with the copy in @/lib/jobs — the sign goes outside the currency
  // symbol, so a credit reads "-$120" rather than "$-120".
  const rounded = Math.round(n) || 0;
  return (rounded < 0 ? '-$' : '$') + Math.abs(rounded).toLocaleString();
}

// The next unused INV- number for an account.
//
// It reads the HIGHEST number, not the newest row. Those are not the same
// thing, and assuming they were is what broke invoicing outright: the CRM
// importer back-dates an imported invoice's created_at to the invoice's own
// date, so an account can easily hold INV-2005 dated last year alongside a
// freshly created INV-2001. "Newest row + 1" then mints INV-2002, which already
// exists, and (account_id, ref) is unique — so every attempt to create an
// invoice, or to send a payment link on a job that has none, failed with a
// duplicate-key error and no way for the contractor to get past it.
//
// Refs that aren't INV-<digits> (a ref carried over verbatim from another
// system) are ignored for numbering: they can't collide with the ones we mint.
export function nextInvoiceRef(existingRefs: Array<string | null | undefined>): string {
  let highest = 0;
  for (const ref of existingRefs) {
    const match = /^INV-(\d+)$/.exec(String(ref ?? '').trim());
    if (match) {
      highest = Math.max(highest, parseInt(match[1], 10));
    }
  }
  return `INV-${highest > 0 ? highest + 1 : 2001}`;
}

async function generateInvoiceRef(supabase: SupabaseClient, accountId: string): Promise<string> {
  const { data } = await supabase.from('invoices').select('ref').eq('account_id', accountId);
  return nextInvoiceRef(((data ?? []) as Array<{ ref: string | null }>).map((row) => row.ref));
}

function isDuplicateRef(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

// Insert an invoice under a freshly minted ref, re-deriving the ref if another
// request took it first. Two contractors' tabs — or a payment link and an
// invoice build — can be in flight at once, and the unique index is the only
// thing that actually arbitrates; without the retry the loser sees a 500.
async function insertInvoiceWithRef(
  supabase: SupabaseClient,
  accountId: string,
  row: Record<string, unknown>,
): Promise<Invoice> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ref = await generateInvoiceRef(supabase, accountId);
    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...row, account_id: accountId, ref })
      .select('*')
      .single();

    if (!error && data) {
      return data as Invoice;
    }

    lastError = error;
    if (!isDuplicateRef(error)) break;
  }

  throw lastError ?? new Error('Unable to create invoice');
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
  invoiceId: string,
  expectedJobId?: string,
): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  let invoiceQuery = supabase
    .from('invoices')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', invoiceId);

  // Nested dashboard routes carry both a job id and an invoice id. Account
  // ownership alone is not enough: without this constraint an invoice from a
  // different job in the same account can be opened and then mutated under the
  // URL job's customer/feed context.
  if (expectedJobId !== undefined) {
    invoiceQuery = invoiceQuery.eq('job_id', expectedJobId);
  }

  const { data: invoice, error } = await invoiceQuery.maybeSingle();

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

  return insertInvoiceWithRef(supabase, accountId, {
    job_id: jobId,
    status,
    total: 0,
    // A discount the customer already agreed to, carried onto the bill without
    // anybody having to remember it. This is the whole point of recording it on
    // the job: the offer was made weeks ago on the Plan my day screen, and the
    // person raising the invoice is reading the job and nothing else.
    // Still editable on the invoice — it seeds the field, it doesn't lock it.
    discount_percent: rescheduleDiscountOf(job),
  });
}

/**
 * The reschedule discount on a job, or 0.
 *
 * Read defensively: the column arrives with a migration, and an invoice must
 * still be creatable on a database that hasn't had it yet.
 */
export function rescheduleDiscountOf(job: unknown): number {
  const percent = Number((job as { reschedule_discount_percent?: unknown } | null)?.reschedule_discount_percent);
  return Number.isFinite(percent) && percent > 0 ? percent : 0;
}

// Create a one-line invoice in a single shot — used by the recurring engine to
// mint a proper itemized bill for each auto-spawned visit. Trusted callers only
// (the caller already owns the job): unlike createInvoice this skips the getJob
// ownership round-trip. Default status 'sent' (it's a real bill the client owes);
// the linked payment settling flips it to 'paid' via markInvoicePaidForPayment.
export async function createInvoiceWithSingleItem(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  item: { description: string; amount: number },
  status: InvoiceStatus = 'sent',
): Promise<Invoice> {
  const total = round2(Number(item.amount) || 0);

  const invoice = await insertInvoiceWithRef(supabase, accountId, { job_id: jobId, status, total });

  const { error: itemError } = await supabase
    .from('invoice_items')
    .insert({ invoice_id: invoice.id, description: item.description, amount: total, sort_order: 0 });
  if (itemError) throw itemError;

  return invoice as Invoice;
}

// Reconcile a payment's linked invoice to 'paid'. The single place every
// off-session/recurring settle path routes through (recurring sync-success, the
// dunning retry, and the payment_intent.succeeded webhook) so a charged invoice
// never lags its payment. Idempotent; preserves a real e-signature (only
// backfills signed_at when the client never actually signed); never resurrects a
// voided invoice.
export async function markInvoicePaidForPayment(supabase: SupabaseClient, invoiceId: string): Promise<void> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('status, signed_at, total')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error || !invoice) return;
  if (invoice.status === 'paid' || invoice.status === 'void') return;

  // Only flip to 'paid' once the invoice is actually collected in full — a single
  // deposit on a multi-payment invoice must NOT mark the whole thing paid. Net of
  // any refunds; epsilon guards float rounding on the dollars column.
  const { data: paidRows } = await supabase
    .from('payments')
    .select('amount, refunded_amount')
    .eq('invoice_id', invoiceId)
    .eq('status', 'paid');
  const collected = (paidRows ?? []).reduce(
    (sum, row) => sum + (Number((row as { amount: number }).amount) || 0) - (Number((row as { refunded_amount: number }).refunded_amount) || 0),
    0,
  );
  const total = Number(invoice.total) || 0;
  if (collected + 0.005 < total) return; // still an outstanding balance

  await supabase
    .from('invoices')
    .update({ status: 'paid', ...(invoice.signed_at ? {} : { signed_at: new Date().toISOString() }) })
    .eq('id', invoiceId);
}

async function recalculateInvoiceTotal(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  invoiceId: string,
): Promise<void> {
  const [{ data: items, error }, { data: invoice, error: invoiceError }] = await Promise.all([
    supabase.from('invoice_items').select('amount').eq('invoice_id', invoiceId),
    supabase
      .from('invoices')
      .select('discount_percent, tax_rate')
      .eq('account_id', accountId)
      .eq('job_id', jobId)
      .eq('id', invoiceId)
      .maybeSingle(),
  ]);

  if (error) throw error;
  if (invoiceError) throw invoiceError;
  if (!invoice) throw new Error('Invoice not found for this job.');

  const { total } = computeInvoiceTotals(items ?? [], Number(invoice.discount_percent) || 0, Number(invoice.tax_rate) || 0);

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ total })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', invoiceId);

  if (updateError) {
    throw updateError;
  }
}

// Set the invoice's discount % and tax %, then recompute the stored total.
// Clamps to sane ranges; refuses to touch a locked (signed/paid/void) invoice.
export async function updateInvoiceCharges(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  invoiceId: string,
  input: { discountPercent: number; taxRate: number },
): Promise<void> {
  const existing = await getInvoiceWithItems(supabase, accountId, invoiceId, jobId);
  if (!existing) throw new Error('Invoice not found for this job.');
  if (existing.invoice.status === 'signed' || existing.invoice.status === 'paid' || existing.invoice.status === 'void') {
    throw new Error('This invoice is locked and can no longer be edited.');
  }

  const discountPercent = Number.isFinite(input.discountPercent) ? Math.min(100, Math.max(0, round2(input.discountPercent))) : 0;
  const taxRate = Number.isFinite(input.taxRate) ? Math.min(100, Math.max(0, round2(input.taxRate))) : 0;

  const { error } = await supabase
    .from('invoices')
    .update({ discount_percent: discountPercent, tax_rate: taxRate })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('id', invoiceId);
  if (error) throw error;

  await recalculateInvoiceTotal(supabase, accountId, existing.invoice.job_id, invoiceId);
}

export async function addInvoiceItem(
  supabase: SupabaseClient,
  accountId: string,
  invoiceId: string,
  input: { description: string; amount: number },
  expectedJobId?: string,
): Promise<InvoiceItem> {
  const existing = await getInvoiceWithItems(supabase, accountId, invoiceId, expectedJobId);
  if (!existing) {
    throw new Error(expectedJobId === undefined ? 'Invoice not found for this account.' : 'Invoice not found for this job.');
  }

  // Finiteness first, for the reason payments.ts now carries in full: **NaN <= 0
  // is false**, so an unparseable amount passed this guard, supabase-js turned
  // NaN into null, and it hit `invoice_items.amount`, which is numeric NOT NULL.
  // `refundPayment` and the milestone blockers already tested the safe way; this
  // and createDepositRequest were the two that did not.
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
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

  await recalculateInvoiceTotal(supabase, accountId, existing.invoice.job_id, invoiceId);

  return data as InvoiceItem;
}

export async function deleteInvoiceItem(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  invoiceId: string,
  itemId: string
): Promise<void> {
  const existing = await getInvoiceWithItems(supabase, accountId, invoiceId, jobId);
  if (!existing) {
    throw new Error('Invoice not found for this job.');
  }

  const { error } = await supabase.from('invoice_items').delete().eq('id', itemId).eq('invoice_id', invoiceId);

  if (error) {
    throw error;
  }

  await recalculateInvoiceTotal(supabase, accountId, existing.invoice.job_id, invoiceId);
}

export async function updateInvoiceStatus(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  invoiceId: string,
  status: InvoiceStatus
): Promise<void> {
  const existing = await getInvoiceWithItems(supabase, accountId, invoiceId, jobId);
  if (!existing) {
    throw new Error('Invoice not found for this job.');
  }

  const { error } = await supabase
    .from('invoices')
    .update({ status })
    .eq('account_id', accountId)
    .eq('job_id', existing.invoice.job_id)
    .eq('id', invoiceId);

  if (error) {
    throw error;
  }
}

export async function deleteInvoice(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
  invoiceId: string,
): Promise<void> {
  const existing = await getInvoiceWithItems(supabase, accountId, invoiceId, jobId);
  if (!existing) {
    throw new Error('Invoice not found for this job.');
  }

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('account_id', accountId)
    .eq('job_id', existing.invoice.job_id)
    .eq('id', invoiceId);

  if (error) {
    throw error;
  }
}

export type PublicInvoiceRecord = Invoice & {
  job: { client_name: string; ref: string } | null;
  // Structural match for ConnectChargeable, so the public page can hand this
  // straight to canCreateConnectCharge instead of re-stating the rule.
  account: {
    business_name: string;
    stripe_connect_id?: string | null;
    connect_onboarded?: boolean | null;
    payouts_restricted_at?: string | null;
  } | null;
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
    // The chargeability columns travel with the invoice because the public page
    // needs them: a contractor who cannot receive money must not be offered a
    // Pay button, and this page did not load any of it at all.
    //
    // Interpolated from CONNECT_CHARGE_COLUMNS rather than spelled out, because
    // spelling it out is how this went wrong. The page fetched connect_onboarded
    // alone and asked only that -- two thirds of canCreateConnectCharge -- so an
    // account staff had restricted still read as payable. A select written by
    // hand can silently under-fetch the very columns the predicate needs, and
    // the predicate then fails open on the fields it cannot see.
    .select(`*, job:jobs(client_name, ref), account:accounts(business_name, ${CONNECT_CHARGE_COLUMNS})`)
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

  // Signing the invoice IS accepting the quote, so it goes through the one
  // function that defines what that means. This used to flip the two rows
  // itself and write no feed event — which made the acceptance invisible to
  // Insights, whose conversion rate counts `quote_approved` rows
  // (src/lib/insights.ts). A contractor whose customers sign rather than tap
  // Approve had a conversion rate reading zero.
  //
  // Best-effort: the signature is recorded above and must stand even if the
  // promotion fails. applyQuoteAcceptance is idempotent, so the next acceptance
  // event on this job finishes the job this one started.
  try {
    // Imported here rather than at the top: lib/job-feed imports THIS module
    // (deposit-on-approval builds an invoice), so a static import would close a
    // cycle. Same technique lib/jobs and lib/leads use for lib/geocode.
    const { applyQuoteAcceptance } = await import('@/lib/job-feed');
    await applyQuoteAcceptance(admin, invoice.account_id, invoice.job_id, {
      source: 'invoice_signed',
      note: signerName ? ` Signed by ${signerName}.` : '',
    });
  } catch (error) {
    console.error(`Quote acceptance from invoice signature failed for job ${invoice.job_id}:`, error instanceof Error ? error.message : error);
  }
}
