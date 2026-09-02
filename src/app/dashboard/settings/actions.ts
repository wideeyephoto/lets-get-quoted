'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient, requireOfficeContext, requireOwnerContext } from '@/lib/auth';
import { updateSite } from '@/lib/sites';
import {
  DEFAULT_PORTAL_NAV_LABEL,
  getSiteContent,
  mergeSiteContent,
  portalLinkRemoved,
  PORTAL_NAV_LABEL_MAX,
  type SiteEstimateRangesContent,
  type SiteLeadFiltersContent,
  type SiteQuoteFormContent,
} from '@/lib/site-content';
import { sendTestDigest } from '@/lib/daily-digest';
import { backfillAccount, syncAccount } from '@/lib/quickbooks/sync';
import { deleteInsuranceProof, isInsuranceFile, uploadInsuranceProof } from '@/lib/insurance-storage';
import { normalizeEstimatePosture } from '@/lib/estimate-posture';
import {
  AUTOMATION_COLUMNS,
  AUTOMATION_LABELS,
  automationRequiresDedicatedMessaging,
  isAutomationKey,
  type AutomationKey,
} from '@/lib/automations';
import { requireActiveDedicatedMessagingSender } from '@/lib/messaging-number-provisioning';
import { recordAccountEvent } from '@/lib/account-events';
import { ARRIVAL_WINDOW_CHOICES, DEFAULT_WINDOW_MINUTES } from '@/lib/arrival';
import {
  normalizeTimezone,
  normalizeBookingWeekdays,
  normalizeBookingWindowTimes,
  normalizeWindowMinutes,
  normalizeMaxPerDay,
  normalizeLeadDays,
  normalizeWorkdayTime,
  normalizeBufferMinutes,
  DEFAULT_WORKDAY_START,
  DEFAULT_WORKDAY_END,
} from '@/lib/booking-availability';
import { normalizeInstantBookMinAmount, normalizeInstantBookRadiusMiles, normalizeGeoMode } from '@/lib/instant-booking';
import { quickStopSettingsFromAccount, dollarsToCents } from '@/lib/quick-stop';
import { mergeRefundTiers } from '@/lib/quick-stop-refunds';
import { geocodeAddress } from '@/lib/geocode';
import { normalizeUsPhone } from '@/lib/phone';
import { normalizeReminderHour, normalizeReminderLeadDays } from '@/lib/appointment-reminders';
import { normalizeFollowupChannel, normalizeFollowupDays, normalizeFollowupHour } from '@/lib/quote-followups';
import {
  CHOICE_TEMPLATE_MAX,
  DEFAULT_CHOICE_REMINDER_TEMPLATE,
  choiceReminderPreview,
  choiceScheduleLabel,
  normalizeChoiceOffsets,
  normalizeChoiceReminderHour,
  validateChoiceTemplate,
} from '@/lib/choice-reminders';
import { pickBusinessName } from '@/lib/business-name';
import { APP_ORIGIN } from '@/lib/app-origin';
import {
  getAccountOwnerEmail,
  sendAppointmentReminderEmail,
  sendChoiceReminderTestEmail,
  sendQuoteFollowupEmail,
} from '@/lib/email';

function parseScheduleDayHours(value: FormDataEntryValue | null): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.min(24, Math.max(1, n));
}

// Business basics (company name / trade / ZIP) live on the sites row — the same
// fields the Website Builder Setup tab edits — so this and the builder always
// mirror. Company name is a column; trade + ZIP live in the content JSON.
export async function updateBusinessBasicsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { data: site } = await supabase
    .from('sites')
    .select('id, company_name, content')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) throw new Error('Create your website first to set your business basics.');

  const companyName = (formData.get('companyName') ?? '').toString().trim();
  const trade = (formData.get('trade') ?? '').toString().trim();
  const zip = (formData.get('zip') ?? '').toString().trim();
  const smsSignoff = (formData.get('smsSignoff') ?? '').toString().trim().slice(0, 60);
  const rawReplyTo = (formData.get('replyToEmail') ?? '').toString().trim();

  let replyToEmail: string | null = null;
  if (rawReplyTo) {
    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawReplyTo)) {
      throw new Error('Please enter a valid email address for customer replies.');
    }
    replyToEmail = rawReplyTo.toLowerCase().slice(0, 255);
  }

  const content = mergeSiteContent((site.content as Record<string, unknown>) ?? {}, { trade, zip, smsSignoff });
  await Promise.all([
    updateSite(supabase, accountId, site.id as string, {
      company_name: companyName || (site.company_name as string) || 'My Business',
      content,
    }),
    supabase
      .from('accounts')
      .update({ reply_to_email: replyToEmail })
      .eq('id', accountId),
  ]);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/sites');
  revalidatePath('/dashboard/marketing');
  revalidatePath('/dashboard/marketing/email-theme');
}

/**
 * The two numbers that decide what a job is really worth: what an hour of crew
 * time costs the business, and the margin below which the owner wants telling.
 */
export async function setJobCostingAction(input: { burdenPct: number; minMarginPct: number }) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  // Clamped here rather than trusted from the client: a server action is a
  // public endpoint, so "the caller" is not the form.
  const pct = (value: unknown, max: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 100) / 100)) : 0;
  };

  const { error } = await supabase
    .from('accounts')
    .update({
      default_burden_pct: pct(input.burdenPct, 200),
      min_margin_pct: pct(input.minMarginPct, 100),
    })
    .eq('id', accountId);

  if (error) throw new Error('Could not save job costing.');

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/insights');
}

/**
 * The customer portal switch.
 *
 * Off by default and turned on deliberately: this publishes a page that emails a
 * link to anyone who types a matching address, and that is a decision a
 * contractor makes rather than discovers.
 */
