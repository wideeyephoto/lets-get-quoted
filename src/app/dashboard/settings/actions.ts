'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { sendTestDigest } from '@/lib/daily-digest';
import { normalizeEstimatePosture } from '@/lib/estimate-posture';
import {
  normalizeTimezone,
  normalizeBookingWeekdays,
  normalizeBookingWindowTimes,
  normalizeMaxPerDay,
  normalizeLeadDays,
} from '@/lib/booking-availability';
import { normalizeInstantBookMinAmount, normalizeInstantBookRadiusMiles, normalizeGeoMode } from '@/lib/instant-booking';
import { geocodeAddress } from '@/lib/geocode';
import { normalizeUsPhone } from '@/lib/phone';

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

export async function updateIntakeSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const estimatePosture = normalizeEstimatePosture(formData.get('estimatePosture'));
  const thresholdRaw = Number(formData.get('highValueLeadAmount'));
  const highValueLeadAmount = Number.isFinite(thresholdRaw) && thresholdRaw > 0 ? Math.round(thresholdRaw) : null;
  const muteLowQualityLeads = formData.get('muteLowQualityLeads') === 'on';
  const highValueSmsEnabled = formData.get('highValueSmsEnabled') === 'on';
  const rawPhone = String(formData.get('alertPhone') ?? '').trim();
  const alertPhone = rawPhone ? normalizeUsPhone(rawPhone) ?? rawPhone : null;

  // Guard the obvious footgun: SMS alerts on with no number to text.
  if (highValueSmsEnabled && !alertPhone) {
    throw new Error('Add your mobile number to get high-value lead texts.');
  }

  const { error } = await supabase
    .from('accounts')
    .update({
      estimate_posture: estimatePosture,
      high_value_lead_amount: highValueLeadAmount,
      mute_low_quality_leads: muteLowQualityLeads,
      high_value_sms_enabled: highValueSmsEnabled,
      alert_phone: alertPhone,
    })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
}

export async function updateBookingAvailabilityAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const timezone = normalizeTimezone(formData.get('timezone'));
  const weekdays = normalizeBookingWeekdays(formData.getAll('bookingWeekday').map(String));
  const windowTimes = normalizeBookingWindowTimes(formData.getAll('bookingWindow').map(String));
  const maxPerDay = normalizeMaxPerDay(formData.get('bookingMaxPerDay'));
  const leadDays = normalizeLeadDays(formData.get('bookingLeadDays'));
  const instantBookEnabled = formData.get('instantBookEnabled') === 'on';
  const instantBookMinAmount = normalizeInstantBookMinAmount(formData.get('instantBookMinAmount'));
  const instantBookRadiusMiles = normalizeInstantBookRadiusMiles(formData.get('instantBookRadius'));
  const instantBookGeoMode = normalizeGeoMode(formData.get('instantBookGeoMode'));
  const instantBookDriveTime = formData.get('instantBookDriveTime') === 'on';

  const { error } = await supabase
    .from('accounts')
    .update({
      timezone,
      booking_weekdays: weekdays.join(','),
      booking_windows: windowTimes,
      booking_max_per_day: maxPerDay,
      booking_lead_days: leadDays,
      instant_book_enabled: instantBookEnabled,
      instant_book_min_amount: instantBookMinAmount,
      instant_book_radius_miles: instantBookRadiusMiles,
      instant_book_geo_mode: instantBookGeoMode,
      instant_book_drive_time: instantBookDriveTime,
    })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/schedule');
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

// CAN-SPAM: the business's physical postal address, printed in the footer of
// every marketing email. Stored as a single free-text block (street, city,
// state, ZIP) so it renders exactly as the owner types it.
export async function updateMailingAddressAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const mailingAddress = String(formData.get('mailingAddress') ?? '').trim() || null;

  // Geocode the business address into the service-area center / cold-start anchor
  // for route-density. Best-effort + precise-only; clears the center if the
  // address was removed or can't be resolved.
  const geo = mailingAddress ? await geocodeAddress(mailingAddress) : null;
  const center = geo?.precise ? { service_center_lat: geo.lat, service_center_lng: geo.lng } : { service_center_lat: null, service_center_lng: null };

  const { error } = await supabase
    .from('accounts')
    .update({ mailing_address: mailingAddress, ...center })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/campaigns');
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

// Opt-in: a once-daily digest email to the owner summarizing their business.
export async function updateDigestSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const dailyDigest = formData.get('dailyDigest') === 'on';

  const { error } = await supabase
    .from('accounts')
    .update({ daily_digest_enabled: dailyDigest })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
}

// Sends the owner a one-off preview of their daily digest so they can see what
// it looks like without waiting for the cron. Throws (surfacing the reason) if
// there's no email on file or the send fails.
export async function sendTestDigestAction() {
  const { supabase, accountId } = await requireOwnerContext();
  const result = await sendTestDigest(supabase, accountId);
  if (!result.ok) throw new Error(result.message);
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
