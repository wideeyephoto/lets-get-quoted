// The homeowner's way of NOT approving.
//
// A quote page whose only control is "Approve" is a trap: somebody who wants
// one line explained has a choice between agreeing to something they don't
// understand and closing the tab. Closing the tab is what they pick, and the
// contractor never learns why.
//
// So: a question goes back to the contractor, lands on the job feed where the
// answer belongs, and emails them so it isn't waiting in a dashboard nobody has
// open. The quote is untouched — asking is not declining.

import { createAdminClient } from '@/lib/auth';
import { resolveJobAccess } from '@/lib/change-order-client';
import { clientRequestHash, saveClientRequest, validClientRequestId } from '@/lib/client-owner-requests';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';
import { loadBusinessName } from '@/lib/business-name';
import { sendOwnerPortalMessageAlertSms } from '@/lib/sms';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

/** Long enough for a real question, short enough not to be an essay in a feed row. */
const MAX_QUESTION = 1000;

export type AskResult = { ok: true } | { ok: false; message: string };

export async function askQuoteQuestion(token: string, question: string, requestId: string): Promise<AskResult> {
  const text = (question ?? '').toString().trim().slice(0, MAX_QUESTION);
  if (!text) return { ok: false, message: 'Type your question first.' };

  if (!validClientRequestId(requestId)) return { ok: false, message: 'Refresh this page before sending your question.' };
  requestId = requestId.toLowerCase();
  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Ask your contractor to resend it.' };

  const admin = createAdminClient();
  const [{ data: job }, { data: account }] = await Promise.all([
    admin
      .from('jobs')
      .select('ref, client_name')
      .eq('account_id', access.accountId)
      .eq('id', access.jobId)
      .maybeSingle(),
    admin
      .from('accounts')
      .select('business_name, alert_phone, high_value_sms_enabled')
      .eq('id', access.accountId)
      .maybeSingle(),
  ]);
  const clientName = (job?.client_name as string) || 'The customer';
  const businessName = (account?.business_name as string) || (await loadBusinessName(admin, access.accountId));

  // Client-visible on purpose: the person who asked should be able to see that
  // they asked, and the contractor's reply belongs in the same thread.
  let feedId: string | null;
  try {
    const receipt = await saveClientRequest(admin, {
      accountId: access.accountId, jobId: access.jobId, requestId,
      hash: clientRequestHash('client_question',text), kind: 'client_question',
      title: `${clientName} asked a question about the quote`, body: text,
    });
    feedId = receipt.feed_id;
  } catch { return { ok: false, message: 'Question could not be saved. Retry the same form or refresh to start a new question.' }; }
  if (!feedId) return { ok: true }; // A replay of a deleted event must not recreate it.


  // Best-effort. A question that reached the feed has arrived; failing the whole
  // action because an email bounced would tell the customer it didn't.
  try {
    await runOwnerEventNotices(admin, { sourceId: feedId, accountId: access.accountId });
  } catch (error) {
    console.error(`Could not email the owner about a quote question on job ${access.jobId}:`, error instanceof Error ? error.message : error);
  }

  // Notify contractor alert phone via SMS
  if (account?.alert_phone && account?.high_value_sms_enabled !== false) {
    try {
      await sendOwnerPortalMessageAlertSms({
        accountId: access.accountId,
        alertPhone: account.alert_phone,
        businessName,
        customerName: clientName,
        messagePreview: `${job?.ref ? `[${job.ref}] ` : ''}${text}`,
        dashboardUrl: `${APP_ORIGIN}/dashboard/jobs/${access.jobId}`,
        idempotencyKey: `owner-quote-q:${access.accountId}:${access.jobId}:${requestId}`,
      });
    } catch (error) {
      console.error(`Could not SMS alert the owner about a quote question on job ${access.jobId}:`, error instanceof Error ? error.message : error);
    }
  }

  return { ok: true };
}
