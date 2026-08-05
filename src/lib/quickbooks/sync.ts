import { createAdminClient } from '@/lib/auth';
import { activeConnection, type ActiveConnection } from './connection';
import {
  QuickBooksApiError,
  qboAutomatedSalesTax,
  qboCreate,
  qboFindCustomerByName,
  qboResolveServiceItem,
} from './api';
import {
  buildCustomerPayload,
  buildInvoicePayload,
  buildPaymentPayload,
  invoiceHoldReason,
  invoiceIsSendable,
  paymentHoldReason,
  summarize,
  type SyncClient,
  type SyncInvoice,
  type SyncPayment,
} from './map';

/**
 * Pushing invoices and payments into a contractor's QuickBooks.
 *
 * Two rules the rest of this file exists to keep:
 *
 *   1. Nothing is created twice. A duplicate invoice in real books is not
 *      something we can fix from here. Every create carries the row's uuid as
 *      Intuit's `requestid`, so even a sweep that dies between their write and
 *      ours replays into the SAME object rather than a second one.
 *
 *   2. Anything we can't send exactly is not sent at all, and says why. An
 *      invoice that lands with the right customer and the wrong total is worse
 *      than one that never lands, because nobody goes looking for it.
 *
 * One-way. We never read their books back over ours.
 */

export type SyncSummary = {
  ok: boolean;
  invoices: number;
  payments: number;
  held: number;
  failed: number;
  message: string;
};

const NOT_CONNECTED: SyncSummary = {
  ok: false, invoices: 0, payments: 0, held: 0, failed: 0,
  message: 'QuickBooks isn’t linked, or the link needs renewing.',
};

/** How many rows one sweep will attempt, so a first run on a big book can't run for ever. */
const BATCH = 100;

type ConnectionCache = {
  connection: ActiveConnection;
  itemId: string;
  automatedSalesTax: boolean;
  /** Invoices dated before this are left alone. Null means send everything. */
  syncFrom: string | null;
};

/**
 * The company-level facts a sweep needs, fetched once and cached on the row.
 *
 * The sales-tax preference is the one that matters. A company with Automated
 * Sales Tax computes tax itself and ignores what we send, so an invoice carrying
 * tax would post with a different total than the one the customer was given —
 * silently. We read it once and then refuse those invoices by name.
 */
async function prepare(accountId: string): Promise<ConnectionCache | null> {
  const connection = await activeConnection(accountId);
  if (!connection) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('quickbooks_connections')
    .select('qbo_item_id, automated_sales_tax, sync_from')
    .eq('account_id', accountId)
    .maybeSingle();

  const row = (data ?? {}) as {
    qbo_item_id?: string | null;
    automated_sales_tax?: boolean | null;
    sync_from?: string | null;
  };
  let itemId = row.qbo_item_id ?? null;
  let ast = row.automated_sales_tax ?? null;

  if (itemId === null || ast === null) {
    if (itemId === null) itemId = await qboResolveServiceItem(connection);
    if (ast === null) ast = await qboAutomatedSalesTax(connection);
    await admin
      .from('quickbooks_connections')
      .update({ qbo_item_id: itemId, automated_sales_tax: ast, updated_at: new Date().toISOString() })
      .eq('account_id', accountId);
  }

  return { connection, itemId, automatedSalesTax: Boolean(ast), syncFrom: row.sync_from ?? null };
}

/**
 * The QuickBooks customer for one of our clients, created if they're new.
 *
 * Matched on DisplayName, which QuickBooks forces to be unique per company. The
 * duplicate-name branch is not an edge case: it is what happens the first time
 * we meet a customer the contractor already typed in themselves, which is most
 * of them.
 */
