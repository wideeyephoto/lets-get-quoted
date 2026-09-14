import { runOwnerEventNotices } from '@/lib/owner-event-notices';
import {findQuoteOptionReceipt,quoteOptionRequestHash,quoteOptionRevision,type QuoteOptionRequest} from '@/lib/quote-option-requests';
import { createAdminClient } from '@/lib/auth';
import { resolveJobAccess } from '@/lib/change-order-client';
import { computeQuoteTotal, parseQuoteItems, formatMoneyExact } from '@/lib/jobs';
import {
  applyOptionChoice,
  describeOptionChange,
  optionChangeSentence,
  quoteOptionsWindow,
  todayIn,
} from '@/lib/quote-options';

/**
 * The customer changing their own extras, written down.
 *
 * EVERY RULE IS RE-DERIVED HERE. The page decides what to render from the same
 * window function, and none of that reaches this: a server action is a public
 * endpoint reachable by anybody holding the link, so "the form was hidden" is
 * not a check. The window, the floor and which items may move are all decided
 * again from what the database says, at the moment of the write.
 */

export type OptionUpdateResult = { ok: true; total: number } | { ok: false; message: string };

export async function updateClientQuoteOptions(token: string, addonIds: string[], request: QuoteOptionRequest): Promise<OptionUpdateResult> {
  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Ask your contractor to resend it.' };

  const admin = createAdminClient();
  const { accountId, jobId } = access;
  let payloadHash:string;
  try {
    payloadHash=quoteOptionRequestHash(jobId,addonIds,request);
    const receipt=await findQuoteOptionReceipt(admin,accountId,request,payloadHash);
    if(receipt){
      if(receipt.event_id)try{await runOwnerEventNotices(admin,{sourceId:receipt.event_id,accountId});}catch{/* Retained for background pickup. */}
      return {ok:true,total:Number(receipt.total)};
    }
  } catch(error){return {ok:false,message:error instanceof Error?error.message:'Could not check your saved change.'};}

  const { data: job, error: jobError } = await admin
    .from('jobs')
    .select('ref, client_name, status, started_at, scheduled_for, quote_items, quoted_amount')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (jobError) return { ok: false, message: 'We could not check your quote. Please try again.' };
  if (!job) return { ok: false, message: 'We could not find this job.' };
  if(quoteOptionRevision(job.quote_items,job.quoted_amount)!==request.revision){
    return {ok:false,message:'This quote changed since you opened it. Reload the latest quote and review your choices.'};
  }

  // The contractor's switch and their timezone, read defensively: the switch
  // ships behind its own migration, and a database without it means "off",
  // which is the safe answer either way.
  const settings = await admin.from('accounts').select('client_quote_changes, timezone').eq('id', accountId).maybeSingle();
  if (settings.error || !settings.data) return { ok: false, message: 'We could not check whether changes are allowed. Please try again.' };
  const allowed = settings.data?.client_quote_changes === true;
  const today = todayIn(settings.data?.timezone as string | null | undefined);

  const [{ data: planRow, error: planError }, { data: paidRows, error: paymentsError }] = await Promise.all([
    admin
      .from('payment_plans')
      .select('status, authorized_at')
      .eq('account_id', accountId)
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('payments').select('amount').eq('account_id', accountId).eq('job_id', jobId).eq('status', 'paid'),
  ]);
  if (planError || paymentsError || !Array.isArray(paidRows)) {
    return { ok: false, message: 'We could not check your payments. Please try again before changing your options.' };
  }
  const paidAmounts = paidRows.map(row => row.amount == null ? NaN : Number(row.amount));
  if (paidAmounts.some(amount => !Number.isFinite(amount) || amount < 0)) {
    return { ok: false, message: 'We could not verify your payment totals. Please contact your contractor.' };
  }
  const paidToDate = paidAmounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isFinite(paidToDate)) {
    return { ok: false, message: 'We could not verify your payment totals. Please contact your contractor.' };
  }

  const items = parseQuoteItems(job.quote_items);
  const window = quoteOptionsWindow({
    approved: job.status !== 'new_lead',
    allowed,
    hasAddons: items.some((item) => item.kind === 'addon'),
    jobStatus: job.status as string,
    startedAt: (job.started_at as string | null) ?? null,
    scheduledFor: (job.scheduled_for as string | null) ?? null,
    today,
    planStatus: (planRow?.status as string | null) ?? null,
    planAuthorized: Boolean(planRow?.authorized_at),
    paidToDate,
  });

  if (!window.open) {
    return { ok: false, message: 'Your options are no longer open to change. Please contact your contractor.' };
  }

  // Only ids that are add-ons ON THIS QUOTE. An id from somewhere else, or a
  // base line's id posted as an add-on, changes nothing rather than being
  // rejected with a message that teaches somebody how to probe the endpoint.
  const validIds = new Set(items.filter((item) => item.kind === 'addon').map((item) => item.id));
  const chosen = addonIds.filter((id) => validIds.has(id));

  const change = describeOptionChange(items, chosen);

  const finalized = applyOptionChoice(items, chosen);
  const previousTotal = Number(job.quoted_amount) || 0;
  const newTotal = change.changed ? computeQuoteTotal(finalized) : previousTotal;
  if (!Number.isFinite(newTotal) || newTotal < 0) {
    return { ok: false, message: 'We could not verify the updated quote total. Please contact your contractor.' };
  }

  // Money already taken cannot be un-taken by unticking a box. Dropping below
  // it would leave the customer in credit, and issuing a refund is a decision a
  // contractor makes rather than a side effect of a checkbox.
  if (Math.round(newTotal * 100) < Math.round(paidToDate * 100)) {
    return {
      ok: false,
      message: `You have already paid ${formatMoneyExact(paidToDate)} towards this job, so the total cannot go below that. Ask your contractor and they will sort it out with you.`,
    };
  }

  const sentence = optionChangeSentence(change);
  const clientName = (job.client_name as string) || 'The customer';
  const title = change.removed.length > 0
    ? `${clientName} removed work from ${job.ref ?? 'their job'}`
    : `${clientName} added work to ${job.ref ?? 'their job'}`;
  const body = `${sentence} The total changed from ${formatMoneyExact(previousTotal)} to ${formatMoneyExact(newTotal)}. Check any existing invoice before sending it.`;
  const saved = await admin.rpc('save_client_quote_option_request', {
    p_account_id: accountId, p_job_id: jobId,
    p_request_id:request.requestId,p_payload_hash:payloadHash,
    p_expected: {status:job.status,started_at:job.started_at??null,scheduled_for:job.scheduled_for??null,quote_items:job.quote_items??null,quoted_amount:job.quoted_amount??null},
    p_items: change.changed ? finalized : job.quote_items, p_total: newTotal, p_title: title, p_body: body,
  });
  if (saved.error || !saved.data || saved.data.total !== newTotal) {
    return {ok:false,message:'We could not save these options. Refresh the quote and check your choices before trying again.'};
  }
  if (saved.data.event_id) {
    try { await runOwnerEventNotices(admin,{sourceId:saved.data.event_id,accountId}); }
    catch { console.error('Quote option owner notice remains saved for pickup'); }
  }
  return { ok: true, total: newTotal };
}
