'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { checkRateLimitStrict } from '@/lib/rate-limit';
import { sendSupportCaseCustomerEmail, sendSupportCaseStaffEmail } from '@/lib/email';
import {
  BODY_MAX,
  SUBJECT_MAX,
  addCustomerReply,
  openCustomerCase,
  validateSupportInput,
  type SupportFormError,
} from '@/lib/support-portal';

/**
 * Raising and replying to a support request, from inside the dashboard.
 *
 * Everything here re-derives the account from the session rather than reading
 * it off the form. A server action is a public HTTP endpoint — a hidden
 * account_id input is a field anybody can post, and the whole account boundary
 * on these tables is a filter in application code (support_cases has RLS
 * enabled with no policy, the /admin table pattern).
 */

// Generous, because the honest case is "everything is broken and I am telling
// you about all of it". This is a flood ceiling, not a usage policy.
const NEW_CASE_LIMIT = 10;
const REPLY_LIMIT = 40;
const WINDOW_SECONDS = 60 * 60;

function back(path: string, error: SupportFormError): never {
  redirect(`${path}?error=${error}`);
}

export async function openSupportCaseAction(formData: FormData) {
  const { accountId, userEmail, supabase } = await requireOfficeContext('leads.read');
  const subject = String(formData.get('subject') ?? '').trim().slice(0, SUBJECT_MAX + 1);
  const body = String(formData.get('body') ?? '').trim().slice(0, BODY_MAX + 1);

  const invalid = validateSupportInput({ subject, body });
  if (invalid) back('/dashboard/help', invalid);

  // No requester email means no way to tell them we answered. The account's
  // login address is the only one we can stand behind, so a session without
  // one is a bug rather than something to paper over with a guess.
  if (!userEmail) back('/dashboard/help', 'failed');

  const admin = createAdminClient();
  if (!(await checkRateLimitStrict(admin, `support:new:${accountId}`, NEW_CASE_LIMIT, WINDOW_SECONDS))) {
    back('/dashboard/help', 'rate');
  }

  const opened = await openCustomerCase(admin, { accountId, requesterEmail: userEmail, subject, body });
  if (!opened) back('/dashboard/help', 'failed');

  const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  const businessName = (account as { business_name?: string | null } | null)?.business_name ?? null;

  // The case is already saved. Email is a notification, not the record, so a
  // provider outage must not lose the request or show the contractor an error
  // for something that worked.
  await notify(() =>
    sendSupportCaseStaffEmail({ kind: 'opened', caseId: opened.id, subject, body, requesterEmail: userEmail, businessName }),
  );
  await notify(() =>
    sendSupportCaseCustomerEmail({ kind: 'received', to: userEmail, caseId: opened.id, subject }),
  );

  revalidatePath('/dashboard/help');
  redirect(`/dashboard/help/${opened.id}?done=opened`);
}

export async function replyToSupportCaseAction(caseId: string, formData: FormData) {
  const { accountId, userEmail, supabase } = await requireOfficeContext('leads.read');
  const body = String(formData.get('body') ?? '').trim().slice(0, BODY_MAX + 1);
  const path = `/dashboard/help/${caseId}`;

  const invalid = validateSupportInput({ body });
  if (invalid) back(path, invalid);
  if (!userEmail) back(path, 'failed');

  const admin = createAdminClient();
  if (!(await checkRateLimitStrict(admin, `support:reply:${accountId}`, REPLY_LIMIT, WINDOW_SECONDS))) {
    back(path, 'rate');
  }

  // Ownership and the closed check both happen inside addCustomerReply, which
  // is the only place they can be trusted — the page having hidden the box
  // proves nothing about what was posted.
  const replied = await addCustomerReply(admin, { accountId, caseId, requesterEmail: userEmail, body });
  if (!replied) back(path, 'not_found');

  const { data: account } = await supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
  const businessName = (account as { business_name?: string | null } | null)?.business_name ?? null;

  await notify(() =>
    sendSupportCaseStaffEmail({
      kind: 'reply',
      caseId: replied.id,
      subject: replied.subject,
      body,
      requesterEmail: userEmail,
      businessName,
    }),
  );

  revalidatePath(path);
  redirect(`${path}?done=replied`);
}

/** Send-and-forget. A failed notification is logged, never surfaced as a
    failure of the thing it was notifying about. */
async function notify(send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (err) {
    console.error('support case notification failed:', err);
  }
}
