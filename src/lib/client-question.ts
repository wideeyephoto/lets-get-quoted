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
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { loadBusinessName } from '@/lib/business-name';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

/** Long enough for a real question, short enough not to be an essay in a feed row. */
const MAX_QUESTION = 1000;

export type AskResult = { ok: true } | { ok: false; message: string };

export async function askQuoteQuestion(token: string, question: string): Promise<AskResult> {
  const text = (question ?? '').toString().trim().slice(0, MAX_QUESTION);
  if (!text) return { ok: false, message: 'Type your question first.' };

  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Ask your contractor to resend it.' };

  const admin = createAdminClient();
  const { data: job } = await admin
    .from('jobs')
    .select('ref, client_name')
    .eq('account_id', access.accountId)
    .eq('id', access.jobId)
    .maybeSingle();
  const clientName = (job?.client_name as string) || 'The customer';

  // Client-visible on purpose: the person who asked should be able to see that
  // they asked, and the contractor's reply belongs in the same thread.
  await createJobFeedEvent(admin, access.accountId, access.jobId, {
    kind: 'client_question',
    title: `${clientName} asked a question about the quote`,
    body: text,
    visibility: 'client',
  });

  // Best-effort. A question that reached the feed has arrived; failing the whole
  // action because an email bounced would tell the customer it didn't.
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, access.accountId);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName: await loadBusinessName(admin, access.accountId),
        subject: `${clientName} has a question about ${job?.ref ?? 'their quote'}`,
        heading: `${clientName} asked about their quote`,
        bodyLines: [text, 'They have not approved or declined — they are waiting on an answer.'],
        ctaLabel: 'Open the job',
        ctaUrl: `${APP_ORIGIN}/dashboard/jobs/${access.jobId}`,
        tone: 'info',
      });
    }
  } catch (error) {
    console.error(`Could not email the owner about a quote question on job ${access.jobId}:`, error instanceof Error ? error.message : error);
  }

  return { ok: true };
}
