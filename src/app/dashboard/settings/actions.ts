'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { updateSite } from '@/lib/sites';
import { mergeSiteContent } from '@/lib/site-content';
import { sendTestDigest } from '@/lib/daily-digest';
import { normalizeEstimatePosture } from '@/lib/estimate-posture';
import {
  normalizeTimezone,
  normalizeBookingWeekdays,
  normalizeBookingWindowTimes,
  normalizeMaxPerDay,
  normalizeLeadDays,
  normalizeWorkdayTime,
  normalizeBufferMinutes,
  DEFAULT_WORKDAY_START,
  DEFAULT_WORKDAY_END,
} from '@/lib/booking-availability';
import { normalizeInstantBookMinAmount, normalizeInstantBookRadiusMiles, normalizeGeoMode } from '@/lib/instant-booking';
import { extraStopSettingsFromAccount, dollarsToCents } from '@/lib/extra-stop';
import { mergeRefundTiers } from '@/lib/extra-stop-refunds';
import { geocodeAddress } from '@/lib/geocode';
import { normalizeUsPhone } from '@/lib/phone';

function parseScheduleDayHours(value: FormDataEntryValue | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.min(24, Math.max(1, n));
}

// Business basics (company name / trade / ZIP) live on the sites row — the same
// fields the Website Builder Setup tab edits — so this and the builder always
// mirror. Company name is a column; trade + ZIP live in the content JSON.
export async function updateBusinessBasicsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const { data: site } = await supabase
    .from('sites')
    .select('id, company_name, content')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) throw new Error('Create your website first to set your business basics.');

  const companyName = (formData.get('companyName') ?? '').toString().trim();
  const trade = (formData.get('trade') ?? '').toString().trim();
  const zip = (formData.get('zip') ?? '').toString().trim();

  const content = mergeSiteContent((site.content as Record<string, unknown>) ?? {}, { trade, zip });
  await updateSite(supabase, accountId, site.id as string, {
    company_name: companyName || (site.company_name as string) || 'My Business',
    content,
  });

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/sites');
}

export async function updateScheduleDayHoursAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const scheduleDayHours = parseScheduleDayHours(formData.get('scheduleDayHours'));
  const workdayStart = normalizeWorkdayTime(formData.get('workdayStart'), DEFAULT_WORKDAY_START);
  const workdayEnd = normalizeWorkdayTime(formData.get('workdayEnd'), DEFAULT_WORKDAY_END);
  const jobBufferMinutes = normalizeBufferMinutes(formData.get('jobBufferMinutes'));

  const { error } = await supabase
    .from('accounts')
    .update({
      schedule_day_hours: scheduleDayHours,
      workday_start: workdayStart,
      workday_end: workdayEnd,
      job_buffer_minutes: jobBufferMinutes,
    })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/schedule');
}

// One-click "turn on the essentials": the safe, high-value automations that work
// with no configuration — review asks, quote follow-ups, appointment reminders,
// and the daily digest. Each still has its own card to tune or turn back off.
export async function enableRecommendedAutomationsAction() {
  const { supabase, accountId } = await requireOwnerContext();
  const { error } = await supabase
    .from('accounts')
    .update({
      auto_review_request: true,
      quote_followups_enabled: true,
      appointment_reminders_enabled: true,
      daily_digest_enabled: true,
    })
    .eq('id', accountId);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard');
}

export async function updateCallTextbackSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const enabled = formData.get('callTextbackEnabled') === 'on';
  const forward = normalizeUsPhone(String(formData.get('callForwardNumber') ?? ''));
  const tracking = normalizeUsPhone(String(formData.get('callTrackingNumber') ?? ''));
  const { error } = await supabase
    .from('accounts')
    .update({ call_textback_enabled: enabled, call_forward_number: forward || null, call_tracking_number: tracking || null })
    .eq('id', accountId);
  if (error) throw new Error('Could not save missed-call settings.');
  revalidatePath('/dashboard/settings');
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

// Extra Stop config. Normalizes every field through the shared builder (feeding
// it a column-shaped row) so the same clamps/guards used everywhere apply here,
// then writes the account columns. Fees arrive in dollars, stored in cents.
export async function updateExtraStopSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();

  const s = extraStopSettingsFromAccount({
    extra_stop_enabled: formData.get('extraStopEnabled') === 'on',
    extra_stop_weekdays: formData.getAll('extraStopWeekday').map(String),
    extra_stop_earliest_time: formData.get('extraStopEarliest'),
    extra_stop_latest_end: formData.get('extraStopLatestEnd'),
    extra_stop_max_per_day: formData.get('extraStopMaxPerDay'),
    extra_stop_max_visit_minutes: formData.get('extraStopMaxVisitMinutes'),
    extra_stop_max_detour_miles: formData.get('extraStopMaxDetourMiles'),
    extra_stop_max_detour_minutes: formData.get('extraStopMaxDetourMinutes'),
    extra_stop_min_fee_cents: dollarsToCents(formData.get('extraStopMinFee')),
    extra_stop_max_fee_cents: dollarsToCents(formData.get('extraStopMaxFee')),
    extra_stop_allow_after_capacity: formData.get('extraStopAllowAfterCapacity') === 'on',
    extra_stop_response_deadline_mins: formData.get('extraStopResponseDeadline'),
    extra_stop_payment_deadline_mins: formData.get('extraStopPaymentDeadline'),
    extra_stop_categories: formData.get('extraStopCategories'),
    extra_stop_required_photos: formData.get('extraStopRequiredPhotos'),
    extra_stop_require_ai_approval: formData.get('extraStopRequireAiApproval') === 'on',
  });

  // Never let the fee band invert (min above max).
  const minFeeCents = Math.min(s.minFeeCents, s.maxFeeCents);
  const maxFeeCents = Math.max(s.minFeeCents, s.maxFeeCents);

  const { error } = await supabase
    .from('accounts')
    .update({
      extra_stop_enabled: s.enabled,
      extra_stop_weekdays: s.weekdays.join(','),
      extra_stop_earliest_time: s.earliestTime,
      extra_stop_latest_end: s.latestEnd,
      extra_stop_max_per_day: s.maxPerDay,
      extra_stop_max_visit_minutes: s.maxVisitMinutes,
      extra_stop_max_detour_miles: s.maxDetourMiles,
      extra_stop_max_detour_minutes: s.maxDetourMinutes,
      extra_stop_min_fee_cents: minFeeCents,
      extra_stop_max_fee_cents: maxFeeCents,
      extra_stop_allow_after_capacity: s.allowAfterCapacity,
      extra_stop_response_deadline_mins: s.responseDeadlineMins,
      extra_stop_payment_deadline_mins: s.paymentDeadlineMins,
      extra_stop_categories: s.categories.join(', '),
      extra_stop_required_photos: s.requiredPhotos,
      extra_stop_require_ai_approval: s.requireAiApproval,
    })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  // Refund tiers live in their own jsonb column; write them separately and
  // tolerate a missing column (pre-migration) so the main save never breaks.
  const tiers = mergeRefundTiers({
    withinGraceMinutes: formData.get('refundGraceMinutes'),
    grace: formData.get('refundGrace'),
    beforeEnRoute: formData.get('refundBeforeEnRoute'),
    afterEnRoute: formData.get('refundAfterEnRoute'),
    afterArrived: formData.get('refundAfterArrived'),
  });
  const { error: tierError } = await supabase.from('accounts').update({ extra_stop_refund_tiers: tiers }).eq('id', accountId);
  if (tierError) console.error('Extra Stop refund tiers save skipped:', tierError.message);

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
