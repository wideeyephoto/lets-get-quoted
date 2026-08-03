'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { getJob, listCosts, computeMargin, formatMoney, type QuoteItem } from '@/lib/jobs';
import { listServices } from '@/lib/services';
import { getSiteContent } from '@/lib/site-content';
import { createJobFeedEvent } from '@/lib/job-feed';
import { draftChangeOrder } from '@/lib/change-order-ai';
import { draftConfidenceNote, draftToQuoteItems, type SerializedDraft } from '@/lib/quote-draft';
import { marginImpact, changeOrderTotal, type MarginImpact } from '@/lib/change-orders';
import {
  getChangeOrder,
  listChangeOrders,
  sendChangeOrder,
  updateChangeOrder,
  voidChangeOrder,
} from '@/lib/change-orders-data';
import { createJobPhotoLinks } from '@/lib/job-photo-storage';
import { createDepositRequest } from '@/lib/payments';

/**
 * Draft the write-up and the lines from what the crew member found.
 *
 * The photos are re-read from storage rather than taken from the caller: the
 * point of this feature is that the model saw what the crew saw, and a caller
 * that can substitute the image can write up work nobody photographed.
 */
export async function draftChangeOrderAction(
  jobId: string,
  changeOrderId: string,
): Promise<{ ok: true; draft: SerializedDraft & { title: string; scope: string } } | { ok: false; message: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  if (!(await checkRateLimit(createAdminClient(), `co-draft:${accountId}`, 30, 3600))) {
    return { ok: false, message: 'That is a lot of drafts in an hour — give it a few minutes.' };
  }

  const [order, job] = await Promise.all([
    getChangeOrder(supabase, accountId, changeOrderId),
    getJob(supabase, accountId, jobId),
  ]);
  if (!order || !job) return { ok: false, message: 'That change order could not be found.' };
  if (!order.fieldNote.trim()) {
    return { ok: false, message: 'There is no note from the field to draft from. Describe what was found first.' };
  }

  const [services, { data: site }, photoLinks] = await Promise.all([
    listServices(supabase, accountId, { activeOnly: true }),
    supabase.from('sites').select('content').eq('account_id', accountId).maybeSingle(),
    createJobPhotoLinks(accountId, order.photoPaths.slice(0, 3)),
  ]);

  const photos: string[] = [];
  for (const link of photoLinks) {
    try {
      const response = await fetch(link.url);
      if (!response.ok) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      // 6MB of photo is already more than the model needs; anything bigger is a
      // slow request for no extra accuracy.
      if (buffer.length > 6_000_000) continue;
      const type = response.headers.get('content-type') ?? 'image/jpeg';
      photos.push(`data:${type};base64,${buffer.toString('base64')}`);
    } catch {
      // A photo we can't fetch is one the model doesn't see. The note alone is
      // still worth drafting from — better than refusing the whole thing.
    }
  }

  const draft = await draftChangeOrder({
    trade: getSiteContent(site?.content as Record<string, unknown> | null).trade.trim() || null,
    jobScope: job.scope ?? '',
    fieldNote: order.fieldNote,
    photos,
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      unitPrice: Number(service.unit_price) || 0,
      unit: service.unit,
      description: service.description,
    })),
  });
  if (!draft) return { ok: false, message: 'Could not draft that just now. Try again in a moment.' };

  return {
    ok: true,
    draft: {
      title: draft.title,
      scope: draft.scope,
      items: draftToQuoteItems(draft.lines, 'co'),
      provenance: draft.lines.map((line) => ({ label: line.label, source: line.source, note: line.note })),
      summary: draft.summary,
      assumptions: draft.assumptions,
      questions: draft.questions,
      needsMoreInfo: draft.needsMoreInfo,
      confidence: draftConfidenceNote(draft),
      total: draft.lines.reduce((sum, line) => sum + line.amount, 0),
    },
  };
}

export async function saveChangeOrderAction(
  jobId: string,
  changeOrderId: string,
  input: { title: string; scope: string; items: QuoteItem[]; estimatedCost: number | null },
): Promise<{ ok: boolean; message?: string; amount?: number }> {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await updateChangeOrder(supabase, accountId, changeOrderId, input);
  if (!result.ok) return result;
  revalidatePath(`/dashboard/jobs/${jobId}`);
  return { ok: true, amount: changeOrderTotal(input.items) };
}