/**
 * The intake tuning that lives in the site content — lead filters, the email
 * field, and what the intake card is called.
 *
 * Moved here from the website builder, where it sat behind three numbered cards
 * on a page about headlines and photos. It is an automation: it decides which
 * leads interrupt you and which quietly sink.
 *
 * Read-modify-write on the branches it owns, so it can never clobber a headline
 * or a section the builder holds. The other direction is guarded by
 * preserveIntakeSettings in the builder's own save.
 */
export async function updateIntakeContentAction(input: {
  leadFilters?: Partial<SiteLeadFiltersContent>;
  emailField?: SiteEstimateRangesContent['emailField'];
  estimateLabel?: SiteQuoteFormContent['estimateLabel'];
  formHeading?: string;
  emailRequired?: boolean;
}) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { data: site } = await supabase
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) throw new Error('Create your website first — this is what your visitors fill in.');

  const stored = (site.content as Record<string, unknown> | null) ?? null;
  const current = getSiteContent(stored);
  const patch: Record<string, unknown> = {};

  if (input.leadFilters) {
    const cleanFilters = { ...input.leadFilters };
    if (cleanFilters.minJobAmount !== undefined) {
      cleanFilters.minJobAmount = Math.max(0, Math.min(1_000_000, Math.round(Number(cleanFilters.minJobAmount) || 0)));
    }
    if (Array.isArray(cleanFilters.exclusions)) {
      cleanFilters.exclusions = cleanFilters.exclusions
        .map((s) => String(s).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 10);
    }
    patch.leadFilters = { ...current.leadFilters, ...cleanFilters };
  }
  if (input.emailField) patch.estimateRanges = { ...current.estimateRanges, emailField: input.emailField };

  const quoteForm: Record<string, unknown> = {};
  if (input.estimateLabel) quoteForm.estimateLabel = input.estimateLabel;
  if (input.formHeading !== undefined) quoteForm.formHeading = input.formHeading.slice(0, 40);
  if (input.emailRequired !== undefined) quoteForm.emailRequired = input.emailRequired;
  // Never write quoteForm.enabled from here. That is which intake runs, and it
  // has its own switch — sending a partial object without it would turn Smart
  // Intake on or off as a side effect of renaming a button.
  if (Object.keys(quoteForm).length > 0) patch.quoteForm = { ...current.quoteForm, ...quoteForm };

  if (Object.keys(patch).length === 0) return;
  await updateSite(supabase, accountId, site.id as string, {
    content: mergeSiteContent(stored ?? {}, patch),
  });

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/sites');
  revalidatePath('/dashboard/automations');
}

/**
 * The past-customer portal's master switch.
 *
 * Its own action rather than a row in AUTOMATION_COLUMNS, because switching it
 * off has to reach further than one column: the "Client Login" link this
 * feature puts in the contractor's site header and footer would otherwise stay
 * on their live website, pointing at a page that tells their customers the
 * lookup isn't switched on. A dead end you advertise yourself is worse than no
 * link at all.
 *
 * The LABEL survives, so switching back on and re-adding the link keeps their
 * wording. Re-adding is deliberate: a link reappearing on a live website
 * because a setting was toggled is a change to their site they didn't make.
 */
export async function toggleClientPortalAction(next: boolean) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { error } = await supabase
    .from('accounts')
    .update({ client_portal_enabled: next })
    .eq('id', accountId);
  if (error) throw new Error(error.message);

  let linkRemoved = false;
  if (!next) {
    const { data: site } = await supabase
      .from('sites')
      .select('id, content')
      .eq('account_id', accountId)
      .maybeSingle();
    if (site) {
      const stored = (site.content as Record<string, unknown> | null) ?? null;
      if (getSiteContent(stored).clientPortal.navEnabled) {
        await updateSite(supabase, accountId, site.id as string, { content: portalLinkRemoved(stored) });
        linkRemoved = true;
      }
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'automation_toggled',
    summary: next
      ? 'Past customer job lookup turned on'
      : `Past customer job lookup turned off${linkRemoved ? ' (login link removed from the website)' : ''}`,
    actorEmail: user?.email ?? null,
    meta: { automation: 'client-portal', column: 'client_portal_enabled', enabled: next, linkRemoved },
  });

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/sites');
}

/**
 * Add or remove the portal link on the contractor's website, and rename it.
 *
 * Writes only the clientPortal branch of the site content, so it can't clobber
 * anything the builder holds — the same read/merge/write boundary used by the
 * other site-content actions on this page.
 */
export async function updatePortalLinkAction(input: { navEnabled: boolean; navLabel: string }) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { data: site } = await supabase
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!site) throw new Error('Create your website first to add a login link to it.');

  const current = getSiteContent((site.content as Record<string, unknown> | null) ?? null);
  const navLabel = String(input.navLabel ?? '').trim().slice(0, PORTAL_NAV_LABEL_MAX);
  const content = mergeSiteContent((site.content as Record<string, unknown>) ?? {}, {
    clientPortal: { navEnabled: Boolean(input.navEnabled), navLabel },
  });
  await updateSite(supabase, accountId, site.id as string, { content });

  // Only the add/remove is worth an audit line. Renaming a link is not a change
  // to what the business does, and a history full of typo corrections buries the
  // entries that matter.
  if (current.clientPortal.navEnabled !== Boolean(input.navEnabled)) {
    const { data: { user } } = await supabase.auth.getUser();
    await recordAccountEvent({
      accountId,
      kind: 'automation_toggled',
      summary: input.navEnabled
        ? `Customer login link added to the website ("${navLabel || DEFAULT_PORTAL_NAV_LABEL}")`
        : 'Customer login link removed from the website',
      actorEmail: user?.email ?? null,
      meta: { automation: 'client-portal-link', enabled: Boolean(input.navEnabled), navLabel },
    });
  }

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/sites');
}

