import type { ReactNode } from 'react';
import Link from 'next/link';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { aiVoiceEnabled } from '@/lib/voice/admission';
import { loadVoiceEntitlement } from '@/lib/voice/entitlement';
import { loadDedicatedMessagingReadiness } from '@/lib/messaging-number-provisioning';
import { loadVoiceRouteReadiness } from '@/lib/voice/route-readiness';
import { pickBusinessName } from '@/lib/business-name';
import { listAccountEvents } from '@/lib/account-events';
import SaveButton from '@/components/save-button';
import AutomationSwitch from '@/components/automation-switch';
import ArrivalSettingsSection from '../settings/ArrivalSettingsSection';
import ArrivalExtrasSection from '../settings/ArrivalExtrasSection';
import ChoiceRemindersSection from '../settings/ChoiceRemindersSection';
import ClientPortalSection from '../settings/ClientPortalSection';
import IntakeContentSection from '../settings/IntakeContentSection';
import MissedCallSection from '../settings/MissedCallSection';
import ReviewRequestSection from '../settings/ReviewRequestSection';
import IntakePreviewModal from '../sites/IntakePreviewModal';
import OpenAnchoredCard from './OpenAnchoredCard';
import OutgoingTextCatalogue from './OutgoingTextCatalogue';
import AutomationTestSend from './AutomationTestSend';
import {
  enableRecommendedAutomationsAction,
  sendFollowupTestAction,
  sendReminderTestAction,
  sendTestDigestAction,
  toggleAutomationAction,
  toggleClientPortalAction,
  updateFollowupSettingsAction,
  updateIntakeSettingsAction,
  updateReminderSettingsAction,
} from '../settings/actions';
import { arrivalSettingsFromAccount } from '@/lib/arrival';
import { loadOwnerAlerts, ownerAlertChip } from '@/lib/owner-sms';
import { getSiteContent } from '@/lib/site-content';
import { googleReviewUrl } from '@/lib/review-routing';
import { choiceReminderSettingsFromAccount } from '@/lib/choice-reminders';
import { ESTIMATE_POSTURES, normalizeEstimatePosture } from '@/lib/estimate-posture';
import { bookingAvailabilityFromAccount } from '@/lib/booking-availability';
import { QUICK_STOP_SETTINGS_COLUMNS } from '@/lib/quick-stop';
import { countEligibleQuotes } from '@/lib/followups';
import { displayPhone } from '@/lib/phone';
import { siteOrigin } from '@/lib/seo/site-pages';
import type { Site } from '@/lib/sites';
import {
  appointmentReminderText,
  REMINDER_HOUR_CHOICES,
  REMINDER_LEAD_DAY_CHOICES,
  reminderHourLabel,
  reminderLeadLabel,
  reminderTimingLabel,
  normalizeReminderHour,
  normalizeReminderLeadDays,
  timeZoneAbbreviation,
} from '@/lib/appointment-reminders';
import {
  FOLLOWUP_CHANNELS,
  FOLLOWUP_CHANNEL_LABELS,
  FOLLOWUP_DAY_CHOICES,
  FOLLOWUP_HOUR_CHOICES,
  followupHourLabel,
  followupMaxAgeDays,
  followupSequence,
  followupSettingsFromAccount,
  followupTimingLabel,
  quoteFollowupEmailPreview,
  quoteFollowupText,
} from '@/lib/quote-followups';

/**
 * AUTOMATIONS IS A PRODUCT, NOT AN ACCOUNT SETTING.
 *
 * This was the third tab of Account settings, and the only way to it from the
 * rail was a sublink hanging off Account down in the footer — the strip reserved
 * for the things that are not the day's work. It is the opposite of that. It is
 * the machinery that answers leads, chases quotes, reminds customers about
 * appointments and asks for reviews while nobody is watching, and on a busy
 * account it sends more messages in a week than the owner does.
 *
 * So it is a page, in Grow, above Messages — with the other things that talk to
 * customers on your behalf.
 *
 * ITS OLD DEEP LINKS STILL WORK, and that took care: eleven section ids used to
 * resolve to a Settings tab, and a next.config redirect cannot help because a
 * URL fragment is never sent to the server. SettingsTabs redirects them in the
 * browser instead — see AUTOMATION_ANCHORS in lib/nav-helpers.
 *
 * The reads below are lifted from settings/page.tsx verbatim, defensive comments
 * and all. Each is already its own query that swallows its own error (the house
 * rule: code ships ahead of its migration, and a SELECT naming a column that
 * does not exist yet fails the whole statement), so re-issuing them here costs
 * one round trip each and cannot fail this page in a way it did not already fail
 * the old one.
 */
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automations' };

type AutomationStatus = { label: string; tone: 'on' | 'off' | 'neutral' };

function safeTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || !tz.trim()) return 'America/New_York';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return 'America/New_York';
  }
}

// One automation in the grouped, collapsible list. Collapsed by default so the
// page reads as a scannable index (title + one-liner + on/off control); expand
// to reveal the section's form. The `id` stays on the <details> so deep links
// (#reviews, #daily-digest, …) still resolve and open it.
//
// Pass `toggle` with the action that flips it and it gets a real switch you can
// use from the list without opening the card. The action is explicit rather than
// derived from the id because these don't all live in the same place: most are a
// boolean column on `accounts`. Smart Intake is a website method stored in site
// content, so it reports the active method instead of receiving a toggle here.
// `status` remains for rows with nothing to flip.
function AutomationCard({
  id,
  title,
  subtitle,
  status,
  toggle,
  group,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  status?: AutomationStatus;
  toggle?: {
    on: boolean;
    action: (next: boolean) => Promise<void>;
    onLabel?: string;
    offLabel?: string;
    enableBlocked?: boolean;
    blockedReason?: string;
  };
  // Cards sharing a group name behave as one accordion — opening any of them
  // closes the rest. Native <details name>, the same mechanism the schedule
  // popovers use; browsers without support simply allow several open, which is
  // the old behavior rather than a broken one.
  group: string;
  children: ReactNode;
}) {
  return (
    <details className="automation-card" id={id} name={group}>
      <summary className="automation-summary">
        <span className="automation-heads">
          <strong>{title}</strong>
          <span className="automation-sub">{subtitle}</span>
        </span>
        {status ? (
          <span className={`automation-status ${status.tone}`}>{status.label}</span>
        ) : null}
        {toggle ? (
          <AutomationSwitch
            label={title}
            on={toggle.on}
            action={toggle.action}
            onLabel={toggle.onLabel}
            offLabel={toggle.offLabel}
            enableBlocked={toggle.enableBlocked}
            blockedReason={toggle.blockedReason}
          />
        ) : null}
        <svg className="automation-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </summary>
      <div className="automation-body">{children}</div>
    </details>
  );
}