/**
 * Send it to the homeowner and record that we did, on the job's own timeline.
 *
 * The feed entry is CLIENT-VISIBLE. A request for more money should appear in
 * the same place as every other update about the job, not arrive out of band
 * where it can be missed and then argued about.
 */
export async function sendChangeOrderAction(jobId: string, changeOrderId: string): Promise<{ ok: boolean; blockers?: string[] }> {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await sendChangeOrder(supabase, accountId, changeOrderId);
  if (!result.ok || !result.order) return { ok: false, blockers: result.blockers };

  try {
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'change_order_sent',
      title: `Change order: ${result.order.title}`,
      body: result.order.scope,
      visibility: 'client',
      amount: result.order.amount,
      sourceTable: 'change_orders',
      sourceId: result.order.id,
    });
  } catch (error) {
    console.error('Change order feed event failed:', error instanceof Error ? error.message : error);
  }

  revalidatePath(`/dashboard/jobs/${jobId}`);
  return { ok: true };
}

export async function voidChangeOrderAction(jobId: string, changeOrderId: string): Promise<{ ok: boolean; message?: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await voidChangeOrder(supabase, accountId, changeOrderId);
  if (result.ok) revalidatePath(`/dashboard/jobs/${jobId}`);
  return result;
}

/**
 * Ask to be paid for an approved change order.
 *
 * Explicit, never automatic — the same rule as a Proof-to-Pay stage. Turning an
 * approval into an instant payment request surprises a customer who has just
 * done you a favour by saying yes, and the contractor is usually the one who
 * knows whether to bill it now or roll it into the final invoice.
 */
export async function requestChangeOrderPaymentAction(
  jobId: string,
  changeOrderId: string,
): Promise<{ ok: boolean; message?: string }> {
  const { supabase, accountId } = await requireOwnerContext();
  const order = await getChangeOrder(supabase, accountId, changeOrderId);
  if (!order) return { ok: false, message: 'That change order could not be found.' };
  if (order.status !== 'approved') return { ok: false, message: 'Only approved change orders can be billed.' };
  if (order.paymentId) return { ok: false, message: 'A payment has already been requested for this.' };
  if (!(order.amount > 0)) return { ok: false, message: 'This has no amount on it.' };

  const job = await getJob(supabase, accountId, jobId);
  if (!job) return { ok: false, message: 'That job could not be found.' };

  const payment = await createDepositRequest(supabase, accountId, jobId, {
    // The change order's title verbatim, so the bank statement, the pay page and
    // the job all name the same thing.
    label: order.title,
    amount: order.amount,
    kind: 'stage',
    homeownerPhone: job.client_phone,
    smsConsent: Boolean(job.client_phone),
  });

  await supabase
    .from('change_orders')
    .update({ payment_id: payment.id, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', changeOrderId);

  revalidatePath(`/dashboard/jobs/${jobId}`);
  return { ok: true };
}

/** What approving the drafts on this job would do to its margin. Owner-only. */
export async function changeOrderImpactAction(jobId: string, addedRevenue: number, addedCost: number | null): Promise<MarginImpact> {
  const { supabase, accountId } = await requireOwnerContext();
  const job = await getJob(supabase, accountId, jobId);
  const costs = job ? await listCosts(supabase, accountId, jobId) : [];
  const margin = job ? computeMargin(job, costs) : { revenue: 0, totalCost: 0 };
  return marginImpact({ jobRevenue: margin.revenue, jobCost: margin.totalCost, addedRevenue, addedCost });
}

/** Owner-facing summary line for the job page header. */
export async function changeOrderSummary(jobId: string): Promise<string | null> {
  const { supabase, accountId } = await requireOwnerContext();
  const orders = await listChangeOrders(supabase, accountId, jobId);
  const unsent = orders.filter((order) => order.status === 'draft');
  if (unsent.length === 0) return null;
  const total = unsent.reduce((sum, order) => sum + order.amount, 0);
  return total > 0
    ? `${unsent.length} change order${unsent.length === 1 ? '' : 's'} written up but not sent — ${formatMoney(total)}.`
    : `${unsent.length} change order${unsent.length === 1 ? '' : 's'} from the field still need pricing.`;
}