export async function updateScheduleDayHoursAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
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
  // The panel now lives on these two, so they have to be cleared as well.
  revalidatePath('/dashboard/schedule/plan');
}

// Flips one automation on or off straight from the Automations list. Touches only
// that automation's own column, so it can never clobber the rest of the card's
// settings the way re-submitting a partial form would.
export async function toggleAutomationAction(key: AutomationKey, next: boolean) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  if (!isAutomationKey(key)) throw new Error('Unknown automation.');
  // Turning off must always remain possible. Turning on an automation that can
  // originate customer SMS requires the same exact inventory evidence as a
  // manual send; a feature flag is not proof that the workspace has a sender.
  if (next && automationRequiresDedicatedMessaging(key)) {
    await requireActiveDedicatedMessagingSender(accountId);
  }
  const { error } = await supabase
    .from('accounts')
    .update({ [AUTOMATION_COLUMNS[key]]: next })
    .eq('id', accountId);
  if (error) throw new Error(error.message);

  // Audit AFTER the write succeeds, and never let it fail the change itself.
  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'automation_toggled',
    summary: `${AUTOMATION_LABELS[key]} turned ${next ? 'on' : 'off'}`,
    actorEmail: user?.email ?? null,
    meta: { automation: key, column: AUTOMATION_COLUMNS[key], enabled: next },
  });

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/automations');
  revalidatePath('/dashboard');
}

// One-click "turn on the essentials": the safe, high-value automations that work
// with no configuration — review asks, quote follow-ups, appointment reminders,
// and the daily digest. Each still has its own card to tune or turn back off.
export async function enableRecommendedAutomationsAction() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  // Three of the four recommended switches originate customer texts. Without
  // a prepared/on split in the current schema, reject the whole atomic preset
  // rather than claiming those automations are active while delivery is dark.
  await requireActiveDedicatedMessagingSender(accountId);
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
  revalidatePath('/dashboard/automations');
  revalidatePath('/dashboard');
}

/**
 * The two phone numbers behind missed-call text-back. Auto-saved.
 *
 * The on/off switch is NOT here — it's the card's own toggle, through
 * toggleAutomationAction. There used to be a checkbox as well, and two controls
 * for one boolean means one of them is always about to be wrong.
 *
 * Changing the tracking number clears call_tracking_verified_at: the proof was
 * about the OLD number, and carrying a green "connected" across to a number
 * nobody has ever called is exactly the false reassurance the column exists to
 * prevent.
 */
export async function updateMissedCallNumbersAction(input: { forward: string; tracking: string }) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const forward = normalizeUsPhone(String(input.forward ?? '')) || null;
  const tracking = normalizeUsPhone(String(input.tracking ?? '')) || null;

  const { data: current } = await supabase
    .from('accounts')
    .select('call_tracking_number')
    .eq('id', accountId)
    .maybeSingle();

  const patch: Record<string, unknown> = { call_forward_number: forward, call_tracking_number: tracking };
  if ((current?.call_tracking_number ?? null) !== tracking) patch.call_tracking_verified_at = null;

  const { error } = await supabase.from('accounts').update(patch).eq('id', accountId);
  if (error) {
    // The unique index on call_tracking_number. Worth naming, because the
    // alternative is a contractor retyping a number that will never be theirs.
    if (error.code === '23505') throw new Error('That tracking number is already in use on another account.');
    throw new Error('Could not save missed-call settings.');
  }
  revalidatePath('/dashboard/settings');
}

/**
 * Where the review ask points: the "how did we go?" page, or Google directly.
 * Auto-saved.
 *
 * Does NOT touch auto_review_request. That column is the card's own switch, and
 * it used to ALSO be a checkbox inside this form — two controls for one boolean,
 * which meant flipping the switch left a stale checkbox sitting under it that
 * would put the switch straight back on the next save.
 */
export async function setReviewFeedbackPageAction(next: boolean) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { error } = await supabase
    .from('accounts')
    .update({ review_feedback_page_enabled: next })
    .eq('id', accountId);
  if (error) throw new Error('Could not save review settings.');
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/automations');
}

/**
 * Intake tuning. It no longer owns the owner's phone number, and it must not.
 *
 * WHAT WOULD HAVE HAPPENED IF THESE TWO LINES HAD STAYED. This used to read
 * `highValueSmsEnabled` and `alertPhone` out of the form and write both to
 * accounts. The fields moved to the texting-setup dialog on /dashboard/messages
 * — so this form stopped submitting them, `formData.get` started returning
 * null, and an unchecked checkbox is indistinguishable from an absent one:
 * every save of "estimate pricing posture" would have silently cleared the
 * owner's mobile number and switched their lead alerts off. A destructive write
 * dressed as a no-op, on a form about something else entirely.
 *
 * The rule that keeps this from recurring: an update statement may only name
 * columns whose inputs this form actually renders.
 */
export async function updateIntakeSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const estimatePosture = normalizeEstimatePosture(formData.get('estimatePosture'));
  const thresholdRaw = Number(formData.get('highValueLeadAmount'));
  const highValueLeadAmount =
    Number.isFinite(thresholdRaw) && thresholdRaw > 0
      ? Math.min(1_000_000, Math.max(1, Math.round(thresholdRaw)))
      : null;
  const muteLowQualityLeads = formData.get('muteLowQualityLeads') === 'on';

  const { error } = await supabase
    .from('accounts')
    .update({
      estimate_posture: estimatePosture,
      high_value_lead_amount: highValueLeadAmount,
      mute_low_quality_leads: muteLowQualityLeads,
    })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/automations');
}