export default async function AutomationsPage() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const aiVoice = aiVoiceEnabled();
  const admin = createAdminClient();

  // Parallelize all independent database and readiness reads in a single round trip.
  // Each query maintains its defensive tolerance for unapplied migrations/columns,
  // but running concurrently drops wall-clock latency by ~14 network round trips.
  const [
    voiceRead,
    voiceEntitlement,
    messagingReadiness,
    voiceRouteReadiness,
    { data: account },
    { data: site },
    { data: reviewSettings },
    { data: intakeSettings },
    { data: bookingSettings },
    { data: quickStopSettings },
    { data: confirmSettings },
    settingsHistory,
    { data: portalSettings },
    { data: reviewPageSettings },
    { data: followupRow },
    { data: reminderSettings },
    { data: digestSettings },
    { data: callVerified },
    { data: selectionSettings },
    { data: choiceSettingsRow },
  ] = await Promise.all([
    aiVoice
      ? supabase
          .from('voice_settings')
          .select('status, answer_mode, greeting, transfer_number, business_hours')
          .eq('account_id', accountId)
          .maybeSingle()
      : Promise.resolve(null),
    aiVoice ? loadVoiceEntitlement(admin, accountId) : Promise.resolve(null),
    loadDedicatedMessagingReadiness(accountId, admin),
    aiVoice ? loadVoiceRouteReadiness(admin, accountId) : Promise.resolve(null),
    supabase
      .from('accounts')
      .select('business_name, timezone, alert_phone, connect_onboarded, call_textback_enabled, call_forward_number, call_tracking_number, arrival_updates_enabled, arrival_location_policy, arrival_window_minutes, arrival_morning_confirmation, arrival_clock_travel, time_clock_mode, workday_start, workday_end, job_buffer_minutes, schedule_day_hours')
      .eq('id', accountId)
      .single(),
    supabase.from('sites').select('*').eq('account_id', accountId).maybeSingle(),
    supabase.from('accounts').select('auto_review_request').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('estimate_posture, high_value_lead_amount, mute_low_quality_leads, high_value_sms_enabled, alert_phone').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('timezone, booking_enabled, booking_weekdays, booking_windows').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select(QUICK_STOP_SETTINGS_COLUMNS).eq('id', accountId).single(),
    supabase.from('accounts').select('quote_confirmation_email, payment_confirmation_email, review_confirmation_email, reminder_confirmation_email').eq('id', accountId).maybeSingle(),
    listAccountEvents(supabase, accountId, 8),
    supabase.from('accounts').select('client_portal_enabled').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('review_feedback_page_enabled').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('quote_followups_enabled, quote_followup_days, quote_followup_hour, quote_followup_channel, quote_followup_skip_weekends').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('appointment_reminders_enabled, appointment_reminder_lead_days, appointment_reminder_hour, timezone').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('daily_digest_enabled').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('call_tracking_verified_at').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('selection_reminders_enabled').eq('id', accountId).maybeSingle(),
    supabase.from('accounts').select('selection_reminder_offsets, selection_reminder_hour, selection_reminder_template, selection_reminder_grouping').eq('id', accountId).maybeSingle(),
  ]);

  const voiceSettings = voiceRead?.error ? null : (voiceRead?.data ?? null) as Record<string, unknown> | null;
  const voiceSettingsAvailable = Boolean(voiceRead && !voiceRead.error);
  if (voiceRead?.error) console.error('voice settings read failed:', voiceRead.error);
  const customerTextingReady = messagingReadiness.kind === 'ready';
  const customerTextingBlockReason = messagingReadiness.kind === 'unavailable'
    ? 'We could not verify your customer-texting number right now. Try again or contact support.'
    : 'An approved, active dedicated number is required before this automation can text customers.';

  const businessName = pickBusinessName(site, account);
  const arrivalSettings = arrivalSettingsFromAccount(account as Record<string, unknown> | null);
  const businessBasics = getSiteContent((site?.content as Record<string, unknown> | null | undefined) ?? null);
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

  const autoReviewRequest = Boolean(reviewSettings?.auto_review_request);
  const estimatePosture = normalizeEstimatePosture(intakeSettings?.estimate_posture);
  const highValueLeadAmount = intakeSettings?.high_value_lead_amount ? Number(intakeSettings.high_value_lead_amount) : null;
  const muteLowQualityLeads = intakeSettings?.mute_low_quality_leads !== false; // default on

  const alertChip = ownerAlertChip(await loadOwnerAlerts(accountId));
  const alertReadiness =
    alertChip.label === 'Ready'
      ? 'Ready — your mobile is on file and confirmed.'
      : `${alertChip.label}. ${alertChip.detail ?? ''}`.trim();

  // The two ends of the review ask, built the same way the sender builds them so
  // the preview shows the link the customer really taps. The feedback-page one
  // is a real invite token per job; the preview stands in for the token rather
  // than inventing one that looks like somebody's.
  const reviewGoogleUrl = googleReviewUrl({
    placeId: businessBasics.testimonials.googlePlaceId,
    listingUrl: businessBasics.testimonials.googleUrl,
  });
  const reviewFeedbackUrl = `${appOrigin}/review/…`;

  const booking = bookingAvailabilityFromAccount(bookingSettings);
  const bookingActive = booking.weekdays.length > 0;
  const bookingEnabled = booking.enabled;

  const quickStopEnabled = Boolean((quickStopSettings as { extra_stop_enabled?: boolean } | null)?.extra_stop_enabled);

  // Smart Intake isn't "always on" — enabling the classic quote form in the website
  // builder switches it off. quoteForm.enabled is the source of truth; this is its
  // inverse, exactly as getSiteContent derives it.
  const smartIntakeOn = businessBasics.estimateRanges.enabled;

  const confirmRow = (confirmSettings ?? {}) as Record<string, boolean | undefined>;
  // Fall back to each column's own default, matching CONFIRMATION_DEFAULTS.
  const confirmOn = (column: string, fallback: boolean) =>
    typeof confirmRow[column] === 'boolean' ? (confirmRow[column] as boolean) : fallback;
  const quoteConfirmationOn = confirmOn('quote_confirmation_email', true);
  const paymentConfirmationOn = confirmOn('payment_confirmation_email', true);
  const reviewConfirmationOn = confirmOn('review_confirmation_email', true);
  const reminderConfirmationOn = confirmOn('reminder_confirmation_email', false);

  const clientPortalEnabled = Boolean(portalSettings?.client_portal_enabled);
  // The address a customer actually uses, on the contractor's OWN host — their
  // custom domain if it's verified, otherwise their subdomain. Null until the
  // site is published, which is also when the page starts resolving at all.
  const portalHostOrigin = site?.published ? siteOrigin(site) : null;
  const portalUrl = portalHostOrigin ? `${portalHostOrigin}/portal` : null;
  const portalNav = businessBasics.clientPortal;

  const reviewFeedbackPageEnabled = Boolean(reviewPageSettings?.review_feedback_page_enabled);

  const quoteFollowupsEnabled = Boolean(followupRow?.quote_followups_enabled);
  // Normalised on the way in, so a database built before the schedule migration —
  // where every column reads as undefined — renders the cadence that used to be
  // hardcoded rather than an empty schedule at midnight.
  const followupSettings = followupSettingsFromAccount(followupRow as Record<string, unknown> | null);
  // How many customers would actually hear from you. Asked before the switch is
  // flipped, because "turn it on and find out" is a bad deal when finding out
  // means texting real people. Only worth the query while it is off — once it is
  // on, the answer is visible in the job feed.
  const eligibleQuotes = quoteFollowupsEnabled ? 0 : await countEligibleQuotes(supabase, accountId, followupSettings);

  const appointmentRemindersEnabled = Boolean(reminderSettings?.appointment_reminders_enabled);
  // Normalised on the way in, so a database built before the timing migration —
  // where both columns read as undefined — renders the old behavior's defaults
  // rather than "0 days before at 12:00 AM".
  const reminderLeadDays = normalizeReminderLeadDays(reminderSettings?.appointment_reminder_lead_days);
  const reminderHour = normalizeReminderHour(reminderSettings?.appointment_reminder_hour);
  const accountTimeZone = safeTimeZone(reminderSettings?.timezone || account?.timezone);
  // One clock for the card: the abbreviation is DST-dependent, so it has to be
  // derived from a moment rather than stored.
  const reminderNow = new Date();
  const reminderTiming = reminderTimingLabel(reminderLeadDays, reminderHour, accountTimeZone, reminderNow);
  const accountTimeZoneLabel = timeZoneAbbreviation(accountTimeZone, reminderNow);
  // The follow-up schedule reads out of the same clock. Its label takes the
  // abbreviation as an argument rather than deriving it, which is what keeps
  // lib/quote-followups pure and free of Intl.
  const followupTiming = followupTimingLabel(followupSettings.days, followupSettings.hour, accountTimeZoneLabel);

  const dailyDigestEnabled = Boolean(digestSettings?.daily_digest_enabled);
  const allEssentialsOn = autoReviewRequest && quoteFollowupsEnabled && appointmentRemindersEnabled && dailyDigestEnabled;

  const callTextbackEnabled = Boolean((account as { call_textback_enabled?: boolean } | null)?.call_textback_enabled);
  // Shown the way a person writes a phone number, not the way Twilio stores it.
  // The action normalizes back to E.164 on save.
  const rawForward = (account as { call_forward_number?: string } | null)?.call_forward_number
    || (voiceSettings?.transfer_number as string | null)
    || '';
  const callForwardNumber = displayPhone(rawForward);
  const voiceRouteState = voiceRouteReadiness?.kind === 'ready'
    ? 'ready' as const
    : voiceRouteReadiness?.kind === 'not_ready'
      ? voiceRouteReadiness.reason
      : 'unavailable' as const;
  const voiceRouteReady = voiceRouteState === 'ready';
  const dedicatedVoiceNumber = (voiceRouteReadiness && 'number' in voiceRouteReadiness && voiceRouteReadiness.number)
    ? voiceRouteReadiness.number
    : null;
  const rawTracking = (voiceRouteReady ? dedicatedVoiceNumber : null)
    || (account as { call_tracking_number?: string } | null)?.call_tracking_number
    || '';
  const callTrackingNumber = displayPhone(rawTracking);
  const callTrackingVerifiedAt = (callVerified?.call_tracking_verified_at as string | null) ?? null;
  const voiceConfiguredStatus = (voiceSettings?.status as 'off' | 'active' | 'paused') ?? 'off';
  const voiceEntitlementAvailable = voiceEntitlement?.available === true;
  // A dedicated voice line provisioned for inbound routing disables custom editing.
  // Must NOT include customerTextingReady: dedicated SMS numbers touch sms_sender_numbers
  // and never populate accounts.call_tracking_number, so coupling them left workspaces with
  // a disabled, empty tracking input and an impossible setup state.
  const hasDedicatedNumber = voiceRouteReady;
  const voiceActivationReady = voiceSettingsAvailable
    && voiceEntitlementAvailable
    && voiceEntitlement?.enabled === true
    && (voiceEntitlement.concurrentCalls ?? 0) > 0
    && voiceRouteReady;

  const selectionRemindersEnabled = selectionSettings?.selection_reminders_enabled !== false;
  const choiceReminders = choiceReminderSettingsFromAccount({
    ...(choiceSettingsRow ?? {}),
    selection_reminders_enabled: selectionRemindersEnabled,
  });

  return (
    <main className="wide-shell workspace-shell">
      {/* Opens the card a deep link points at — the job SettingsTabs used to do
          for these cards while they were a tab. */}
      <OpenAnchoredCard />
      <section className="workspace-hero panel" data-tour-id="automations:overview">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Grow</p>
          <h1 className="workspace-title">Automations</h1>
          <p className="workspace-lead">
            The work that happens without you: answering new leads, chasing quotes, reminding
            customers about appointments, and asking for a review once the job is done.
          </p>
        </div>
      </section>

      <div className="automation-list">
        {!customerTextingReady ? (
          <div className="automation-prereq" role="status">
            <span aria-hidden="true">📱</span>
            <span>
              <strong>Customer texting is not ready.</strong> SMS automations cannot be turned on, and
              any already-configured SMS automation cannot deliver texts, until this workspace has an
              approved, active dedicated number.{' '}
              <Link href="/dashboard/messages?setup=1#texting-setup">Open Texting setup &rarr;</Link>
            </span>
          </div>
        ) : !allEssentialsOn ? (
          <form action={enableRecommendedAutomationsAction} className="automation-recommend">
            <div className="automation-recommend-copy">
              <strong>Turn on the essentials in one click</strong>
              <span>Enables review asks, quote follow-ups, appointment reminders, and your daily digest with sensible defaults. Tune or turn any off below.</span>
            </div>
            <SaveButton>Turn on recommended</SaveButton>
          </form>
        ) : null}
        <h2 className="automation-group">Booking &amp; intake</h2>
        <AutomationCard
          id="intake-ai"
          group="booking-intake"
          title="Smart Intake"
          subtitle="Estimate questions & lead priority"
          {...(site
            ? { status: smartIntakeOn
                ? { label: 'Smart Intake active', tone: 'on' as const }
                : { label: 'Classic form active', tone: 'neutral' as const } }
            : { status: { label: 'Needs a website', tone: 'neutral' as const } })}
        >
          {site && !smartIntakeOn ? (
            <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
              <span aria-hidden="true">📝</span>
              <span>
                Smart Intake is off, so your website is using the <strong>classic quote form</strong> &mdash;
                visitors type out their job and wait for you to reply with a price. Only one intake runs at a time.{' '}
                <Link href="/dashboard/sites?open=intake">Change the intake method in Website Builder &rarr;</Link>
              </span>
            </div>
          ) : null}
          <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
            Smart Intake asks a homeowner <strong>up to 3 short scoping questions</strong>, collects their contact
            details, then shows a rough pre-visit range. You set the exact quote after confirming the job; the
            answers here qualify and prioritize the lead before it reaches your board.
          </p>
          <p className="workspace-details-copy" style={{ marginBottom: '0.75rem' }}>
            <strong>Pricing &amp; alert priority</strong><br />Saved when you select <strong>Save pricing &amp; alerts</strong>.
          </p>
          <form action={updateIntakeSettingsAction} className="form-grid compact-form">
            <div className="field full">
              <label htmlFor="estimatePosture">Estimate pricing posture</label>
              <select id="estimatePosture" name="estimatePosture" defaultValue={estimatePosture}>
                {ESTIMATE_POSTURES.map((option) => (
                  <option key={option.id} value={option.id}>{option.label} — {option.blurb}</option>
                ))}
              </select>
              <small className="field-hint">Shades every AI estimate lower (win on price) or higher (position on quality). It never changes your real quote — just the pre-visit ballpark the homeowner sees.</small>
            </div>

            <details className="advanced-settings">
              <summary>Advanced — lead priority &amp; alerts</summary>
              <div className="form-grid compact-form" style={{ marginTop: '0.7rem' }}>
                <div className="field full">
                  <label htmlFor="highValueLeadAmount">High-value lead threshold ($)</label>
                  <input id="highValueLeadAmount" name="highValueLeadAmount" type="number" min="0" step="100" inputMode="numeric" placeholder="e.g. 5000" defaultValue={highValueLeadAmount ?? ''} />
                  <small className="field-hint">When a lead&apos;s AI estimate could reach this amount, it&apos;s flagged <strong>high-value</strong> and jumps the line &mdash; louder alerts and top priority, so you respond to the big jobs first. Leave blank to turn priority off.</small>
                </div>

                <label className="checkbox-row" htmlFor="muteLowQualityLeads">
                  <input id="muteLowQualityLeads" name="muteLowQualityLeads" type="checkbox" defaultChecked={muteLowQualityLeads} />
                  <span>Don&apos;t interrupt me for low-quality leads &mdash; out-of-area, work you don&apos;t do, below-minimum, and &ldquo;just researching&rdquo; still land in your board, just without an alert or dashboard nag (keeps spam, marketing, and AI callers from stealing your attention)</span>
                </label>

                {/* THE NUMBER AND ITS CONSENT ARE NOT COLLECTED HERE ANY MORE.
                    They were: a tel input and a checkbox, inside this
                    <details>, under the words "Standard rates apply." — which
                    is not a consent disclosure. No message frequency, no STOP
                    or HELP, no statement that agreeing is not a condition of
                    purchase, and no link to the SMS terms, which exist on a
                    public page the dashboard never linked to. The checkbox
                    wrote a feature flag; nothing recorded that anybody had
                    agreed to anything, or when.

                    So this page now REPORTS the state and links to where it is
                    set. Collecting a phone number for texting in a collapsed
                    "Advanced" section of a page about automations is how the
                    disclosure came to be one sentence in the first place. */}
                <p className="field-hint" style={{ margin: 0 }}>
                  <strong>High-value lead texts:</strong> {alertReadiness}{' '}
                  <Link href="/dashboard/messages?setup=1#texting-setup">
                    Manage in Messages &rarr;
                  </Link>
                </p>
              </div>
            </details>

            <div className="form-actions">
              <SaveButton onlyWhenChanged>Save pricing &amp; alerts</SaveButton>
            </div>
          </form>

          {/* Moved here from the website builder, where the same
              controls sat behind three numbered cards on a page about
              headlines and photos. None of it changes how the site
              looks — it decides which leads interrupt you. */}
          {site ? (
            <IntakeContentSection
              leadFilters={businessBasics.leadFilters}
              emailField={businessBasics.estimateRanges.emailField}
              hasCities={businessBasics.serviceAreas.cities.some((city) => city.trim())}
              // The list itself, and the mute that turns a flag into silence.
              // The service-area gate names both, because a filter the owner
              // cannot see is indistinguishable from a quiet week.
              cities={businessBasics.serviceAreas.cities.map((city) => city.trim()).filter(Boolean)}
              muteLowQualityLeads={muteLowQualityLeads}
              smartIntakeOn={smartIntakeOn}
              customerTextingReady={customerTextingReady}
              preview={<IntakePreviewModal site={site as Site} compact />}
            />
          ) : null}
        </AutomationCard>

        <AutomationCard group="booking-intake" id="booking-availability" title="Online booking" subtitle="Days & windows customers can grab" toggle={{ on: bookingEnabled, action: toggleAutomationAction.bind(null, 'booking') }}>
          {bookingEnabled && !bookingActive ? (
            <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
              <span aria-hidden="true">⚠️</span>
              {/* "below" was right when the weekday checkboxes were in
                  this card. They're on the setup page now. */}
              <span>Booking is on, but no weekdays are selected &mdash; so nothing is bookable yet. Pick the days you take work on the setup page.</span>
            </div>
          ) : null}
          {/* The days, windows, capacity, lead time and instant-book
              gate that used to live here moved to the booking setup
              page, where you can see what they actually produce — the
              real open days and slot counts — instead of reading
              settings and guessing. Same move Quick Stop made below.
              What belongs on an Automations tab is the switch and the
              way in. */}
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            Customers grab a slot on your public <strong>Book a time</strong> page. You pick the days you take
            work, the arrival windows you offer and how many bookings a day is enough &mdash; a booking still
            lands as a request for you to confirm.
          </p>
          <Link className="btn secondary" href="/dashboard/schedule/booking">
            Open booking setup &rarr;
          </Link>
        </AutomationCard>


        <AutomationCard group="booking-intake" id="extra-stop" title="Quick Stop" subtitle="Same-day &ldquo;add me to your route&rdquo;" toggle={{ on: quickStopEnabled, action: toggleAutomationAction.bind(null, 'extra-stop') }}>
          {!account?.connect_onboarded ? (
            <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
              <span aria-hidden="true">💳</span>
              <span>Quick Stop collects a fee before the visit — <Link href="/dashboard/settings#payments">connect Stripe</Link> to get paid. You can still set it up now.</span>
            </div>
          ) : null}
          {/* The thirty-odd settings that used to live here moved to the
              Quick Stops page, where the requests they govern are. What
              belongs on an Automations tab is the switch and the way in. */}
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            A customer asks to be fitted in today — mid-day or at the end of your route. You review
            the job, propose an arrival window and set a one-off fee; they pay before it&apos;s
            booked.
          </p>
          <Link className="btn secondary" href="/dashboard/quick-stops#quick-stop-setup">
            Adjust Quick Stop settings →
          </Link>
        </AutomationCard>

        <AutomationCard
          group="booking-intake"
          id="ai-receptionist"
          title="AI receptionist"
          subtitle="Answers the calls you can’t"
          status={{
            label: !aiVoice ? 'Not enabled'
              : !voiceSettingsAvailable ? 'Unavailable'
              : voiceConfiguredStatus === 'active' && !voiceActivationReady ? 'Configured — not answering'
                : voiceConfiguredStatus === 'active' ? 'Answering'
                  : voiceConfiguredStatus === 'paused' ? 'Paused' : 'Off',
            tone: aiVoice && voiceConfiguredStatus === 'active' && voiceActivationReady ? 'on'
              : !aiVoice || voiceConfiguredStatus === 'off' ? 'off' : 'neutral',
          }}
        >
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            {voiceConfiguredStatus === 'active' && voiceActivationReady
              ? 'Online & Answering. Your AI receptionist answers inbound calls according to your schedule, qualifies homeowner leads, and logs transcripts.'
              : voiceConfiguredStatus === 'paused'
                ? 'Answering is currently paused. Your greeting, hours, and routing configurations are preserved.'
                : 'AI phone call answering is off. Calls follow your normal forwarding configuration.'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <Link className="btn primary" href="/dashboard/voice-calls?view=settings">
              Configure Receptionist Settings →
            </Link>
            <Link className="btn secondary" href="/dashboard/voice-calls">
              View Voice Controls →
            </Link>
          </div>
        </AutomationCard>

        <AutomationCard group="booking-intake" id="missed-call" title="Missed-call text-back" subtitle="Auto-text callers you miss" toggle={{ on: callTextbackEnabled, action: toggleAutomationAction.bind(null, 'missed-call'), enableBlocked: !customerTextingReady, blockedReason: customerTextingBlockReason, offLabel: customerTextingReady ? 'Off' : 'Setup required' }}>
          <MissedCallSection
            enabled={callTextbackEnabled}
            businessName={businessName}
            forwardNumber={callForwardNumber}
            trackingNumber={callTrackingNumber}
            verifiedAt={callTrackingVerifiedAt}
            aiVoiceActive={voiceConfiguredStatus === 'active'}
            hasDedicatedNumber={hasDedicatedNumber}
          />
        </AutomationCard>

        <h2 className="automation-group">Customer follow-through</h2>
        <AutomationCard group="follow-through" id="reviews" title="Review requests" subtitle="Auto-ask after a completed job" toggle={{ on: autoReviewRequest, action: toggleAutomationAction.bind(null, 'reviews'), enableBlocked: !customerTextingReady, blockedReason: customerTextingBlockReason, offLabel: customerTextingReady ? 'Off' : 'Setup required' }}>
          <ReviewRequestSection
            enabled={autoReviewRequest}
            businessName={businessName}
            feedbackPage={reviewFeedbackPageEnabled}
            googleUrl={reviewGoogleUrl}
            googleName={businessBasics.testimonials.googleName}
            feedbackUrl={reviewFeedbackUrl}
          />
        </AutomationCard>

        {/* The card used to have no controls at all: three sentences
            reciting four constants nobody could change. The cadence, the
            hour, the channel and the weekend rule are settings now, and
            the sequence strip states the whole schedule at a glance —
            "day 2 and day 5" is fine as prose for two nudges and
            unreadable for three.

            The switch in the header is still the only enablement
            control; this form owns the schedule and nothing else, the
            same split appointment reminders uses. */}
        <AutomationCard group="follow-through" id="followups" title="Automatic quote follow-ups" subtitle="Chase quotes nobody has answered" toggle={{ on: quoteFollowupsEnabled, action: toggleAutomationAction.bind(null, 'followups'), enableBlocked: !customerTextingReady, blockedReason: customerTextingBlockReason, offLabel: customerTextingReady ? 'Turn on' : 'Setup required' }}>
          <div className={`followup-card${quoteFollowupsEnabled ? '' : ' is-paused'}`}>
            {/* NOT A WARNING. Off used to render in alarm orange, which
                is the color this app uses for something going wrong —
                and an automation you have not switched on is not a
                fault. It states what happens instead, and what would
                happen if you turned it on. */}
            <p className="followup-state">
              {quoteFollowupsEnabled
                ? customerTextingReady
                  ? `On — a quote that goes quiet is chased on ${followupTiming}, so you never have to remember which ones did.`
                  : 'Configured, but customer texts are blocked until your dedicated number is ready.'
                : 'Off. Nobody is chased, so a quote nobody answers stays that way until you follow up yourself.'}
            </p>

            {!quoteFollowupsEnabled ? (
              <p className="followup-eligible">
                {eligibleQuotes === 0 ? (
                  <>
                    <strong>No open quotes are waiting right now.</strong> Turning this on affects
                    quotes you share from here on, not ones already answered.
                  </>
                ) : (
                  <>
                    <strong>
                      Up to {eligibleQuotes} open {eligibleQuotes === 1 ? 'quote is' : 'quotes are'} eligible.
                    </strong>{' '}
                    {eligibleQuotes === 1 ? 'That customer' : 'Those customers'} would be chased on the
                    schedule below — approved quotes and quotes past day {followupMaxAgeDays(followupSettings.days)} are
                    never touched.
                  </>
                )}
              </p>
            ) : null}

            {/* The whole schedule as one row, read from the same array
                the cron sweeps on. */}
            <ol className="followup-sequence" aria-label="Follow-up schedule">
              {followupSequence(followupSettings.days).map((step) => (
                <li key={step.key} className={`followup-step is-${step.key === 'sent' ? 'start' : step.key === 'stop' ? 'end' : 'send'}`}>
                  <strong>{step.label}</strong>
                  <span>{step.detail}</span>
                </li>
              ))}
            </ol>

            <div className="followup-grid">
              <div className="followup-facts">
                <div className="followup-fact">
                  <strong>Schedule</strong>
                  <span>{followupTiming}</span>
                  <details className="reminder-edit">
                    <summary>Edit</summary>
                    <form action={updateFollowupSettingsAction} className="reminder-edit-form">
                      {/* Three selects rather than one repeating field:
                          the maximum is three, so a fixed set of rows is
                          the honest shape and needs no client JS. Days
                          are ABSOLUTE offsets from the share date, not
                          gaps — "day 5" is day 5 whatever ran before. */}
                      {[0, 1, 2].map((slot) => (
                        <label key={slot}>
                          <span>{slot === 0 ? 'First reminder' : slot === 1 ? 'Second' : 'Third'}</span>
                          <select name={`followupDay${slot + 1}`} defaultValue={String(followupSettings.days[slot] ?? '')}>
                            {/* The first is not optional: a schedule with
                                no nudges is the switch turned off, and
                                this form does not own that. */}
                            {slot > 0 ? <option value="">Don&apos;t send</option> : null}
                            {FOLLOWUP_DAY_CHOICES.map((day) => (
                              <option key={day} value={String(day)}>
                                Day {day} after the quote
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <label>
                        <span>At</span>
                        <select name="followupHour" defaultValue={String(followupSettings.hour)}>
                          {FOLLOWUP_HOUR_CHOICES.map((hour) => (
                            <option key={hour} value={String(hour)}>{followupHourLabel(hour)}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Send by</span>
                        <select name="followupChannel" defaultValue={followupSettings.channel}>
                          {FOLLOWUP_CHANNELS.map((channel) => (
                            <option key={channel} value={channel}>{FOLLOWUP_CHANNEL_LABELS[channel]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="followup-check">
                        <input type="checkbox" name="followupSkipWeekends" defaultChecked={followupSettings.skipWeekends} />
                        <span>Hold weekend sends until Monday</span>
                      </label>
                      <p className="reminder-edit-note">
                        Times are {accountTimeZoneLabel} — your own clock, not the server&apos;s.{' '}
                        <Link href="/dashboard/settings#business">Change your timezone</Link>
                      </p>
                      <SaveButton className="btn primary" onlyWhenChanged>Save changes</SaveButton>
                    </form>
                  </details>
                </div>

                <div className="followup-fact">
                  <strong>Delivery</strong>
                  <span>
                    {followupSettings.channel === 'email'
                      ? 'Email only — nobody is texted, even if they opted in.'
                      : 'Text clients who opted in to texts. If there is no mobile on file, or they never opted in, we email them instead.'}{' '}
                    A STOP reply ends texts for good.
                  </span>
                </div>

                {/* The stop rules in full, because every one of them is a
                    question an owner actually asks before switching this
                    on — and "does it keep texting after they say yes" is
                    the one that stops people. */}
                <div className="followup-fact">
                  <strong>Stops automatically</strong>
                  <span>
                    The moment they approve, and any time the job leaves the quote stage — scheduled,
                    completed or archived. Also once the quote passes day{' '}
                    {followupMaxAgeDays(followupSettings.days)}, by then a phone call rather than a text.
                    {' '}Never more than {followupSettings.days.length === 1 ? 'one reminder' : `${followupSettings.days.length} reminders`} in total.
                  </span>
                </div>

                <div className="followup-fact">
                  <strong>A missed day is skipped, not stacked</strong>
                  {/* Worth stating: it is the behavior people expect
                      least and fear most about turning an automation on
                      over old data. */}
                  <span>
                    Switch this on with quotes already open and nobody gets a backlog. Each quote
                    picks up at the point of the schedule it has actually reached.
                  </span>
                </div>
              </div>

              <div className="followup-preview">
                <p className="eyebrow">What the client sees</p>
                <p className="followup-lede">
                  The first reminder, day {followupSettings.days[0]} after you share a quote.
                </p>
                <div className="followup-phone">
                  <div className="followup-phone-head">
                    <span className="followup-phone-avatar" aria-hidden="true">
                      {businessName.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>{businessName}</strong>
                  </div>
                  <div className="followup-phone-body">
                    {/* Rendered from the sender's own function. The old
                        hand-written preview had lost the "Let's Get
                        Quoted:" prefix every one of our texts carries. */}
                    <p className="followup-bubble">
                      {quoteFollowupText({
                        businessName,
                        clientName: 'Sarah',
                        url: `${appOrigin}/client/jobs/…`,
                      })}
                    </p>
                  </div>
                </div>

                {/* The email is not a second-class copy of the text — it
                    is what most customers get, because most have never
                    opted in to SMS. It was never previewed at all. Now
                    it renders from quoteFollowupEmailPreview, which
                    sendQuoteFollowupEmail builds its own subject and
                    body from. */}
                <details className="followup-email">
                  <summary>{followupSettings.channel === 'email' ? 'Preview the email' : 'Preview the email version'}</summary>
                  {(() => {
                    const email = quoteFollowupEmailPreview({ businessName, clientName: 'Sarah' });
                    return (
                      <div className="followup-email-body">
                        <p className="followup-email-subject">
                          <span>Subject</span>
                          {email.subject}
                        </p>
                        <p className="followup-email-heading">{email.heading}</p>
                        <p className="followup-email-text">{email.body}</p>
                        <span className="followup-email-cta" aria-hidden="true">{email.cta}</span>
                      </div>
                    );
                  })()}
                </details>

                <AutomationTestSend
                  action={sendFollowupTestAction}
                  label="Send a test"
                  note="Goes to your account email."
                />
              </div>
            </div>
          </div>
        </AutomationCard>

        {/* Rebuilt from a paragraph plus a checkbox into scannable rows.
            The checkbox is gone: it wrote appointment_reminders_enabled,
            which is what the switch in this card's own header already
            does — two controls for one boolean, able to disagree until
            you saved. The switch is the one enablement control, and the
            form below owns the schedule instead of duplicating it. */}
        <AutomationCard
          group="follow-through"
          id="reminders"
          title="Appointment reminders"
          subtitle="Automatically remind clients before scheduled jobs"
          toggle={{ on: appointmentRemindersEnabled, action: toggleAutomationAction.bind(null, 'reminders'), enableBlocked: !customerTextingReady, blockedReason: customerTextingBlockReason, offLabel: customerTextingReady ? 'Off' : 'Setup required' }}
        >
          <div className={`followup-card${appointmentRemindersEnabled ? '' : ' is-paused'}`}>
            <p className="followup-state">
              {appointmentRemindersEnabled
                ? customerTextingReady
                  ? `Active — clients are reminded ${reminderTiming}.`
                  : 'Configured, but customer texts are blocked until your dedicated number is ready.'
                : 'Off — nobody is reminded, so a forgotten appointment stays forgotten.'}
            </p>

            <div className="followup-grid">
              <div className="followup-facts">
                <div className="followup-fact">
                  <strong>Send reminder</strong>
                  {/* The whole schedule in one line, timezone included.
                      "The day before" was all this could ever say while
                      the send time was a side effect of the cron hour. */}
                  <span>{reminderTiming}</span>
                  <details className="reminder-edit">
                    <summary>Edit</summary>
                    <form action={updateReminderSettingsAction} className="reminder-edit-form">
                      <label>
                        <span>How far ahead</span>
                        <select name="reminderLeadDays" defaultValue={String(reminderLeadDays)}>
                          {REMINDER_LEAD_DAY_CHOICES.map((days) => (
                            <option key={days} value={String(days)}>{reminderLeadLabel(days)}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>At</span>
                        <select name="reminderHour" defaultValue={String(reminderHour)}>
                          {REMINDER_HOUR_CHOICES.map((hour) => (
                            <option key={hour} value={String(hour)}>{reminderHourLabel(hour)}</option>
                          ))}
                        </select>
                      </label>
                      <p className="reminder-edit-note">
                        Times are {accountTimeZoneLabel} — your own clock, not the server&apos;s.{' '}
                        <Link href="/dashboard/settings#business">Change your timezone</Link>
                      </p>
                      <SaveButton className="btn primary" onlyWhenChanged>Save changes</SaveButton>
                    </form>
                  </details>
                </div>

                <div className="followup-fact">
                  <strong>Delivery</strong>
                  <span>
                    Text clients who opted in to texts. If there&apos;s no mobile on file, or they never
                    opted in, we email them instead. A STOP reply ends texts for good.
                  </span>
                </div>

                <div className="followup-fact">
                  <strong>Stops automatically</strong>
                  {/* Said plainly because it is the question an owner
                      actually has: cancelling is archiving here, and a
                      reschedule moves the date the reminder is keyed to,
                      so the old one is void and a fresh one is due. */}
                  <span>
                    When the job is cancelled or completed. Reschedule it and the old reminder is void —
                    the new date gets its own. One reminder per appointment, never two.
                  </span>
                </div>
              </div>

              <div className="followup-preview">
                <p className="eyebrow">What the client sees</p>
                <p className="followup-lede">Sent {reminderTiming}.</p>
                <div className="followup-phone">
                  <div className="followup-phone-head">
                    <span className="followup-phone-avatar" aria-hidden="true">
                      {businessName.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>{businessName}</strong>
                  </div>
                  <div className="followup-phone-body">
                    {/* The sender's own function. The old preview here
                        was hand-typed and had drifted from it. */}
                    <p className="followup-bubble">
                      {appointmentReminderText({
                        businessName,
                        clientName: 'Sarah',
                        whenLabel: 'tomorrow at 10:00 AM',
                        address: null,
                      })}
                    </p>
                  </div>
                </div>
                <AutomationTestSend
                  action={sendReminderTestAction}
                  label="Send a test"
                  note="Goes to your account email."
                />
              </div>
            </div>
          </div>
        </AutomationCard>

        {/* Now a real toggle. It used to say "there is nothing to
            switch off, because nothing here fires on its own" — but a
            contractor who wants the texts to stop had to go and revoke
            each person's send permission on Crew & Labor, which is a
            different decision about different people. */}
        <AutomationCard
          group="follow-through"
          id="arrival"
          title="Arrival updates"
          subtitle="Let customers know when you&rsquo;re on the way"
          toggle={{ on: arrivalSettings.enabled, action: toggleAutomationAction.bind(null, 'arrival') }}
          status={{ label: `${arrivalSettings.windowMinutes}-min window`, tone: 'neutral' }}
        >
          <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
            When your crew taps <strong>I&rsquo;m on my way</strong>, the customer gets an arrival window
            and a private tracking link. They can reply from that page &mdash; &ldquo;gate is
            locked&rdquo;, &ldquo;use the side entrance&rdquo; &mdash; and it lands in the job&rsquo;s
            timeline before your tech reaches the door. Who is allowed to send these is set per person on{' '}
            <Link href="/dashboard/crew">Crew &amp; Labor</Link>.
          </p>
          <ArrivalSettingsSection
            businessName={businessName}
            timeZone={arrivalSettings.timeZone}
            windowMinutes={arrivalSettings.windowMinutes}
            enabled={arrivalSettings.enabled}
          />
          <ArrivalExtrasSection
            morningConfirmation={account?.arrival_morning_confirmation === true}
            clockTravel={account?.arrival_clock_travel === true}
            timeClockOn={account?.time_clock_mode !== 'off'}
          />
        </AutomationCard>

        {/* Rebuilt from a paragraph and a hidden preview into the same
            two-column shape the other three follow-through cards use.
            The old card could only describe the cadence in prose because
            there was no cadence to read — the schedule was two hardcoded
            stamps keyed off a constant that exists to color a label. */}
        <AutomationCard
          group="follow-through"
          id="selections"
          title="Choice reminders"
          subtitle="Follow up when clients have selections waiting"
          toggle={{ on: selectionRemindersEnabled, action: toggleAutomationAction.bind(null, 'selections'), enableBlocked: !customerTextingReady, blockedReason: customerTextingBlockReason, offLabel: customerTextingReady ? 'Off' : 'Setup required' }}
        >
          <ChoiceRemindersSection
            enabled={selectionRemindersEnabled}
            businessName={businessName}
            offsets={choiceReminders.offsets}
            hour={choiceReminders.hour}
            template={choiceReminders.template}
            grouping={choiceReminders.grouping}
            timeZoneLabel={accountTimeZoneLabel}
          />
        </AutomationCard>

        {/* Moved here from Business info. It is not a business detail
            like a mailing address — it is a thing that runs for
            customers without the contractor doing anything, which is
            what this tab is. */}
        <AutomationCard
          group="follow-through"
          id="client-portal"
          title="Past customer job lookup"
          subtitle="Let previous customers securely find their job details anytime"
          toggle={{ on: clientPortalEnabled, action: toggleClientPortalAction }}
        >
          <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
            Two years after you finish a job, a customer has a problem and can&apos;t remember who did it or
            what&apos;s still covered &mdash; so they call somebody else. This gives them a page that answers
            both.
          </p>
          <ClientPortalSection
            enabled={clientPortalEnabled}
            businessName={businessName}
            portalUrl={portalUrl}
            hasSite={Boolean(site)}
            published={Boolean(site?.published)}
            linkOn={portalNav.navEnabled}
            linkLabel={portalNav.navLabel}
          />
        </AutomationCard>

        <h2 className="automation-group">Confirmations to you</h2>
        <AutomationCard
          id="quote-confirmation"
          group="confirmations"
          title="Quote confirmation emails"
          subtitle="Email me when a quote goes out"
          toggle={{ on: quoteConfirmationOn, action: toggleAutomationAction.bind(null, 'quote-confirmation') }}
        >
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            When you send a quote, we email the customer their quote and send you a short confirmation of where
            it went &mdash; texted or emailed, and to which number or address. If there was no way to reach them,
            the confirmation says that instead, so you&apos;re not left waiting on a quote that never arrived.
          </p>
          <p className="workspace-details-copy">
            Turn this off if you send enough quotes that the confirmations become noise. It doesn&apos;t change
            what the customer receives.
          </p>
        </AutomationCard>

        <AutomationCard
          id="payment-confirmation"
          group="confirmations"
          title="Payment request confirmations"
          subtitle="Email me when I ask a customer to pay"
          toggle={{ on: paymentConfirmationOn, action: toggleAutomationAction.bind(null, 'payment-confirmation') }}
        >
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            Confirms the amount, and whether it actually reached them. If you created the request without
            texting it, the confirmation says so &mdash; that request is sitting on the job unsent, and it&apos;s
            worth knowing before you wonder why nobody has paid.
          </p>
        </AutomationCard>

        <AutomationCard
          id="review-confirmation"
          group="confirmations"
          title="Review request confirmations"
          subtitle="Email me when a review ask goes out"
          toggle={{ on: reviewConfirmationOn, action: toggleAutomationAction.bind(null, 'review-confirmation') }}
        >
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            One email per review ask, saying who it went to and by which channel. Useful if review requests are
            sent automatically after a job completes and you&apos;d rather not check the job feed to see it happened.
          </p>
        </AutomationCard>

        <AutomationCard
          id="reminder-confirmation"
          group="confirmations"
          title="Appointment reminder summary"
          subtitle="One email a night, not one per customer"
          toggle={{ on: reminderConfirmationOn, action: toggleAutomationAction.bind(null, 'reminder-confirmation') }}
        >
          <p className="workspace-details-copy" style={{ marginTop: 0 }}>
            Reminders go out to <strong>every</strong> customer booked for the next day, so this is deliberately
            a single summary &mdash; how many were reminded, and how many couldn&apos;t be reached. The ones that
            failed haven&apos;t heard from you, which is the part worth acting on.
          </p>
          <p className="workspace-details-copy">
            Off by default, and it only sends on nights when reminders actually went out.
          </p>
        </AutomationCard>

        <h2 className="automation-group">Your briefing</h2>
        <AutomationCard group="briefing" id="daily-digest" title="Daily digest" subtitle="Your business each morning" toggle={{ on: dailyDigestEnabled, action: toggleAutomationAction.bind(null, 'daily-digest') }}>
          {/* No checkbox. The card's own toggle already IS this setting
              — both wrote accounts.daily_digest_enabled — and two
              controls for one boolean is not merely clutter here:

                * they saved differently. The toggle applies on click;
                  the checkbox needed a Save nobody had a reason to
                  press, so unticking it and walking away changed
                  nothing while looking exactly like it had.
                * only one was audited. toggleAutomationAction records
                  an account event; the digest form wrote silently — so
                  the "Who changed what" panel directly below this card
                  would have been missing changes made six inches above
                  it.
                * defaultChecked is uncontrolled, so once it had been
                  clicked it stopped following the toggle, and Save
                  would then write the stale value back and turn the
                  digest on again. */}
          <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
            When on, each morning we email you a short digest of your business — money received,
            new leads, quotes approved, today&apos;s schedule, appointment confirmations, new reviews,
            and clients due to rebook. It only sends on days with something to report.
          </p>
          <AutomationTestSend
            action={sendTestDigestAction}
            label="Send me a test digest"
            className="btn secondary"
            savedLabel="Sent ✓"
          />
        </AutomationCard>

        {/* WHAT THE SWITCHES ABOVE ACTUALLY SAY.
            This lived at the foot of the text inbox, which is the wrong page
            twice over: the inbox is a working surface you open forty times a
            day and this is reference material you read once, and none of the
            32 messages in it is something the inbox sends — they are the output
            of the automations on THIS page. It cost the inbox ~10,000px of
            height on a phone.

            Kept as a `<details>`, closed. It is long by nature, and the point
            of moving it was to stop a long thing sitting open under a short
            one. */}
        <h2 className="automation-group">In your customers&rsquo; words</h2>
        <OutgoingTextCatalogue />

        {settingsHistory.length > 0 ? (
          <>
            <h2 className="automation-group">Recent changes</h2>
            <section className="panel workspace-section-card" id="settings-history">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow">Settings history</p>
                <h3 className="audit-table-title">Who changed what</h3>
              </div>
              <p className="workspace-details-copy" style={{ marginTop: '0.5rem' }}>
                Switching an automation off can quietly stop work coming in, so every flip is recorded here.
              </p>
              <ul className="settings-history-list">
                {settingsHistory.map((event) => (
                  <li key={event.id}>
                    <span className="settings-history-summary">{event.summary}</span>
                    <span className="settings-history-meta">
                      {new Date(event.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: accountTimeZone,
                      })}
                      {event.actor_email ? ` · ${event.actor_email}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
