import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/auth';
import { getJob, parseQuoteItems, type QuoteItem } from '@/lib/jobs';
import { createRecurringPlan, ensurePlanVisits } from '@/lib/recurring';
import { createCardSetupSession } from '@/lib/card-on-file';
import { createDepositRequest } from '@/lib/payments';
import { addInvoiceItem, createInvoice, listInvoices, selectPrimaryInvoice } from '@/lib/invoices';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SubscriptionSignupMode = 'cycle' | 'prepay';


export type SubscriptionStart = {
  /** YYYY-MM-DD the first visit lands on. */
  startDate: string;
  mode: SubscriptionSignupMode;
  /** Charge the card on file each cycle. Off when nobody has given a card yet. */
  autoCharge: boolean;
};

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Take the item, or lose the race.
 *
 * The owner can accept a plan on the phone at the same moment the client taps
 * sign-up on their quote page. Reading `signedUp` and then writing it leaves a
 * window where both see false and both create a plan — the client gets billed
 * twice on one agreement.
 *
 * The `cs` (contains) filter makes the read and the write one statement:
 * Postgres only updates the row if the array does NOT already hold this item
 * with signedUp true. Zero rows back means somebody else got there first.
 */
async function claimSubscriptionItem(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  jobId: string,
  items: QuoteItem[],
  itemId: string,
): Promise<boolean> {
  const claimed = items.map((entry) => (entry.id === itemId ? { ...entry, signedUp: true } : entry));
  const { data, error } = await admin
    .from('jobs')
    .update({ quote_items: claimed })
    .eq('account_id', accountId)
    .eq('id', jobId)
    .not('quote_items', 'cs', JSON.stringify([{ id: itemId, signedUp: true }]))
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Put the item back on offer when the work after the claim fails. */
async function releaseSubscriptionItem(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  jobId: string,
  items: QuoteItem[],
  itemId: string,
): Promise<void> {
  const released = items.map((entry) => (entry.id === itemId ? { ...entry, signedUp: false } : entry));
  await admin.from('jobs').update({ quote_items: released }).eq('account_id', accountId).eq('id', jobId);
}

// Client-initiated, from the approved-quote dashboard: sign up for a
// subscription line item. Creates a termed recurring plan (honoring the item's
// term), then routes the client to Stripe — a card-setup page to pay per cycle,
// or the prepaid /pay checkout for the whole term at the offered discount.
export async function startSubscriptionSignup(
  clientToken: string,
  itemId: string,
  mode: SubscriptionSignupMode,
  startDate: string,
): Promise<{ redirectUrl: string }> {
  if (!isDateKey(startDate)) throw new Error('Choose a valid start date for the plan.');
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

  // Claim BEFORE creating anything. The old order created the plan first and
  // marked the item second, so two concurrent signups both got past the check
  // and produced two plans for one agreement.
  if (!(await claimSubscriptionItem(admin, accountId, jobId, items, itemId))) {
    throw new Error('That plan is already being set up.');
  }

  // Per-cycle auto-charges each visit; prepay generates the visits but never
  // charges (the lump sum below covers them), so auto_charge stays off.
  let plan;
  try {
    plan = await createRecurringPlan(admin, accountId, {
      title: item.label,
      scope: null,
      clientName: job.client_name,
      clientPhone: job.client_phone,
      clientEmail: job.client_email,
      address: job.address,
      amount: item.amount,
      frequency: item.frequency ?? 'monthly',
      firstVisitDate: startDate,
      autoCharge: mode === 'cycle',
      prepaid: mode === 'prepay',
      termCycles: term,
    });
  } catch (error) {
    // Claimed but not created: put it back on offer rather than leaving a plan
    // the client can never sign up for again.
    await releaseSubscriptionItem(admin, accountId, jobId, items, itemId);
    throw error;
  }

  // Put the visits on the calendar now. Creating the plan alone left nothing to
  // see until the nightly sweep topped up the horizon — so a plan someone had
  // just signed up for looked like it had done nothing. Failing here is not
  // worth undoing a signup over: the sweep still catches it.
  try {
    await ensurePlanVisits(admin, plan);
  } catch (visitError) {
    console.error(`Plan ${plan.id} created but visits failed:`, visitError instanceof Error ? visitError.message : visitError);
  }

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

/**
 * Owner-initiated: the client said yes on the phone.
 *
 * The client-facing signup was the ONLY way a subscription line item ever became
 * a live plan, so a quote agreed verbally had nowhere to be recorded — the job's
 * status dropdown doesn't touch `signedUp` and never created anything.
 *
 * Accepting on someone's behalf is not the same as holding their card, so
 * `autoCharge` is a deliberate choice rather than an assumption. With it off the
 * plan still generates visits and invoices; nothing is charged automatically,
 * and the owner can text a card link afterwards.
 */
export async function acceptSubscriptionForClient(
  accountId: string,
  jobId: string,
  itemId: string,
  options: SubscriptionStart,
): Promise<{ planId: string; cardSetupUrl: string | null; paymentId: string | null }> {
  if (!isDateKey(options.startDate)) throw new Error('Choose a valid start date for the plan.');
  const admin = createAdminClient();

  const job = await getJob(admin, accountId, jobId);
  if (!job) throw new Error('Job not found.');

  const items = parseQuoteItems(job.quote_items);
  const item = items.find((entry) => entry.id === itemId && entry.kind === 'subscription' && !entry.signedUp);
  if (!item) throw new Error('That plan is unavailable or already set up.');

  if (!(await claimSubscriptionItem(admin, accountId, jobId, items, itemId))) {
    throw new Error('That plan is already being set up.');
  }

  const term = item.termCycles && item.termCycles > 0 ? item.termCycles : null;

  let plan;
  try {
    plan = await createRecurringPlan(admin, accountId, {
      title: item.label,
      scope: null,
      clientName: job.client_name,
      clientPhone: job.client_phone,
      clientEmail: job.client_email,
      address: job.address,
      amount: item.amount,
      frequency: item.frequency ?? 'monthly',
      firstVisitDate: options.startDate,
      // Prepay is one lump sum up front, so per-visit charging stays off however
      // the owner set the toggle — otherwise the client pays twice.
      autoCharge: options.mode === 'cycle' && options.autoCharge,
      prepaid: options.mode === 'prepay',
      termCycles: term,
    });
  } catch (error) {
    await releaseSubscriptionItem(admin, accountId, jobId, items, itemId);
    throw error;
  }


  // Put the visits on the calendar now. Creating the plan alone left nothing to
  // see until the nightly sweep topped up the horizon — so a plan someone had
  // just signed up for looked like it had done nothing. Failing here is not
  // worth undoing a signup over: the sweep still catches it.
  try {
    await ensurePlanVisits(admin, plan);
  } catch (visitError) {
    console.error(`Plan ${plan.id} created but visits failed:`, visitError instanceof Error ? visitError.message : visitError);
  }

  // An accepted quote is live work. Leaving it at 'new_lead' would keep it in
  // the "needs a response" badge for a job the owner has already closed.
  if (job.status === 'new_lead') {
    await admin.from('jobs').update({ status: 'in_progress' }).eq('account_id', accountId).eq('id', jobId);
  }

  if (options.mode === 'prepay') {
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
    return { planId: plan.id, cardSetupUrl: null, paymentId: payment.id };
  }

  // No card session is minted here. Per-cycle billing needs a card the client
  // enters themselves, and the Recurring page already has a "text the card
  // link" button per plan — creating a Stripe session now would burn an API
  // call on a URL the owner has no way to see from this page anyway.
  return { planId: plan.id, cardSetupUrl: null, paymentId: null };
}