export async function updateBookingAvailabilityAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const timezone = normalizeTimezone(formData.get('timezone'));
  const weekdays = normalizeBookingWeekdays(formData.getAll('bookingWeekday').map(String));
  const windowTimes = normalizeBookingWindowTimes(formData.getAll('bookingWindow').map(String));
  // Absent means "this form doesn't edit the length" (the older settings screen),
  // not "set it to the default" — reading a missing field as 240 would silently
  // reset an owner's chosen window every time they saved from the other page.
  const rawWindowMinutes = formData.get('bookingWindowMinutes');
  const windowMinutes = rawWindowMinutes === null ? null : normalizeWindowMinutes(rawWindowMinutes);
  const maxPerDay = normalizeMaxPerDay(formData.get('bookingMaxPerDay'));
  const leadDays = normalizeLeadDays(formData.get('bookingLeadDays'));
  const instantBookEnabled = formData.get('instantBookEnabled') === 'on';
  const instantBookMinAmount = normalizeInstantBookMinAmount(formData.get('instantBookMinAmount'));
  const instantBookRadiusMiles = normalizeInstantBookRadiusMiles(formData.get('instantBookRadius'));
  const instantBookGeoMode = normalizeGeoMode(formData.get('instantBookGeoMode'));
  const instantBookDriveTime = formData.get('instantBookDriveTime') === 'on';
  // The master switch. It was readable but never writable from this action, so
  // the only way to pause online booking was to clear every weekday.
  const bookingEnabled = formData.get('bookingEnabled') !== 'off';

  const { error } = await supabase
    .from('accounts')
    .update({
      booking_enabled: bookingEnabled,
      timezone,
      booking_weekdays: weekdays.join(','),
      booking_windows: windowTimes,
      ...(windowMinutes === null ? {} : { booking_window_minutes: windowMinutes }),
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
  revalidatePath('/dashboard/schedule/booking');
}

// Quick Stop config. Normalizes every field through the shared builder (feeding
// it a column-shaped row) so the same clamps/guards used everywhere apply here,
// then writes the account columns. Fees arrive in dollars, stored in cents.
export async function updateQuickStopSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const s = quickStopSettingsFromAccount({
    extra_stop_enabled: formData.get('quickStopEnabled') === 'on',
    extra_stop_weekdays: formData.getAll('quickStopWeekday').map(String),
    extra_stop_earliest_time: formData.get('quickStopEarliest'),
    extra_stop_latest_end: formData.get('quickStopLatestEnd'),
    extra_stop_max_per_day: formData.get('quickStopMaxPerDay'),
    extra_stop_max_visit_minutes: formData.get('quickStopMaxVisitMinutes'),
    extra_stop_max_detour_miles: formData.get('quickStopMaxDetourMiles'),
    extra_stop_max_detour_minutes: formData.get('quickStopMaxDetourMinutes'),
    extra_stop_min_fee_cents: dollarsToCents(formData.get('quickStopMinFee')),
    extra_stop_max_fee_cents: dollarsToCents(formData.get('quickStopMaxFee')),
    // ALWAYS ON, for the same reason the checkbox is gone: a Quick Stop is a
    // paid squeeze-in on a day that is otherwise full. Turning this off leaves
    // the feature switched on but unable to do the thing it exists for, and
    // nothing on screen would explain why no requests were coming through. Max
    // Quick Stops per day is the control that actually limits volume.
    extra_stop_allow_after_capacity: true,
    extra_stop_response_deadline_mins: formData.get('quickStopResponseDeadline'),
    extra_stop_payment_deadline_mins: formData.get('quickStopPaymentDeadline'),
    extra_stop_categories: formData.get('quickStopCategories'),
    extra_stop_required_photos: formData.get('quickStopRequiredPhotos'),
    extra_stop_days_ahead: formData.get('quickStopDaysAhead'),
    // ALWAYS ON. This used to be a checkbox the contractor could clear, which
    // meant an account could offer same-day, pre-paid, sight-unseen visits with
    // nothing screening out complex, unsafe or out-of-scope work. That is not a
    // preference, so it is no longer offered as one. The setting stays in the
    // column (and in quick-stop-qualify) so nothing downstream changes shape.
    extra_stop_require_ai_approval: true,
  });

  // Never let the fee band invert (min above max).
  const minFeeCents = Math.min(s.minFeeCents, s.maxFeeCents);
  const maxFeeCents = Math.max(s.minFeeCents, s.maxFeeCents);

  // THE MASTER SWITCH IS NOT PART OF THIS FORM ANYMORE, and absence has to mean
  // "leave it alone" rather than "off". An unchecked checkbox and a field that
  // was never rendered are indistinguishable in FormData, so a settings save
  // from a form without it would have quietly switched Quick Stop off. The
  // switch lives on the Automations card and on this page's own status header.
  const enabledField = formData.has('quickStopEnabled');

  const { error } = await supabase
    .from('accounts')
    .update({
      ...(enabledField ? { extra_stop_enabled: s.enabled } : {}),
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
      extra_stop_days_ahead: s.daysAhead,
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
  if (tierError) console.error('Quick Stop refund tiers save skipped:', tierError.message);

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/schedule');
}

export async function updateDepositSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
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

// updateFollowupSettingsAction is gone. It wrote quote_followups_enabled and
// nothing else — the same single column as the card's own switch, through
// toggleAutomationAction. A second way to write one boolean is a second way for
// it to be wrong: the checkbox rendered from a stale value, so pressing Save
// could undo a switch flipped a moment earlier.

// The two addresses a business has, saved together because they are one form.
//
// They used to be one field doing both jobs. CAN-SPAM wants a physical postal
// address in the footer of every marketing email, and a PO box satisfies that
// perfectly — while the same string was being geocoded into the point Plan my
// day measures the drive out and back from. A PO box has no driveway, so a
// contractor doing the sensible thing for their post quietly broke their route.
//
// Operating location wins the geocode when it is set; the mailing address is
// only the fallback, which is what keeps every existing account exactly where
// it was until somebody fills the new field in.
export async function updateBusinessAddressesAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  // The fields are autocompletes now, which yield one line. Older values were
  // typed into a textarea and can carry newlines; collapse them so the footer
  // renders on one line and the geocoder gets a clean single-line query.
  const clean = (value: FormDataEntryValue | null) =>
    String(value ?? '')
      .replace(/\s*\n\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*,\s*/g, ', ')
      .trim() || null;
  const mailingAddress = clean(formData.get('mailingAddress'));
  const operatingAddress = clean(formData.get('operatingAddress'));

  // Geocode the address the day is actually driven from into the service-area
  // center / cold-start anchor for route-density. Best-effort + precise-only;
  // clears the center if both addresses were removed or can't be resolved.
  const anchor = operatingAddress ?? mailingAddress;
  const geo = anchor ? await geocodeAddress(anchor) : null;
  const center = geo?.precise ? { service_center_lat: geo.lat, service_center_lng: geo.lng } : { service_center_lat: null, service_center_lng: null };

  const { error } = await supabase
    .from('accounts')
    .update({ mailing_address: mailingAddress, operating_address: operatingAddress, ...center })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  // The mailing address gates every marketing send, and the merged Marketing
  // page warns about it before you write — so that page has to re-read it.
  revalidatePath('/dashboard/marketing');
}

/**
 * WHEN reminders go out — not WHETHER.
 *
 * The card used to carry a checkbox that wrote appointment_reminders_enabled,
 * duplicating the switch in its own header: two controls for one boolean, which
 * could disagree until you saved. The switch is the only enablement control
 * now, and this form owns the schedule instead.
 */
export async function updateReminderSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const { error } = await supabase
    .from('accounts')
    .update({
      appointment_reminder_lead_days: normalizeReminderLeadDays(formData.get('reminderLeadDays')),
      appointment_reminder_hour: normalizeReminderHour(formData.get('reminderHour')),
    })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  // The schedule page tells the owner whether tomorrow's jobs will be reminded.
  revalidatePath('/dashboard/schedule');
}

