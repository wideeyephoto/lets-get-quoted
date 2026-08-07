'use server';

import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { getAccountOwnerEmail } from '@/lib/email';
import { sendMagicLinkEmail } from '@/lib/magic-link';

/**
 * The same "resend the sign-in link" the account page offers, but it comes back
 * to the list you called it from.
 *
 * Worth its own action rather than reusing the detail-page one, which redirects
 * to /admin/accounts/[id]. Working a list of stuck accounts means doing the same
 * small thing twenty times, and an action that throws you onto a detail page
 * after each one turns twenty clicks into sixty. The `back` argument carries the
 * filter and search terms so you land where you left off.
 */
export async function resendOnboardingFromListAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  // Rebuilt from the submitted query rather than trusted whole: `back` arrives
  // from a form field, and redirecting to an arbitrary caller-supplied string is
  // an open redirect. Only the two parameters this page understands survive.
  const submitted = new URLSearchParams(String(formData.get('back') ?? ''));
  const back = new URLSearchParams();
  const filter = submitted.get('filter');
  const q = submitted.get('q');
  if (filter) back.set('filter', filter);
  if (q) back.set('q', q);

  const ownerEmail = await getAccountOwnerEmail(ctx.admin, accountId);
  if (!ownerEmail) {
    back.set('error', 'no_owner');
    redirect(`/admin/accounts?${back}`);
  }

  await sendMagicLinkEmail(ownerEmail, '/dashboard/settings');
  await logAdminAction(ctx.admin, ctx, {
    action: 'account_resend_onboarding',
    accountId,
    targetType: 'account',
    targetId: accountId,
    meta: { from: 'accounts_list' },
  });

  back.set('done', 'onboarding_resent');
  redirect(`/admin/accounts?${back}`);
}
