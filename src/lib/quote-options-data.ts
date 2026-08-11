import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { resolveJobAccess } from '@/lib/change-order-client';
import { computeQuoteTotal, parseQuoteItems, formatMoneyExact } from '@/lib/jobs';
import { createJobFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { pickBusinessName } from '@/lib/business-name';
import { APP_ORIGIN } from '@/lib/app-origin';
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

async function loadBusinessName(admin: SupabaseClient, accountId: string): Promise<string> {
  const [{ data: account }, { data: site }] = await Promise.all([
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  return pickBusinessName(site, account);
}

export async function updateClientQuoteOptions(token: string, addonIds: string[]): Promise<OptionUpdateResult> {
  const access = await resolveJobAccess(token);
  if (!access) return { ok: false, message: 'This link is no longer valid. Ask your contractor to resend it.' };

  const admin = createAdminClient();
  const { accountId, jobId } = access;

  const { data: job } = await admin
    .from('jobs')
    .select('ref, client_name, status, started_at, scheduled_for, quote_items, quoted_amount')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return { ok: false, message: 'We could not find this job.' };

  // The contractor's switch and their timezone, read defensively: the switch
  // ships behind its own migration, and a database without it means "off",
  // which is the safe answer either way.
  const settings = await admin.from('accounts').select('client_quote_changes, timezone').eq('id', accountId).maybeSingle();
  const allowed = settings.data?.client_quote_changes === true;
  const today = todayIn(settings.data?.timezone as string | null | undefined);

  const [{ data: planRow }, { data: paidRows }] = await Promise.all([
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
  const paidToDate = (paidRows ?? []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

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
  if (!change.changed) return { ok: true, total: Number(job.quoted_amount) || 0 };

  const finalized = applyOptionChoice(items, chosen);
  const previousTotal = Number(job.quoted_amount) || 0;
  const newTotal = computeQuoteTotal(finalized);

  // Money already taken cannot be un-taken by unticking a box. Dropping below
  // it would leave the customer in credit, and issuing a refund is a decision a
  // contractor makes rather than a side effect of a checkbox.
  if (Math.round(newTotal * 100) < Math.round(paidToDate * 100)) {
    return {
      ok: false,
      message: `You have already paid ${formatMoneyExact(paidToDate)} towards this job, so the total cannot go below that. Ask your contractor and they will sort it out with you.`,
    };
  }

  const { error } = await admin
    .from('jobs')
    .update({ quote_items: finalized, quoted_amount: newTotal })
    .eq('account_id', accountId)
    .eq('id', jobId);
  if (error) return { ok: false, message: 'We could not save that. Please try again.' };

  const sentence = optionChangeSentence(change);
  const clientName = (job.client_name as string) || 'The customer';

  // Client-visible, and financial: the number on this page moved, and a page
  // whose total changes with nothing in the record saying so is the thing the
  // revision gate exists to prevent. Best-effort — the save has happened, and a
  // failed note must not undo it.
  try {
    await createJobFeedEvent(admin, accountId, jobId, {
      kind: 'quote_revised',
      title: `${clientName} changed their options`,
      body: `${sentence} The total changed from ${formatMoneyExact(previousTotal)} to ${formatMoneyExact(newTotal)}.`,
      visibility: 'client_financial',
      amount: newTotal,
      author: 'Client',
    });
  } catch (error) {
    console.error(`Could not record an option change on job ${jobId}:`, error instanceof Error ? error.message : error);
  }

  // The contractor finds out immediately, because they may have bought
  // materials for the thing that was just removed. Removals lead the subject
  // line for the same reason.
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      const businessName = await loadBusinessName(admin, accountId);
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName,
        subject:
          change.removed.length > 0
            ? `${clientName} removed work from ${job.ref ?? 'their job'}`
            : `${clientName} added work to ${job.ref ?? 'their job'}`,
        heading: `${clientName} changed their options`,
        bodyLines: [
          sentence,
          `New total: ${formatMoneyExact(newTotal)} (was ${formatMoneyExact(previousTotal)}).`,
          ...(paidToDate > 0 ? [`${formatMoneyExact(paidToDate)} has already been paid against this job.`] : []),
          'Any invoice you have already raised still shows the old total — check it before you send it.',
        ],
        ctaLabel: 'Open the job',
        ctaUrl: `${APP_ORIGIN}/dashboard/jobs/${jobId}`,
        tone: change.removed.length > 0 ? 'warning' : 'info',
      });
    }
  } catch (error) {
    console.error(`Could not email the owner about an option change on job ${jobId}:`, error instanceof Error ? error.message : error);
  }

  return { ok: true, total: newTotal };
}