/**
 * Send the owner the reminder their own customers would get.
 *
 * Goes to the account email rather than the owner's mobile: a test that needs a
 * verified, opted-in mobile on file would fail for most people the first time
 * they pressed it, and "it didn't arrive" is the worst possible answer from a
 * button whose entire job is to prove delivery works.
 *
 * The body is appointmentReminderText — the same function the real send uses —
 * so this proves the actual message, not a rehearsal of it.
 */
export async function sendReminderTestAction() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const admin = createAdminClient();

  const ownerEmail = await getAccountOwnerEmail(admin, accountId);
  if (!ownerEmail) throw new Error('No account email to send a test to.');

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = site?.company_name || account?.business_name || 'Your business';

  await sendAppointmentReminderEmail({
    recipientEmail: ownerEmail,
    businessName,
    clientName: 'there',
    whenLabel: 'tomorrow at 10:00 AM',
    address: null,
    jobRef: 'TEST',
    accountId,
  });

  revalidatePath('/dashboard/settings');
}

/**
 * WHEN quote follow-ups go out and how — not WHETHER.
 *
 * The switch in the card header owns whether, the same split appointment
 * reminders uses. This form owns the schedule, the send hour, the channel and
 * the weekend rule; none of them existed before, so a contractor selling $200
 * drain clears and one selling $40k roofs chased on identical days.
 *
 * The three day fields are read as one array. An empty second or third field is
 * "don't send that one", which is why the schedule can be one, two or three
 * nudges rather than always the maximum — normalizeFollowupDays then sorts and
 * de-duplicates, so a schedule typed out of order is still the schedule the
 * owner meant.
 */
export async function updateFollowupSettingsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const days = ['followupDay1', 'followupDay2', 'followupDay3']
    .map((field) => formData.get(field))
    .filter((value) => value !== null && String(value).trim() !== '' && String(value) !== 'off');

  const { error } = await supabase
    .from('accounts')
    .update({
      quote_followup_days: normalizeFollowupDays(days),
      quote_followup_hour: normalizeFollowupHour(formData.get('followupHour')),
      quote_followup_channel: normalizeFollowupChannel(formData.get('followupChannel')),
      quote_followup_skip_weekends: formData.get('followupSkipWeekends') === 'on',
    })
    .eq('id', accountId);

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
  // The jobs page carries the on/off pill for this automation.
  revalidatePath('/dashboard/jobs');
}

/**
 * WHEN choice reminders go out and WHAT they say — not WHETHER.
 *
 * The switch in the card header owns whether, the same split appointment
 * reminders and quote follow-ups use. There is deliberately no second
 * enablement control anywhere in this form: two controls for one boolean means
 * one of them is always about to be wrong, and the Review requests card carried
 * exactly that pair until it was found rendering from a stale value and turning
 * the automation back on when you pressed Save.
 *
 * Returns a result rather than throwing on a bad template, because "you left out
 * {link}" is something the contractor can fix in the box in front of them and a
 * thrown server action gives them nowhere to read it.
 */
