import type { SupabaseClient } from '@supabase/supabase-js';
import { createPortalToken, hashPortalToken, portalExpiry, summarisePortal, type PortalJob, type PortalView } from '@/lib/client-portal';
import { listClientWarranties } from '@/lib/warranties-data';
import { toClientWarranties, type ClientWarranty } from '@/lib/warranties';
import { CONTRACTOR_BRAND_COLUMNS, shapeContractorBrand, type ContractorBrand } from '@/lib/contractor-brand';
import { invoicePayState, paymentsForInvoice, type InvoicePayment } from '@/lib/invoice-pay';

/**
 * Mint a portal link for whoever owns this email, if anybody does.
 *
 * Returns the token ONLY when there's a match — but the caller must send the
 * same acknowledgement either way. A page that says "no account found" tells a
 * stranger which of their neighbours used this contractor.
 *
 * Any previously issued link for the same client is revoked. A homeowner who
 * asks for a new link has usually lost the old one, and leaving a forgotten link
 * live in an old inbox is the failure mode nobody notices.
 */
export async function issuePortalLink(
  admin: SupabaseClient,
  accountId: string,
  email: string,
): Promise<{ token: string; clientId: string } | null> {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;

  const { data: client } = await admin
    .from('clients')
    .select('id, email')
    .eq('account_id', accountId)
    .ilike('email', needle)
    .maybeSingle();
  if (!client) return null;

  await admin
    .from('client_portal_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('client_id', client.id)
    .is('revoked_at', null);

  const token = createPortalToken();
  const { error } = await admin.from('client_portal_access').insert({
    account_id: accountId,
    client_id: client.id as string,
    token_hash: hashPortalToken(token),
    sent_to: needle,
    expires_at: portalExpiry(),
  });
  if (error) {
    console.error('Portal link issue failed:', error.message);
    return null;
  }
  return { token, clientId: client.id as string };
}

/** One bill, as a customer needs to read it: what it was for, and what is left. */
export type PortalInvoice = {
  id: string;
  ref: string;
  status: string;
  statusLabel: string;
  jobScope: string | null;
  total: number;
  paid: number;
  due: number;
  /** True only when there is something to pay AND the page can take it. */
  payable: boolean;
  processing: boolean;
  createdAt: string;
};

/** A receipt. Only settled money — a failed attempt is not a payment history. */
export type PortalPayment = {
  id: string;
  label: string;
  amount: number;
  paidAt: string | null;
  refunded: boolean;
};

export type PortalPayload = PortalView & {
  warranties: ClientWarranty[];
  brand: ContractorBrand;
  invoices: PortalInvoice[];
  payments: PortalPayment[];
  /** Across every open invoice — the one number a customer opens this to find. */
  outstanding: number;
};

/**
 * Everything a homeowner sees about their own history with one contractor.
 *
 * Scoped to a single client of a single account throughout. Every query filters
 * on both, so a token can only ever open the door it was cut for.
 */
export async function loadPortal(admin: SupabaseClient, accountId: string, clientId: string): Promise<PortalPayload | null> {
  const [{ data: client }, { data: account }, { data: site }] = await Promise.all([
    admin.from('clients').select('name').eq('account_id', accountId).eq('id', clientId).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select(CONTRACTOR_BRAND_COLUMNS).eq('account_id', accountId).maybeSingle(),
  ]);
  if (!client) return null;
  const brand = shapeContractorBrand(account, site);

  // NO `completed_at` in this select. There is no such column on `jobs` — asking
  // for it made PostgREST fail the WHOLE query with 42703, and the error was
  // being destructured away, so `jobRows` came back null and every customer who
  // ever opened their portal was told "Nothing here yet". The one thing the page
  // exists to show, missing, silently, for everybody.
  //
  // Errors are read here now rather than dropped, for exactly that reason.
  const { data: jobRows, error: jobError } = await admin
    .from('jobs')
    .select('id, ref, scope, status, scheduled_for, address, quoted_amount')
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .neq('status', 'archived')
    .order('scheduled_for', { ascending: false, nullsFirst: false })
    .limit(100);
  if (jobError) console.error('Portal job history failed:', jobError.message);

  // When the work was finished. Completion is a status, not a timestamp, so the
  // moment lives on the feed event the "job complete" action writes. Read rather
  // than guessed: `scheduled_for` is when it was BOOKED, and printing that as
  // "finished on" would put a confidently wrong date in front of a customer.
  const completedAt = new Map<string, string>();
  if ((jobRows ?? []).length > 0) {
    const { data: doneRows } = await admin
      .from('job_feed')
      .select('job_id, created_at')
      .eq('account_id', accountId)
      .eq('kind', 'job_completed')
      .in('job_id', (jobRows ?? []).map((row) => row.id as string))
      .order('created_at', { ascending: false });
    // Descending, first write wins: a job completed, reopened and completed
    // again shows the LATEST completion, which is the one that still stands.
    for (const row of doneRows ?? []) {
      const jobId = row.job_id as string;
      if (!completedAt.has(jobId)) completedAt.set(jobId, row.created_at as string);
    }
  }

  const jobs: PortalJob[] = (jobRows ?? []).map((row) => ({
    id: row.id as string,
    ref: (row.ref as string | null) ?? null,
    scope: (row.scope as string | null) ?? null,
    status: (row.status as string) ?? 'new_lead',
    scheduledFor: (row.scheduled_for as string | null) ?? null,
    completedAt: completedAt.get(row.id as string) ?? null,
    address: (row.address as string | null) ?? null,
    quotedAmount: Number(row.quoted_amount) || 0,
  }));

  const warranties = toClientWarranties(await listClientWarranties(admin, accountId, clientId));

  // Bills and receipts. Scoped to this customer's own jobs — the job ids are the
  // ones already loaded above, so a token cannot reach an invoice belonging to
  // anybody else even if a job_id were somehow wrong.
  const jobIds = jobs.map((job) => job.id);
  const [{ data: invoiceRows }, { data: paymentRows }] = jobIds.length
    ? await Promise.all([
        admin
          .from('invoices')
          .select('id, ref, status, total, discount_percent, tax_rate, job_id, created_at')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          // A draft is the contractor's working copy, not a bill anybody has been
          // sent. It must never appear here.
          .in('status', ['sent', 'signed', 'paid', 'void'])
          .order('created_at', { ascending: false }),
        admin
          .from('payments')
          .select('id, label, amount, status, invoice_id, refunded_amount, paid_at, kind')
          .eq('account_id', accountId)
          .in('job_id', jobIds)
          .order('paid_at', { ascending: false, nullsFirst: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const allPayments = (paymentRows ?? []) as (InvoicePayment & {
    label: string | null;
    paid_at: string | null;
    kind: string;
  })[];
  const scopeByJob = new Map(jobs.map((job) => [job.id, job.scope] as const));

  const invoices: PortalInvoice[] = (invoiceRows ?? []).map((row) => {
    const total = Number(row.total) || 0;
    const state = invoicePayState({ status: row.status as string }, total, paymentsForInvoice(allPayments, row.id as string));
    return {
      id: row.id as string,
      ref: (row.ref as string) ?? '',
      status: row.status as string,
      statusLabel: INVOICE_STATUS_LABEL[row.status as string] ?? (row.status as string),
      jobScope: scopeByJob.get(row.job_id as string) ?? null,
      total,
      paid: state.paid,
      due: state.due,
      payable: state.state === 'payable',
      processing: state.state === 'processing',
      createdAt: row.created_at as string,
    };
  });

  const payments: PortalPayment[] = allPayments
    .filter((payment) => payment.status === 'paid')
    .map((payment) => ({
      id: payment.id,
      label: payment.label?.trim() || 'Payment',
      amount: Number(payment.amount) || 0,
      paidAt: payment.paid_at,
      refunded: (Number(payment.refunded_amount) || 0) > 0,
    }));

  return {
    ...summarisePortal({
      businessName: brand.businessName,
      clientName: (client.name as string) ?? 'there',
      jobs,
    }),
    warranties,
    brand,
    invoices,
    payments,
    outstanding: Math.round(invoices.reduce((sum, invoice) => sum + invoice.due, 0) * 100) / 100,
  };
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  sent: 'Awaiting payment',
  signed: 'Signed',
  paid: 'Paid',
  void: 'Cancelled',
};

/** Owner-facing: links this client currently holds, so they can be revoked. */
export async function listPortalLinks(supabase: SupabaseClient, accountId: string, clientId: string) {
  const { data, error } = await supabase
    .from('client_portal_access')
    .select('id, sent_to, expires_at, revoked_at, last_used_at, created_at')
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return error ? [] : data ?? [];
}

export async function revokePortalLinks(supabase: SupabaseClient, accountId: string, clientId: string): Promise<void> {
  await supabase
    .from('client_portal_access')
    .update({ revoked_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('client_id', clientId)
    .is('revoked_at', null);
}
