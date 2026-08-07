// The homeowner's side of a change order: seeing it, and answering it.
//
// Everything here goes through the job link's token. The person deciding has no
// account, so the token IS the authorisation — which means it has to be resolved
// here, server-side, on every call, and a change order id is never trusted to
// belong to the job the token opens.

import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { formatMoney } from '@/lib/jobs';
import { respondToChangeOrder } from '@/lib/change-orders-data';
import { loadBusinessName } from '@/lib/business-name';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

type Access = { accountId: string; jobId: string };

/** Resolve a job link to the job it opens, or null. Expiry and revocation apply. */
export async function resolveJobAccess(token: string): Promise<Access | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_job_access')
    .select('account_id, job_id, expires_at, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  if (data.expires_at && data.expires_at < new Date().toISOString()) return null;
  return { accountId: data.account_id as string, jobId: data.job_id as string };
}

export type RespondResult = { ok: true; decision: 'approved' | 'declined' } | { ok: false; message: string };

/**
 * Record the homeowner's decision.
 *
 * The change order is re-read and checked to belong to THIS job before anything
 * is written. Without that, a valid token for one job would answer a change
 * order on another — and both belong to real customers.
 */
export async function respondAsClient(
  token: string,
  changeOrderId: string,
  input: { decision: 'approved' | 'declined'; signatureName: string; declineReason?: string | null },
): Promise<RespondResult> {
  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Ask your contractor to resend it.' };

  const admin = createAdminClient();
  const { data: owned } = await admin
    .from('change_orders')
    .select('id, job_id, title, amount')
    .eq('account_id', access.accountId)
    .eq('id', changeOrderId)
    .maybeSingle();
  if (!owned || owned.job_id !== access.jobId) {
    return { ok: false, message: 'That request could not be found on this job.' };
  }

  const result = await respondToChangeOrder(admin, access.accountId, changeOrderId, input);
  if (!result.ok || !result.order) return { ok: false, message: result.message ?? 'That has already been answered.' };

  const order = result.order;
  const approved = order.status === 'approved';

  // Approving raises the price of the job, because that is what the customer
  // just agreed to. Done here rather than derived at read time so every existing
  // reader — invoices, margin, the client's own quote total — sees the new
  // number without knowing change orders exist.
  //
  // Billing is deliberately NOT automatic. The owner asks for the money when
  // they're ready, the same as a Proof-to-Pay stage: turning an approval into an
  // instant payment request would surprise a customer who has just done the
  // contractor a favour by saying yes.
  if (approved) {
    try {
      const { data: job } = await admin.from('jobs').select('quoted_amount').eq('id', access.jobId).maybeSingle();
      const updated = Math.round(((Number(job?.quoted_amount) || 0) + order.amount) * 100) / 100;
      await admin.from('jobs').update({ quoted_amount: updated }).eq('account_id', access.accountId).eq('id', access.jobId);
    } catch (error) {
      // The decision is recorded either way. A job total that didn't move is a
      // visible, fixable problem; losing the approval would not be.
      console.error('Change order job total update failed:', error instanceof Error ? error.message : error);
    }
  }

  // On the job's own timeline, and visible to both sides. A decision about money
  // that only one party can see is the thing this feature exists to stop.
  try {
    await createJobFeedEvent(admin, access.accountId, access.jobId, {
      kind: approved ? 'change_order_approved' : 'change_order_declined',
      title: approved ? `Approved: ${order.title}` : `Declined: ${order.title}`,
      body: approved
        ? `${order.signatureName} approved this change order.`
        : `${order.signatureName} declined this change order.${order.declineReason ? ` They said: ${order.declineReason}` : ''}`,
      visibility: 'client',
      amount: order.amount,
      sourceTable: 'change_orders',
      sourceId: order.id,
    });
  } catch (error) {
    console.error('Change order decision feed event failed:', error instanceof Error ? error.message : error);
  }

  // Tell the contractor immediately. A crew may be standing on site waiting to
  // know whether to carry on, and finding out tomorrow costs a day.
  try {
    const [ownerEmail, businessName] = await Promise.all([
      getAccountOwnerEmail(admin, access.accountId),
      loadBusinessName(admin, access.accountId),
    ]);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName,
        subject: approved ? `Change order approved — ${formatMoney(order.amount)}` : 'Change order declined',
        heading: approved ? `${order.signatureName} approved “${order.title}”` : `${order.signatureName} declined “${order.title}”`,
        bodyLines: [
          `${formatMoney(order.amount)} — ${order.title}`,
          approved
            ? 'Your crew can go ahead with this work.'
            : order.declineReason
              ? `They said: ${order.declineReason}`
              : 'They gave no reason.',
          approved ? '' : 'The write-up and photos stay on the job, so there is a record that they were told.',
        ].filter(Boolean),
        ctaLabel: 'Open the job',
        ctaUrl: `${APP_ORIGIN}/dashboard/jobs/${access.jobId}`,
        tone: approved ? 'info' : 'warning',
      });
    }
  } catch (error) {
    console.error('Change order owner alert failed:', error instanceof Error ? error.message : error);
  }

  return { ok: true, decision: approved ? 'approved' : 'declined' };
}