export async function updateChoiceReminderSettingsAction(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const offsets = ['choiceOffset1', 'choiceOffset2', 'choiceOffset3']
    .map((field) => formData.get(field))
    .filter((value) => value !== null && String(value).trim() !== '' && String(value) !== 'off');

  // An empty box means "use the default wording", not "send a blank text" — the
  // column is nullable for exactly that distinction. Anything else has to pass
  // validation, and the only rule that really bites is {link}: a reminder
  // telling somebody they owe a decision, with no way to reach it, is worse than
  // no reminder.
  const raw = String(formData.get('choiceTemplate') ?? '').trim();
  let template: string | null = null;
  if (raw && raw !== DEFAULT_CHOICE_REMINDER_TEMPLATE) {
    const check = validateChoiceTemplate(raw);
    if (!check.ok) return { ok: false, message: check.message };
    template = raw.slice(0, CHOICE_TEMPLATE_MAX);
  }

  const { error } = await supabase
    .from('accounts')
    .update({
      selection_reminder_offsets: normalizeChoiceOffsets(offsets),
      selection_reminder_hour: normalizeChoiceReminderHour(formData.get('choiceHour')),
      selection_reminder_template: template,
    })
    .eq('id', accountId);
  if (error) return { ok: false, message: 'Could not save your choice reminder settings.' };

  const { data: { user } } = await supabase.auth.getUser();
  await recordAccountEvent({
    accountId,
    kind: 'automation_settings_changed',
    summary: `Choice reminders set to ${choiceScheduleLabel(normalizeChoiceOffsets(offsets)).toLowerCase()}${
      template ? ', with custom wording' : ''
    }`,
    actorEmail: user?.email ?? null,
    meta: { automation: 'selections', offsets: normalizeChoiceOffsets(offsets), custom_template: Boolean(template) },
  });

  revalidatePath('/dashboard/settings');
  // The job page shows the board's own "next reminder" line.
  revalidatePath('/dashboard/jobs');
  return { ok: true };
}

/**
 * Send the owner the choice reminder their own customers would get.
 *
 * Goes to the account email for the same reason the reminder and follow-up tests
 * do: a test that needs a verified, opted-in mobile on file would fail for most
 * people the first time they pressed it, and "it didn't arrive" is the worst
 * possible answer from a button whose whole job is to prove delivery works.
 *
 * The body is built by choiceReminderText from the CURRENTLY SAVED template, so
 * the test proves the real message. It reads the template back from the database
 * rather than taking it from the form: a test of unsaved wording would tell a
 * contractor their customers are getting something they are not.
 */
export async function sendChoiceReminderTestAction(): Promise<{ ok: boolean; message: string }> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const admin = createAdminClient();

  const ownerEmail = await getAccountOwnerEmail(admin, accountId);
  if (!ownerEmail) return { ok: false, message: 'No account email to send a test to.' };

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase
      .from('accounts')
      .select('business_name, selection_reminder_template')
      .eq('id', accountId)
      .maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);

  try {
    await sendChoiceReminderTestEmail({
      recipientEmail: ownerEmail,
      businessName,
      message: choiceReminderPreview({
        businessName,
        template: (account?.selection_reminder_template as string | null) ?? null,
      }),
      accountId,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not send the test.' };
  }

  revalidatePath('/dashboard/settings');
  return { ok: true, message: `Sent to ${ownerEmail}.` };
}

/**
 * Send the owner the follow-up their own customers would get.
 *
 * Goes to the account email for the same reason the reminder test does: a test
 * that needs a verified, opted-in mobile on file would fail for most people the
 * first time they pressed it, and "it didn't arrive" is the worst possible
 * answer from a button whose whole job is to prove delivery works.
 *
 * sendQuoteFollowupEmail builds its subject and body from
 * quoteFollowupEmailPreview — the same function the card previews — so this
 * proves the actual message rather than a rehearsal of it.
 */
export async function sendFollowupTestAction() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const admin = createAdminClient();

  const ownerEmail = await getAccountOwnerEmail(admin, accountId);
  if (!ownerEmail) throw new Error('No account email to send a test to.');

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = pickBusinessName(site, account);

  await sendQuoteFollowupEmail({
    recipientEmail: ownerEmail,
    businessName,
    clientName: 'there',
    // A real, resolvable page rather than a dead example link: the point of the
    // test is that the whole message works, and the button is most of it.
    url: `${APP_ORIGIN}/dashboard/jobs`,
    accountId,
  });

  revalidatePath('/dashboard/settings');
}

// Opt-in: a once-daily digest email to the owner summarizing their business.
// updateDigestSettingsAction is gone. It wrote the same column as
// toggleAutomationAction('daily-digest') but without the audit event, so the
// digest could be changed in a way the settings history never saw. A server
// action is a public endpoint, and one that quietly bypasses an audit trail is
// worth deleting rather than leaving unreferenced.

// Sends the owner a one-off preview of their daily digest so they can see what
// it looks like without waiting for the cron. Throws (surfacing the reason) if
// there's no email on file or the send fails.
export async function sendTestDigestAction() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const result = await sendTestDigest(supabase, accountId);
  if (!result.ok) throw new Error(result.message);
  revalidatePath('/dashboard/settings');
}

