'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';

function parseScheduleDayHours(value: FormDataEntryValue | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.min(24, Math.max(1, n));
}

export async function updateScheduleDayHoursAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const scheduleDayHours = parseScheduleDayHours(formData.get('scheduleDayHours'));

  const { error } = await supabase
    .from('accounts')
    .update({ schedule_day_hours: scheduleDayHours })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/schedule');
}

export async function updateReviewSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const autoReviewRequest = formData.get('autoReviewRequest') === 'on';
  const reviewGating = formData.get('reviewGating') === 'on';

  const { error } = await supabase
    .from('accounts')
    .update({ auto_review_request: autoReviewRequest, review_gating_enabled: reviewGating })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
}

export async function updateDepositSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const depositOnApproval = formData.get('depositOnApproval') === 'on';
  const percentRaw = Number(formData.get('depositPercent'));
  const depositPercent = Number.isFinite(percentRaw) ? Math.min(100, Math.max(1, Math.round(percentRaw * 100) / 100)) : 25;

  const { error } = await supabase
    .from('accounts')
    .update({ deposit_on_approval: depositOnApproval, deposit_percent: depositPercent })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
}

export async function updateFollowupSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const quoteFollowups = formData.get('quoteFollowups') === 'on';

  const { error } = await supabase
    .from('accounts')
    .update({ quote_followups_enabled: quoteFollowups })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
}

export async function updateReminderSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const appointmentReminders = formData.get('appointmentReminders') === 'on';

  const { error } = await supabase
    .from('accounts')
    .update({ appointment_reminders_enabled: appointmentReminders })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
}

// Permanently deletes the signed-in owner's account. Removes the account (which
// cascades every child row — jobs, leads, crew, invoices, payments, sites,
// memberships, …) AND the auth user, so the account's phone/email is freed to
// use on another account (the reason someone deletes a duplicate). Irreversible.
export async function deleteAccountAction() {
  const { supabase, accountId, userId } = await requireOwnerContext();
  const admin = createAdminClient();

  // NOTE: SaaS billing subscriptions aren't created yet (stripe_customer_id /
  // subscription_status are dormant). When paid plans land, cancel the Stripe
  // subscription here before deleting so a deleted account stops being billed.
  const { error: accountError } = await admin.from('accounts').delete().eq('id', accountId);
  if (accountError) throw new Error(accountError.message);

  // Only remove the auth user (which frees its phone/email for reuse) if this
  // was their ONLY account — otherwise deleting the user would cascade their
  // membership in every other account too. Best-effort past this point: the
  // account data is already gone, so don't block the redirect on a failure.
  const { count: remainingMemberships } = await admin
    .from('memberships')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (!remainingMemberships) {
    const { error: userError } = await admin.auth.admin.deleteUser(userId);
    if (userError) console.error('deleteAccountAction: deleteUser failed:', userError.message);
  }

  // Clear the now-invalid session cookie locally (no server round-trip — the
  // user no longer exists), then send them to sign in.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  redirect('/login');
}