async function resolveCustomer(
  cache: ConnectionCache,
  accountId: string,
  client: SyncClient,
): Promise<string> {
  if (client.qboCustomerId) return client.qboCustomerId;

  const admin = createAdminClient();
  const remember = async (id: string) => {
    // Only a real client row has somewhere to keep this. A job-derived customer
    // carries a JOB id, and writing that into clients would match nothing.
    if (client.isClientRow) {
      await admin.from('clients').update({ qbo_customer_id: id }).eq('id', client.id).eq('account_id', accountId);
    }
    return id;
  };

  const found = await qboFindCustomerByName(cache.connection, client.name);
  if (found) return remember(found);

  try {
    const created = await qboCreate(cache.connection, 'Customer', buildCustomerPayload(client), client.id);
    return remember(String(created.Id));
  } catch (error) {
    // 6240 is "Duplicate Name Exists". Reachable despite the lookup above when
    // the name differs only by case or trailing space, which QuickBooks treats
    // as the same name and our query does not.
    if (error instanceof QuickBooksApiError && error.code === '6240') {
      const again = await qboFindCustomerByName(cache.connection, client.name);
      if (again) return remember(again);
    }
    throw error;
  }
}

type InvoiceRow = {
  id: string; ref: string; total: number; status: string; created_at: string;
  discount_percent: number; tax_rate: number; job_id: string;
};