// Requests closure and processes durable closure job immediately
export async function deleteAccountAction() {
  const { supabase, accountId, userId, userEmail } = await requireOwnerContext();
  const admin = createAdminClient();

  const { data: acct } = await admin
    .from('accounts')
    .select('stripe_customer_id, quickbooks_realm_id')
    .eq('id', accountId)
    .maybeSingle();

  const { requestAccountClosure, processClosureJob, buildProductionClosureAdapters } = await import(
    '@/lib/account-closure-orchestrator'
  );

  // Durable account closure replaces legacy direct from('accounts').delete()
  const { jobId } = await requestAccountClosure(admin, {
    accountId,
    requestedByUserId: userId,
    requestedByRole: 'owner',
    vendorHandles: {
      stripeCustomerId: (acct as { stripe_customer_id?: string })?.stripe_customer_id ?? null,
      quickbooksRealmId: (acct as { quickbooks_realm_id?: string })?.quickbooks_realm_id ?? null,
      storageFolderPrefix: accountId,
      ownerUserIds: [userId],
    },
  });

  const adapters = buildProductionClosureAdapters(admin);
  const result = await processClosureJob(admin, jobId, adapters);
  if (!result.success) {
    console.error('Customer deleteAccountAction closure saga completed with errors:', result.errors);
  }

  // Clear session locally and redirect to login
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  redirect('/login?closed=1');
}

// The on/off switch on its own, for the Plan my day panel.
//
// Deliberately narrow: it flips one boolean and touches nothing else. Reusing
// updateQuickStopSettingsAction would mean the day page posting a whole config
// form, and any field it failed to include would be silently reset to a default.
const QUICK_STOP_TOGGLE_SOURCE: Record<string, string> = {
  plan_my_day: 'Plan my day',
  extra_stops_page: 'the Quick Stops page',
};

export async function setQuickStopEnabledAction(enabled: boolean, source = 'plan_my_day') {
  const { supabase, accountId, userEmail } = await requireOfficeContext('settings.write');

  const { error } = await supabase.from('accounts').update({ extra_stop_enabled: enabled }).eq('id', accountId);
  if (error) throw new Error(error.message);

  // Turning this off stops money arriving, so it goes in the same audit trail
  // as every other automation switch rather than happening quietly. WHERE it was
  // switched is part of the record — the switch now exists in two places, and an
  // audit line that names the wrong one is worse than one that names none.
  await recordAccountEvent({
    accountId,
    kind: 'automation_toggled',
    summary: `Quick Stop turned ${enabled ? 'on' : 'off'} from ${QUICK_STOP_TOGGLE_SOURCE[source] ?? source}.`,
    actorEmail: userEmail,
    meta: { automation: 'extra-stop', enabled, source },
  });

  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/schedule/plan');
  revalidatePath('/dashboard/quick-stops');
}

/**
 * The arrival window, saved on its own the moment it's picked.
 *
 * The only setting left on that card. Everything else it used to carry — the
 * exact-time mode, map precision, link duration, the location-sharing policy,
 * the editable message template — had a control and no decision behind it: one
 * answer is right for essentially every contractor, and the wrong answer is
 * quietly harmful. They are fixed in code now (see ARRIVAL_MODE, MAP_PRECISION,
 * TRACKING_LINK_HOURS) and their columns are kept but unread.
 *
 * Validated here rather than trusted from the browser. This value is what a
 * customer is PROMISED, and a stray one turns every arrival window in the
 * account into nonsense.
 */
export async function updateArrivalWindowAction(minutes: number): Promise<void> {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const chosen = (ARRIVAL_WINDOW_CHOICES as readonly number[]).includes(Math.round(minutes))
    ? Math.round(minutes)
    : DEFAULT_WINDOW_MINUTES;

  const { error } = await supabase
    .from('accounts')
    .update({ arrival_window_minutes: chosen })
    .eq('id', accountId);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/settings');
}

// The two optional arrival behaviors, which are not part of the core card.
// A morning text to today's customers and clocking drive time are separate
// decisions about different things — one is a send, one is job costing — and
// putting them beside the window width made a simple screen look complicated.
export async function updateArrivalExtrasAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const { error } = await supabase
    .from('accounts')
    .update({
      arrival_morning_confirmation: formData.get('morningConfirmation') === 'on',
      arrival_clock_travel: formData.get('clockTravel') === 'on',
    })
    .eq('id', accountId);

  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/settings');
}

/**
 * Send everything outstanding to QuickBooks now.
 *
 * The nightly sweep does this on its own; this exists because "did it work"
 * is a question somebody asks the moment after they connect, and waiting until
 * tomorrow morning to find out is not an answer.
 *
 * The result is carried back in the URL rather than thrown, because a failed
 * sync is a normal state of the world — an expired token, an invoice carrying
 * sales tax — and none of those deserve an error page.
 */
export async function syncQuickBooksAction() {
  const { accountId } = await requireOfficeContext('settings.write');
  const summary = await syncAccount(accountId);
  revalidatePath('/dashboard/settings');
  redirect(`/dashboard/settings?quickbooks=${summary.ok ? 'synced' : 'sync-failed'}#quickbooks`);
}

/**
 * Send the invoices from BEFORE the cutoff as well.
 *
 * Linking QuickBooks only sends work from that day forward, because a
 * contractor who has been doing their books by hand already has the older ones
 * in there and a second copy is theirs to clean up, not ours. This is how
 * somebody asks for the history anyway.
 *
 * One way. Everything it creates is in their real books and nothing here can
 * take it back out.
 */
export async function backfillQuickBooksAction() {
  const { accountId } = await requireOfficeContext('settings.write');
  const summary = await backfillAccount(accountId);
  revalidatePath('/dashboard/settings');
  redirect(`/dashboard/settings?quickbooks=${summary.ok ? 'synced' : 'sync-failed'}#quickbooks`);
}

/**
 * The certificate of insurance, and what quotes say about it.
 *
 * One action for the file and the details together, because they are one
 * decision — uploading a renewal without moving the expiry date forward would
 * leave a current certificate that stops going out on the old date.
 */
