import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/auth';
import { getJob, parseQuoteItems, type QuoteItem } from '@/lib/jobs';
import { createRecurringPlan, todayDateKey } from '@/lib/recurring';
import { createCardSetupSession } from '@/lib/card-on-file';
import { createDepositRequest } from '@/lib/payments';
import { addInvoiceItem, createInvoice, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SubscriptionSignupMode = 'cycle' | 'prepay';

// Client-initiated, from the approved-quote dashboard: sign up for a
// subscription line item. Creates a termed recurring plan (honoring the item's
// term), then routes the client to Stripe — a card-setup page to pay per cycle,
// or the prepaid /pay checkout for the whole term at the offered discount.
export async function startSubscriptionSignup(
  clientToken: string,
  itemId: string,
  mode: SubscriptionSignupMode,
): Promise<{ redirectUrl: string }> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: access } = await admin
    .from('client_job_access')
    .select('account_id, job_id, expires_at, revoked_at')
    .eq('token_hash', hashToken(clientToken))
    .maybeSingle();
  if (!access || access.revoked_at || (access.expires_at && access.expires_at < now)) {
    throw new Error('This job link is no longer available.');
  }
  const accountId = access.account_id as string;
  const jobId = access.job_id as string;

  const job = await getJob(admin, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  const items = parseQuoteItems(job.quote_items);
  const item = items.find((entry) => entry.id === itemId && entry.kind === 'subscription' && !entry.signedUp);
  if (!item) throw new Error('That plan is unavailable or already set up.');

  const term = item.termCycles && item.termCycles > 0 ? item.termCycles : null;

  // Per-cycle auto-charges each visit; prepay generates the visits but never
  // charges (the lump sum below covers them), so auto_charge stays off.
  const plan = await createRecurringPlan(admin, accountId, {
    title: item.label,
    scope: null,
    clientName: job.client_name,
    clientPhone: job.client_phone,
    clientEmail: job.client_email,
    address: job.address,
    amount: item.amount,
    frequency: item.frequency ?? 'monthly',
    firstVisitDate: todayDateKey(),
    autoCharge: mode === 'cycle',
    termCycles: term,
  });

  // Stop offering this plan once signed up.
  const updatedItems: QuoteItem[] = items.map((entry) => (entry.id === itemId ? { ...entry, signedUp: true } : entry));
  await admin.from('jobs').update({ quote_items: updatedItems }).eq('account_id', accountId).eq('id', jobId);

  if (mode === 'cycle') {
    const url = await createCardSetupSession(plan, APP_ORIGIN);
    return { redirectUrl: url };
  }

  // Prepay: one discounted charge for the whole term, paid at /pay.
  const discount = item.prepayDiscountPercent ?? 0;
  const cycles = term ?? 1;
  const prepaidAmount = Math.round(item.amount * cycles * (1 - discount / 100) * 100) / 100;
  const invoices = await listInvoices(admin, accountId, jobId);
  const invoice = selectPrimaryInvoice(invoices) ?? (await createInvoice(admin, accountId, jobId, 'draft'));
  if (Number(invoice.total) <= 0 && Number(job.quoted_amount) > 0) {
    await addInvoiceItem(admin, accountId, invoice.id, { description: 'Quoted job total', amount: Number(job.quoted_amount) });
  }
  const payment = await createDepositRequest(admin, accountId, jobId, {
    label: `${item.label} — ${cycles} ${item.frequency ?? 'monthly'} prepaid${discount > 0 ? ` (save ${discount}%)` : ''}`,
    amount: prepaidAmount,
    kind: 'plan_installment',
    invoiceId: invoice.id,
  });
  return { redirectUrl: `/pay/${payment.id}` };
}