export async function syncAccount(accountId: string): Promise<SyncSummary> {
  let cache: ConnectionCache | null;
  try {
    cache = await prepare(accountId);
  } catch (error) {
    return {
      ...NOT_CONNECTED,
      message: error instanceof Error ? error.message : 'Could not read this QuickBooks company.',
    };
  }
  if (!cache) return NOT_CONNECTED;

  const admin = createAdminClient();
  const counts = { invoices: 0, payments: 0, held: 0, failed: 0 };

  // ── Invoices ──────────────────────────────────────────────────────────────
  // The cutoff is the whole reason linking QuickBooks doesn't dump a
  // contractor's history into books they've been keeping by hand. Null means
  // they asked for everything.
  let invoiceQuery = admin
    .from('invoices')
    .select('id, ref, total, status, created_at, discount_percent, tax_rate, job_id')
    .eq('account_id', accountId)
    .is('qbo_id', null)
    .in('status', ['sent', 'signed', 'paid']);
  if (cache.syncFrom) invoiceQuery = invoiceQuery.gte('created_at', cache.syncFrom);
  const { data: invoiceRows } = await invoiceQuery.order('created_at').limit(BATCH);

  const invoices = (invoiceRows ?? []) as InvoiceRow[];
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const jobIds = [...new Set(invoices.map((invoice) => invoice.job_id))];

  const [{ data: itemRows }, { data: jobRows }] = await Promise.all([
    invoiceIds.length
      ? admin.from('invoice_items').select('invoice_id, description, amount, sort_order').in('invoice_id', invoiceIds)
      : Promise.resolve({ data: [] as { invoice_id: string; description: string; amount: number; sort_order: number }[] }),
    jobIds.length
      ? admin.from('jobs').select('id, ref, scope, client_id, client_name, client_email, client_phone, address').in('id', jobIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const linesByInvoice = new Map<string, { description: string; amount: number; sort_order: number }[]>();
  for (const line of (itemRows ?? []) as { invoice_id: string; description: string; amount: number; sort_order: number }[]) {
    const bucket = linesByInvoice.get(line.invoice_id) ?? [];
    bucket.push(line);
    linesByInvoice.set(line.invoice_id, bucket);
  }

  const jobs = new Map<string, Record<string, unknown>>();
  for (const job of (jobRows ?? []) as Record<string, unknown>[]) jobs.set(String(job.id), job);

  const clientIds = [...new Set([...jobs.values()].map((job) => job.client_id).filter(Boolean))] as string[];
  const { data: clientRows } = clientIds.length
    ? await admin.from('clients').select('id, name, email, phone, address, qbo_customer_id').in('id', clientIds)
    : { data: [] as Record<string, unknown>[] };
  const clients = new Map<string, Record<string, unknown>>();
  for (const client of (clientRows ?? []) as Record<string, unknown>[]) clients.set(String(client.id), client);

  /** The client record, falling back to what the JOB knows — an invoice can predate a client row. */
  function clientFor(job: Record<string, unknown> | undefined): SyncClient | null {
    if (!job) return null;
    const linked = job.client_id ? clients.get(String(job.client_id)) : undefined;
    if (linked) {
      return {
        id: String(linked.id),
        name: String(linked.name ?? '').trim(),
        email: (linked.email as string) ?? null,
        phone: (linked.phone as string) ?? null,
        address: (linked.address as string) ?? null,
        qboCustomerId: (linked.qbo_customer_id as string) ?? null,
        isClientRow: true,
      };
    }
    const name = String(job.client_name ?? '').trim();
    if (!name) return null;
    // No client row to cache the QuickBooks id on, so this one is looked up by
    // name every sweep. Correct, just not free.
    return {
      id: String(job.id),
      name,
      email: (job.client_email as string) ?? null,
      phone: (job.client_phone as string) ?? null,
      address: (job.address as string) ?? null,
      qboCustomerId: null,
      isClientRow: false,
    };
  }

  const syncedInvoiceQboId = new Map<string, string>();

  for (const row of invoices) {
    const lines = (linesByInvoice.get(row.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const job = jobs.get(row.job_id);
    const invoice: SyncInvoice = {
      id: row.id,
      ref: row.ref,
      total: Number(row.total) || 0,
      status: row.status,
      createdAt: row.created_at,
      discountPercent: Number(row.discount_percent) || 0,
      taxRate: Number(row.tax_rate) || 0,
      items: lines.map((line) => ({ description: line.description, amount: Number(line.amount) || 0 })),
      // The job's scope is what the work WAS, which is exactly what belongs on
      // a one-line invoice. Its ref is the fallback so the two systems can
      // still be matched up by eye.
      fallbackDescription: (job?.scope as string) || (job?.ref ? `Job ${job.ref}` : null),
    };
    if (!invoiceIsSendable(invoice)) continue;

    const client = clientFor(job);
    const hold = invoiceHoldReason(invoice, client, cache.automatedSalesTax);
    if (hold) {
      counts.held += 1;
      await admin.from('invoices').update({ qbo_error: hold }).eq('id', row.id);
      continue;
    }

    try {
      const customerId = await resolveCustomer(cache, accountId, client as SyncClient);
      const created = await qboCreate(
        cache.connection,
        'Invoice',
        buildInvoicePayload(invoice, customerId, cache.itemId, cache.automatedSalesTax),
        // Intuit's idempotency key. If our own write below fails, the next
        // sweep replays this exact request and gets the same invoice back
        // rather than creating a second one.
        row.id,
      );
      const qboId = String(created.Id);
      await admin
        .from('invoices')
        .update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString(), qbo_error: null })
        .eq('id', row.id);
      syncedInvoiceQboId.set(row.id, qboId);
      counts.invoices += 1;
    } catch (error) {
      counts.failed += 1;
      await admin
        .from('invoices')
        .update({ qbo_error: (error instanceof Error ? error.message : 'Failed to send.').slice(0, 300) })
        .eq('id', row.id);
    }
  }

  // ── Payments ──────────────────────────────────────────────────────────────
  // Only ever attached to an invoice that is already in QuickBooks. A payment
  // with nowhere to land becomes an unapplied credit somebody has to clear by
  // hand, which is a worse outcome than it staying here for one more day.
  const { data: paymentRows } = await admin
    .from('payments')
    .select('id, amount, refunded_amount, status, paid_at, requested_at, invoice_id')
    .eq('account_id', accountId)
    .is('qbo_id', null)
    .eq('status', 'paid')
    .not('invoice_id', 'is', null)
    .order('paid_at')
    .limit(BATCH);

  const payments = (paymentRows ?? []) as {
    id: string; amount: number; refunded_amount: number; status: string;
    paid_at: string | null; requested_at: string; invoice_id: string;
  }[];

  // Invoices synced on an EARLIER run won't be in syncedInvoiceQboId, so their
  // ids are read back rather than assumed absent.
  const wantedInvoiceIds = [...new Set(payments.map((payment) => payment.invoice_id))]
    .filter((id) => !syncedInvoiceQboId.has(id));
  if (wantedInvoiceIds.length) {
    const { data: known } = await admin
      .from('invoices')
      .select('id, qbo_id')
      .eq('account_id', accountId)
      .in('id', wantedInvoiceIds);
    for (const row of (known ?? []) as { id: string; qbo_id: string | null }[]) {
      if (row.qbo_id) syncedInvoiceQboId.set(row.id, row.qbo_id);
    }
  }

  const jobByInvoice = new Map<string, string>();
  for (const invoice of invoices) jobByInvoice.set(invoice.id, invoice.job_id);

  for (const row of payments) {
    const payment: SyncPayment = {
      id: row.id,
      amount: Number(row.amount) || 0,
      refundedAmount: Number(row.refunded_amount) || 0,
      status: row.status,
      paidAt: row.paid_at,
      requestedAt: row.requested_at,
      invoiceId: row.invoice_id,
    };
    const invoiceQboId = syncedInvoiceQboId.get(row.invoice_id) ?? null;
    const hold = paymentHoldReason(payment, invoiceQboId);
    if (hold) {
      counts.held += 1;
      await admin.from('payments').update({ qbo_error: hold }).eq('id', row.id);
      continue;
    }

    try {
      // The customer comes from the invoice's job, so a payment always lands on
      // the same customer as the invoice it pays.
      let jobId = jobByInvoice.get(row.invoice_id);
      if (!jobId) {
        const { data } = await admin.from('invoices').select('job_id').eq('id', row.invoice_id).maybeSingle();
        jobId = (data as { job_id?: string } | null)?.job_id;
      }
      let job = jobId ? jobs.get(jobId) : undefined;
      if (!job && jobId) {
        const { data } = await admin
          .from('jobs')
          .select('id, ref, scope, client_id, client_name, client_email, client_phone, address')
          .eq('id', jobId)
          .maybeSingle();
        if (data) {
          job = data as Record<string, unknown>;
          jobs.set(jobId, job);
          if (job.client_id && !clients.has(String(job.client_id))) {
            const { data: c } = await admin
              .from('clients')
              .select('id, name, email, phone, address, qbo_customer_id')
              .eq('id', String(job.client_id))
              .maybeSingle();
            if (c) clients.set(String((c as Record<string, unknown>).id), c as Record<string, unknown>);
          }
        }
      }
      const client = clientFor(job);
      if (!client) {
        counts.held += 1;
        await admin.from('payments').update({ qbo_error: 'No customer name to file this payment under.' }).eq('id', row.id);
        continue;
      }

      const customerId = await resolveCustomer(cache, accountId, client);
      const created = await qboCreate(
        cache.connection,
        'Payment',
        buildPaymentPayload(payment, customerId, invoiceQboId as string),
        row.id,
      );
      await admin
        .from('payments')
        .update({ qbo_id: String(created.Id), qbo_synced_at: new Date().toISOString(), qbo_error: null })
        .eq('id', row.id);
      counts.payments += 1;
    } catch (error) {
      counts.failed += 1;
      await admin
        .from('payments')
        .update({ qbo_error: (error instanceof Error ? error.message : 'Failed to send.').slice(0, 300) })
        .eq('id', row.id);
    }
  }

  const message = summarize(counts);
  await admin
    .from('quickbooks_connections')
    .update({ last_sync_at: new Date().toISOString(), last_sync_summary: message.slice(0, 300) })
    .eq('account_id', accountId);

  return { ok: true, ...counts, message };
}

/**
 * Drop the cutoff and send the history too.
 *
 * One way on purpose, and confirmed in the UI before it runs. Everything it
 * creates lands in somebody's real books, and nothing here can take it back out
 * — moving the cutoff forward again afterwards would only stop FUTURE sends,
 * which is not what "undo" means to the person asking for it.
 */
export async function backfillAccount(accountId: string): Promise<SyncSummary> {
  await createAdminClient()
    .from('quickbooks_connections')
    .update({ sync_from: null, updated_at: new Date().toISOString() })
    .eq('account_id', accountId);
  return syncAccount(accountId);
}

/**
 * Every linked account, for the nightly sweep.
 *
 * One account failing must never stop the rest — a contractor whose token
 * expired should not cost everybody else their sync.
 */
export async function syncAllAccounts(): Promise<{ accounts: number; invoices: number; payments: number; failed: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('quickbooks_connections')
    .select('account_id')
    .is('disconnected_at', null);

  const totals = { accounts: 0, invoices: 0, payments: 0, failed: 0 };
  for (const row of (data ?? []) as { account_id: string }[]) {
    try {
      const summary = await syncAccount(row.account_id);
      totals.accounts += 1;
      totals.invoices += summary.invoices;
      totals.payments += summary.payments;
      totals.failed += summary.failed;
    } catch (error) {
      totals.failed += 1;
      console.error('QuickBooks sync failed for account', row.account_id, error);
    }
  }
  return totals;
}