export async function updateInsuranceAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const text = (key: string, max: number): string | null => {
    const value = (formData.get(key) ?? '').toString().trim();
    return value ? value.slice(0, max) : null;
  };

  // "1,000,000", "$1,000,000" and "1000000" are all the same answer.
  const rawCoverage = (formData.get('coverageAmount') ?? '').toString().replace(/[^\d.]/g, '');
  const coverage = rawCoverage ? Number(rawCoverage) : NaN;

  const expires = (formData.get('expiresOn') ?? '').toString().trim();

  const patch: Record<string, unknown> = {
    insurance_carrier: text('carrier', 120),
    insurance_policy_number: text('policyNumber', 80),
    insurance_coverage_amount: Number.isFinite(coverage) && coverage > 0 ? coverage : null,
    insurance_expires_on: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null,
    insurance_show_on_quotes: formData.get('showOnQuotes') === 'on',
  };

  const file = formData.get('certificate');
  if (isInsuranceFile(file)) {
    const { data: existing } = await supabase
      .from('accounts')
      .select('insurance_path')
      .eq('id', accountId)
      .maybeSingle();

    // Upload BEFORE removing the old one. If the new upload fails, the
    // contractor still has a certificate on their quotes rather than none.
    const uploaded = await uploadInsuranceProof(accountId, file);
    patch.insurance_path = uploaded.path;
    patch.insurance_filename = uploaded.filename;
    patch.insurance_uploaded_at = new Date().toISOString();

    const previous = (existing as { insurance_path?: string | null } | null)?.insurance_path ?? null;
    if (previous && previous !== uploaded.path) await deleteInsuranceProof(accountId, previous);
  }

  const { error } = await supabase.from('accounts').update(patch).eq('id', accountId);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/settings');
}

/** Take the certificate down. Quotes stop carrying it immediately. */
export async function removeInsuranceAction() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { data } = await supabase.from('accounts').select('insurance_path').eq('id', accountId).maybeSingle();
  await deleteInsuranceProof(accountId, (data as { insurance_path?: string | null } | null)?.insurance_path ?? null);
  await supabase
    .from('accounts')
    .update({
      insurance_path: null,
      insurance_filename: null,
      insurance_uploaded_at: null,
    })
    .eq('id', accountId);
  revalidatePath('/dashboard/settings');
}

/**
 * Whether this contractor's customers may change their own optional extras
 * after approving.
 *
 * Off by default and turned on deliberately: the same control that lets
 * somebody add the gate lets them drop the pressure-washing, possibly off
 * materials already bought. Everything about when the window shuts is decided
 * server-side at the moment of the write — see lib/quote-options.
 */
export async function setClientQuoteChangesAction(next: boolean) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');

  const { error } = await supabase
    .from('accounts')
    .update({ client_quote_changes: next === true })
    .eq('id', accountId);

  if (error) throw new Error('Could not save that setting.');

  revalidatePath('/dashboard/settings');
}

export async function chooseGoogleLsaCustomerAction(formData: FormData) {
  const { accountId } = await requireOwnerContext();
  const customerId = String(formData.get('customerId') ?? '').trim();
  if (!customerId) throw new Error('Choose a Google Ads customer account.');

  const { chooseGoogleLsaCustomer } = await import('@/lib/google-lsa/connection');
  const selected = await chooseGoogleLsaCustomer(accountId, customerId);
  revalidatePath('/dashboard/settings');
  redirect(`/dashboard/settings?google_lsa=${selected ? 'selected' : 'invalid-customer'}#google-local-services`);
}

export async function syncGoogleLsaAction() {
  const { accountId } = await requireOfficeContext('settings.write');
  const { syncGoogleLsaAccount } = await import('@/lib/google-lsa/sync');
  const summary = await syncGoogleLsaAccount(accountId);
  revalidatePath('/dashboard/settings');
  redirect(`/dashboard/settings?google_lsa=${summary.busy ? 'busy' : summary.ok ? 'synced' : 'sync-failed'}#google-local-services`);
}

export async function updateNavBrandingAction(contractorLogoTop: boolean) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { data: site } = await supabase
    .from('sites')
    .select('id, content')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!site) throw new Error('No site found for your account.');

  const existingContent = (site.content as Record<string, unknown> | null) || {};
  const nextContent = { ...existingContent, navLogoTop: Boolean(contractorLogoTop) };

  const { error } = await supabase
    .from('sites')
    .update({ content: nextContent })
    .eq('id', site.id);

  if (error) throw new Error('Could not update navigation branding.');

  revalidatePath('/dashboard', 'layout');
  revalidatePath('/dashboard/settings');
  return { ok: true, navLogoTop: Boolean(contractorLogoTop) };
}

export async function uploadContractorLogoAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const file = formData.get('logo') as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new Error('Please select an image file to upload.');
  }

  const { uploadSiteImage } = await import('@/lib/site-image-storage');
  const uploaded = await uploadSiteImage(accountId, file);

  const { error } = await supabase
    .from('sites')
    .update({ logo_url: uploaded.url })
    .eq('account_id', accountId);

  if (error) throw new Error('Could not save logo to your account.');

  revalidatePath('/dashboard', 'layout');
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/sites');
  return { ok: true, logoUrl: uploaded.url };
}

export async function removeContractorLogoAction() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const { error } = await supabase
    .from('sites')
    .update({ logo_url: null })
    .eq('account_id', accountId);

  if (error) throw new Error('Could not remove logo.');

  revalidatePath('/dashboard', 'layout');
  revalidatePath('/dashboard/settings');
  revalidatePath('/dashboard/sites');
  return { ok: true };
}


