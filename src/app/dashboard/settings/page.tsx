import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { DEFAULT_BURDEN_PCT, DEFAULT_MIN_MARGIN_PCT } from '@/lib/cost-truth';
import { connectStripeAction, disconnectStripeAction } from '../stripe-actions';
import SignInMethods from './SignInMethods';
import PayoutAccount from './PayoutAccount';
import SettingsTabs from './SettingsTabs';
import FinanceReports from './FinanceReports';
import QuickBooksSection from './QuickBooksSection';
import { connectionStatus } from '@/lib/quickbooks/connection';
import { getAvailableTaxYears, buildProfitAndLoss, buildScheduleCWorksheet, build1099PrepList } from '@/lib/tax-reports';
import SaveButton from '@/components/save-button';
import AddressAutocomplete from '@/components/address-autocomplete';
import AutomationSwitch from '@/components/automation-switch';
import { listAccountEvents } from '@/lib/account-events';
import DeleteAccountButton from './DeleteAccountButton';
import ArrivalSettingsSection from './ArrivalSettingsSection';
import ArrivalExtrasSection from './ArrivalExtrasSection';
import { arrivalSettingsFromAccount } from '@/lib/arrival';
import { updateReminderSettingsAction, updateMailingAddressAction, updateDigestSettingsAction, updateIntakeSettingsAction, updateBusinessBasicsAction, sendTestDigestAction, deleteAccountAction, enableRecommendedAutomationsAction, toggleAutomationAction, toggleSmartIntakeAction } from './actions';
import { toggleClientPortalAction } from './actions';
import { syncQuickBooksAction, backfillQuickBooksAction } from './actions';
import ClientPortalSection from './ClientPortalSection';
import MissedCallSection from './MissedCallSection';
import IntakeContentSection from './IntakeContentSection';
import JobCostingSection from './JobCostingSection';
import ReviewRequestSection from './ReviewRequestSection';
import IntakePreviewModal from '../sites/IntakePreviewModal';
import type { Site } from '@/lib/sites';
import { siteOrigin } from '@/lib/seo/site-pages';
import { displayPhone } from '@/lib/phone';
import { chaseMessage } from '@/lib/selections';
import { ESTIMATE_POSTURES, normalizeEstimatePosture } from '@/lib/estimate-posture';
import { getSiteContent } from '@/lib/site-content';
import { googleReviewUrl } from '@/lib/review-routing';
import {
  FOLLOWUP_MAX_AGE_DAYS,
  MAX_FOLLOWUPS,
  followupSchedule,
  followupScheduleLabel,
  quoteFollowupText,
} from '@/lib/quote-followups';
import { bookingAvailabilityFromAccount } from '@/lib/booking-availability';
import { QUICK_STOP_SETTINGS_COLUMNS } from '@/lib/quick-stop';
import { getTrailingVolume } from '@/lib/payments';
import { getTierInfo } from '@/lib/stripe';
import { formatMoney } from '@/lib/jobs';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// One automation in the grouped, collapsible Automations tab. Collapsed by
// default so the whole tab reads as a scannable index (title + one-liner +
// on/off control); expand to reveal the section's form. The `id` stays on the
// <details> so deep links (#reviews, #daily-digest, …) still resolve and open it.
//
// Pass `toggle` with the action that flips it and it gets a real switch you can
// use from the list without opening the card. The action is explicit rather than
// derived from the id because these don't all live in the same place: most are a
// boolean column on `accounts`, but Intake AI is a flag inside the site content.
// `status` remains for rows with nothing to flip.
type AutomationStatus = { label: string; tone: 'on' | 'off' | 'neutral' };
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
  toggle?: { on: boolean; action: (next: boolean) => Promise<void> };
  // Cards sharing a group name behave as one accordion — opening any of them
  // closes the rest. Native <details name>, the same mechanism the schedule
  // popovers use; browsers without support simply allow several open, which is
  // the old behaviour rather than a broken one.
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
        {toggle ? (
          <AutomationSwitch label={title} on={toggle.on} action={toggle.action} />
        ) : status ? (
          <span className={`automation-status ${status.tone}`}>{status.label}</span>
        ) : null}
        <svg className="automation-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </summary>
      <div className="automation-body">{children}</div>
    </details>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { year?: string; quickbooks?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const [{ data: userData }, { data: identityData }, { data: account }, { data: site }, availableYears, { count: pendingPaymentsCount }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getUserIdentities(),
      supabase.from('accounts').select('account_number, business_name, created_at, connect_onboarded, connect_disabled_at, schedule_day_hours, workday_start, workday_end, job_buffer_minutes, call_textback_enabled, call_forward_number, call_tracking_number, timezone, arrival_updates_enabled, arrival_location_policy, arrival_window_minutes, arrival_morning_confirmation, arrival_clock_travel, time_clock_mode').eq('id', accountId).single(),
      // The whole row: the intake preview renders the REAL intake component
      // against it, so it needs the accent, the template and the rest — a
      // hand-picked subset would render a preview that isn't what visitors see.
      supabase.from('sites').select('*').eq('account_id', accountId).maybeSingle(),
      getAvailableTaxYears(supabase, accountId),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('status', ['requested', 'processing']),
    ]);

  const providers = (identityData?.identities ?? []).map((identity) => identity.provider);
  const businessName = site?.company_name || account?.business_name || 'My Business';
  const arrivalSettings = arrivalSettingsFromAccount(account as Record<string, unknown> | null);

  // Read the auto-review toggle separately and defensively: on a DB where the
  // migration hasn't been applied yet the column is missing, so this degrades
  // to "off" instead of 500-ing the whole settings page.
  const { data: reviewSettings } = await supabase
    .from('accounts')
    .select('auto_review_request')
    .eq('id', accountId)
    .maybeSingle();
  const autoReviewRequest = Boolean(reviewSettings?.auto_review_request);

  // Intake AI tuning + lead priority — read defensively so a pre-migration DB
  // degrades to defaults instead of 500-ing the page.
  const { data: intakeSettings } = await supabase
    .from('accounts')
    .select('estimate_posture, high_value_lead_amount, mute_low_quality_leads, high_value_sms_enabled, alert_phone')
    .eq('id', accountId)
    .maybeSingle();
  const businessBasics = getSiteContent((site?.content as Record<string, unknown> | null | undefined) ?? null);
  // The two ends of the review ask, built the same way the sender builds them so
  // the preview shows the link the customer really taps. The feedback-page one
  // is a real invite token per job; the preview stands in for the token rather
  // than inventing one that looks like somebody's.
  const reviewGoogleUrl = googleReviewUrl({
    placeId: businessBasics.testimonials.googlePlaceId,
    listingUrl: businessBasics.testimonials.googleUrl,
  });
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
  const reviewFeedbackUrl = `${appOrigin}/review/…`;
  const estimatePosture = normalizeEstimatePosture(intakeSettings?.estimate_posture);
  const highValueLeadAmount = intakeSettings?.high_value_lead_amount ? Number(intakeSettings.high_value_lead_amount) : null;
  const muteLowQualityLeads = intakeSettings?.mute_low_quality_leads !== false; // default on
  const highValueSmsEnabled = Boolean(intakeSettings?.high_value_sms_enabled);
  const alertPhone = (intakeSettings?.alert_phone as string | null) || '';

  // Online-booking availability — read defensively so a pre-migration DB degrades
  // to the old-behavior defaults instead of 500-ing the page.
  const { data: bookingSettings } = await supabase
    .from('accounts')
    .select('timezone, booking_enabled, booking_weekdays, booking_windows')
    .eq('id', accountId)
    .maybeSingle();
  const booking = bookingAvailabilityFromAccount(bookingSettings);

  const { data: quickStopSettings } = await supabase
    .from('accounts')
    .select(QUICK_STOP_SETTINGS_COLUMNS)
    .eq('id', accountId)
    .single();
  // Platform fee tier, shown on the Payments tab so a contractor can see the rate
  // they're on and what it takes to reach the next (lower) one.
  const trailingVolume = await getTrailingVolume(accountId);
  const feeTier = getTierInfo(trailingVolume);
  // At-a-glance status for the Automations accordion cards.
  const quickStopEnabled = Boolean((quickStopSettings as { extra_stop_enabled?: boolean } | null)?.extra_stop_enabled);
  const bookingActive = booking.weekdays.length > 0;
  const bookingEnabled = booking.enabled;
  // Intake AI isn't "always on" — enabling the classic quote form in the website
  // builder switches it off. quoteForm.enabled is the source of truth; this is its
  // inverse, exactly as getSiteContent derives it.
  const smartIntakeOn = businessBasics.estimateRanges.enabled;
  // Defensive read, like the other automation flags: a pre-migration row has no
  // column, and the confirmation defaults to on.
  const { data: confirmSettings } = await supabase
    .from('accounts')
    .select('quote_confirmation_email, payment_confirmation_email, review_confirmation_email, reminder_confirmation_email')
    .eq('id', accountId)
    .maybeSingle();
  const confirmRow = (confirmSettings ?? {}) as Record<string, boolean | undefined>;
  // Fall back to each column's own default, matching CONFIRMATION_DEFAULTS.
  const confirmOn = (column: string, fallback: boolean) =>
    typeof confirmRow[column] === 'boolean' ? (confirmRow[column] as boolean) : fallback;
  const quoteConfirmationOn = confirmOn('quote_confirmation_email', true);
  const paymentConfirmationOn = confirmOn('payment_confirmation_email', true);
  const reviewConfirmationOn = confirmOn('review_confirmation_email', true);
  const reminderConfirmationOn = confirmOn('reminder_confirmation_email', false);
  // Settings history. Empty (and harmless) until the account_events migration is
  // applied — listAccountEvents swallows a missing table rather than 500-ing.
  const settingsHistory = await listAccountEvents(supabase, accountId, 8);

  const { data: portalSettings } = await supabase
    .from('accounts')
    .select('client_portal_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const clientPortalEnabled = Boolean(portalSettings?.client_portal_enabled);
  // The address a customer actually uses, on the contractor's OWN host — their
  // custom domain if it's verified, otherwise their subdomain. Null until the
  // site is published, which is also when the page starts resolving at all.
  const portalHostOrigin = site?.published ? siteOrigin(site) : null;
  const portalUrl = portalHostOrigin ? `${portalHostOrigin}/portal` : null;
  const portalNav = businessBasics.clientPortal;

  const { data: costSettings } = await supabase
    .from('accounts')
    .select('default_burden_pct, min_margin_pct')
    .eq('id', accountId)
    .maybeSingle();
  // A stored 0 is a real choice and is kept; the defaults stand in only when
  // there is nothing stored at all. `|| 0` would have conflated the two, which
  // is why this reads the value rather than coercing it.
  const storedBurden = Number(costSettings?.default_burden_pct);
  const storedMargin = Number(costSettings?.min_margin_pct);
  const defaultBurdenPct = Number.isFinite(storedBurden) ? storedBurden : DEFAULT_BURDEN_PCT;
  const minMarginPct = Number.isFinite(storedMargin) ? storedMargin : DEFAULT_MIN_MARGIN_PCT;

  const { data: reviewPageSettings } = await supabase
    .from('accounts')
    .select('review_feedback_page_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const reviewFeedbackPageEnabled = Boolean(reviewPageSettings?.review_feedback_page_enabled);

  const { data: followupSettings } = await supabase
    .from('accounts')
    .select('quote_followups_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const quoteFollowupsEnabled = Boolean(followupSettings?.quote_followups_enabled);

  const { data: reminderSettings } = await supabase
    .from('accounts')
    .select('appointment_reminders_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const appointmentRemindersEnabled = Boolean(reminderSettings?.appointment_reminders_enabled);

  const { data: mailingSettings } = await supabase
    .from('accounts')
    .select('mailing_address')
    .eq('id', accountId)
    .maybeSingle();
  // Older values were typed into a textarea; a newline inside an <input> value
  // renders as nothing, so an existing address would look half-missing until the
  // owner retyped it.
  const mailingAddress = ((mailingSettings?.mailing_address as string | null) ?? '')
    .replace(/\s*\n\s*/g, ', ')
    .trim();

  const { data: digestSettings } = await supabase
    .from('accounts')
    .select('daily_digest_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const dailyDigestEnabled = Boolean(digestSettings?.daily_digest_enabled);
  const allEssentialsOn = autoReviewRequest && quoteFollowupsEnabled && appointmentRemindersEnabled && dailyDigestEnabled;
  const callTextbackEnabled = Boolean((account as { call_textback_enabled?: boolean } | null)?.call_textback_enabled);
  // Shown the way a person writes a phone number, not the way Twilio stores it.
  // The action normalizes back to E.164 on save.
  const callForwardNumber = displayPhone(String((account as { call_forward_number?: string } | null)?.call_forward_number ?? ''));
  const callTrackingNumber = displayPhone(String((account as { call_tracking_number?: string } | null)?.call_tracking_number ?? ''));
  // Defensive, like the other automation reads: pre-migration the column is
  // absent, and the card degrades to "waiting for the first call".
  const { data: callVerified } = await supabase
    .from('accounts')
    .select('call_tracking_verified_at')
    .eq('id', accountId)
    .maybeSingle();
  const callTrackingVerifiedAt = (callVerified?.call_tracking_verified_at as string | null) ?? null;

  // Defensive read: pre-migration the column is absent, and the reminders
  // default on for the same reason the sweep does — a needed-by date the
  // contractor typed IS the opt-in.
  const { data: selectionSettings } = await supabase
    .from('accounts')
    .select('selection_reminders_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const selectionRemindersEnabled = selectionSettings?.selection_reminders_enabled !== false;

  const requestedYear = searchParams.year ? parseInt(searchParams.year, 10) : NaN;
  const selectedYear = availableYears.includes(requestedYear) ? requestedYear : availableYears[0];

  // Never throws and never returns a token — a missing table (feature deployed
  // ahead of its migration) reports "not connected".
  const quickBooksStatus = await connectionStatus(accountId);

  const [pl, subPrep] = await Promise.all([
    buildProfitAndLoss(supabase, accountId, selectedYear),
    build1099PrepList(supabase, accountId, selectedYear),
  ]);
  const scheduleC = buildScheduleCWorksheet(pl);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <div className="workspace-eyebrow-row">
            <p className="eyebrow">Account</p>
            {account ? (
              <span className="account-tag">
                {businessName} · Account #{account.account_number}
              </span>
            ) : null}
          </div>
          <h1 className="workspace-title">Account settings</h1>
          <p className="workspace-lead">
            Your login and payouts, the automations working in the background, and your business
            details, data, and taxes — all in one place.
          </p>
          {account?.created_at ? (
            <p className="account-created-note">Account created {formatDate(account.created_at)}</p>
          ) : null}
        </div>
      </section>

      <SettingsTabs
        tabs={[
          {
            id: 'account',
            label: 'Login & security',
            content: (
              <>
                <section className="panel workspace-section-card">
                  <SignInMethods
                    email={userData.user?.email ?? null}
                    phone={userData.user?.phone ?? null}
                    providers={providers}
                  />
                  <div className="signout-row">
                    <span className="field-hint" style={{ margin: 0 }}>Signed in on this device — you&apos;ll need to sign back in after logging out.</span>
                    <form action="/auth/signout" method="post">
                      <button type="submit" className="btn secondary">Log out</button>
                    </form>
                  </div>
                </section>

                <section className="panel workspace-section-card danger-zone">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow danger-zone-eyebrow">Danger zone</p>
                    <h2>Delete account</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    Permanently delete {businessName} and everything in it, and free your phone/email to use
                    on another account. This can&apos;t be undone.
                  </p>
                  <DeleteAccountButton action={deleteAccountAction} businessName={businessName} />
                </section>
              </>
            ),
          },
          {
            id: 'payments',
            label: 'Payments',
            // Was []. Its sections carried no id either, so this tab could not
            // be linked to AT ALL — the same bug job-costing had, and the
            // reason a contrast sweep that walks tabs by anchor never rendered
            // this tab and never saw what was wrong on it.
            anchors: ['payouts', 'platform-fee'],
            content: (
              <>
                <section className="panel workspace-section-card" id="payouts">
                  <PayoutAccount
                    stripeOnboarded={account?.connect_onboarded ?? false}
                    payoutsPaused={Boolean(account?.connect_disabled_at)}
                    connectStripeAction={connectStripeAction}
                    disconnectStripeAction={disconnectStripeAction}
                    pendingPaymentsCount={pendingPaymentsCount ?? 0}
                  />
                </section>

                <section className="panel workspace-section-card" id="platform-fee">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Platform fee</p>
                    <h2>Your current tier</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    letsgetquoted.com takes a small platform fee on each payment you collect, and it drops
                    as your trailing 12-month volume grows. The rate is locked in on every payment when it&apos;s
                    made — this never re-rates what you&apos;ve already been charged.
                  </p>
                  <div className="fee-tier-card">
                    <div className="fee-tier-head">
                      <span className="fee-tier-rate">{(feeTier.rate * 100).toFixed(2)}%</span>
                      <span className="fee-tier-meta">
                        <strong>Tier {feeTier.tier}</strong>
                        <span>{formatMoney(trailingVolume)} trailing 12-mo volume</span>
                      </span>
                    </div>
                    {feeTier.nextTier ? (
                      <>
                        <div className="fee-tier-bar" role="presentation">
                          <span style={{ width: `${Math.round((feeTier.progressToNext ?? 0) * 100)}%` }} />
                        </div>
                        <p className="field-hint">
                          {formatMoney(feeTier.amountToNextTier ?? 0)} more in the next 12 months moves you to{' '}
                          <strong>{(feeTier.nextTier.rate * 100).toFixed(2)}%</strong> (Tier {feeTier.nextTier.tier}).
                        </p>
                      </>
                    ) : (
                      <p className="field-hint">You&apos;re on the lowest platform fee we offer. 🎉</p>
                    )}
                  </div>
                </section>
              </>
            ),
          },
          {
            id: 'automations',
            label: 'Automations',
            anchors: ['intake-ai', 'booking-availability', 'extra-stop', 'missed-call', 'reviews', 'followups', 'reminders', 'arrival', 'selections', 'client-portal', 'daily-digest'],
            content: (
              <div className="automation-list">
                {allEssentialsOn ? (
                  <div className="automation-recommend done">
                    <span className="automation-recommend-mark" aria-hidden="true">✓</span>
                    <div className="automation-recommend-copy">
                      <strong>Your essential automations are on.</strong>
                      <span>Review asks, quote follow-ups, appointment reminders, and your daily digest are all running. Tune any below.</span>
                    </div>
                  </div>
                ) : (
                  <form action={enableRecommendedAutomationsAction} className="automation-recommend">
                    <div className="automation-recommend-copy">
                      <strong>Turn on the essentials in one click</strong>
                      <span>Enables review asks, quote follow-ups, appointment reminders, and your daily digest with sensible defaults. Tune or turn any off below.</span>
                    </div>
                    <SaveButton>Turn on recommended</SaveButton>
                  </form>
                )}
                <p className="automation-group">Booking &amp; intake</p>
                <AutomationCard
                  id="intake-ai"
                  group="booking-intake"
                  title="Intake AI"
                  subtitle="Instant estimates & lead priority"
                  {...(site
                    ? { toggle: { on: smartIntakeOn, action: toggleSmartIntakeAction } }
                    : { status: { label: 'Needs a website', tone: 'neutral' as const } })}
                >
                  {site && !smartIntakeOn ? (
                    <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
                      <span aria-hidden="true">📝</span>
                      <span>
                        Smart Intake is off, so your website is using the <strong>classic quote form</strong> &mdash;
                        visitors type out their job and wait for you to reply with a price. Switching this back on
                        replaces it with instant AI estimates. Only one intake runs at a time.
                      </span>
                    </div>
                  ) : null}
                  <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    Your website&apos;s AI intake opens the relationship for you: it asks a homeowner{' '}
                    <strong>2&ndash;8 short questions</strong>, gives them a instant ballpark, and captures the
                    details &mdash; building trust in the first 30 seconds, then handing that warm, qualified lead
                    straight to you. The estimate is a smart pre-visit range (you set the exact quote on-site), so it
                    lands most jobs in the right neighborhood and gets the conversation started before a competitor
                    even picks up.
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

                        <label className="checkbox-row" htmlFor="highValueSmsEnabled">
                          <input id="highValueSmsEnabled" name="highValueSmsEnabled" type="checkbox" defaultChecked={highValueSmsEnabled} />
                          <span>Text my phone the moment a high-value lead comes in</span>
                        </label>
                        <div className="field full">
                          <label htmlFor="alertPhone">My mobile for high-value texts</label>
                          <input id="alertPhone" name="alertPhone" type="tel" inputMode="tel" placeholder="(248) 555-0100" defaultValue={alertPhone} />
                          <small className="field-hint">Your own number &mdash; entering it opts you in to your own lead alerts. Standard rates apply.</small>
                        </div>
                      </div>
                    </details>

                    <div className="form-actions">
                      <SaveButton>Save intake settings</SaveButton>
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
                      estimateLabel={businessBasics.quoteForm.estimateLabel}
                      hasCities={businessBasics.serviceAreas.cities.some((city) => city.trim())}
                      smartIntakeOn={smartIntakeOn}
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

                <AutomationCard group="booking-intake" id="missed-call" title="Missed-call text-back" subtitle="Auto-text callers you miss" toggle={{ on: callTextbackEnabled, action: toggleAutomationAction.bind(null, 'missed-call') }}>
                  <MissedCallSection
                    enabled={callTextbackEnabled}
                    businessName={businessName}
                    forwardNumber={callForwardNumber}
                    trackingNumber={callTrackingNumber}
                    verifiedAt={callTrackingVerifiedAt}
                  />
                </AutomationCard>

                <p className="automation-group">Customer follow-through</p>
                <AutomationCard group="follow-through" id="reviews" title="Review requests" subtitle="Auto-ask after a completed job" toggle={{ on: autoReviewRequest, action: toggleAutomationAction.bind(null, 'reviews') }}>
                  <ReviewRequestSection
                    enabled={autoReviewRequest}
                    businessName={businessName}
                    feedbackPage={reviewFeedbackPageEnabled}
                    googleUrl={reviewGoogleUrl}
                    googleName={businessBasics.testimonials.googleName}
                    feedbackUrl={reviewFeedbackUrl}
                  />
                </AutomationCard>

                {/* No form: the checkbox in here wrote quote_followups_enabled,
                    which is the card's own switch. Nothing else was tunable, so
                    what's left is what the automation does and what it says —
                    the cadence read from the constants the cron actually uses,
                    not written out in prose beside them. */}
                <AutomationCard group="follow-through" id="followups" title="Quote follow-ups" subtitle="Nudge unapproved quotes" toggle={{ on: quoteFollowupsEnabled, action: toggleAutomationAction.bind(null, 'followups') }}>
                  <div className={`followup-card${quoteFollowupsEnabled ? '' : ' is-paused'}`}>
                    <p className="followup-state">
                      {quoteFollowupsEnabled
                        ? 'A quote that goes quiet gets a nudge, so you never have to remember which ones did.'
                        : 'Paused — a quote nobody answers stays that way until you chase it yourself.'}
                    </p>

                    <div className="followup-grid">
                      <div className="followup-facts">
                        <div className="followup-fact">
                          <strong>{followupScheduleLabel()}</strong>
                          <span>
                            Counted from the day you shared the quote. {MAX_FOLLOWUPS} nudges, then it leaves them alone.
                          </span>
                        </div>
                        <div className="followup-fact">
                          <strong>Stops the moment they approve</strong>
                          <span>
                            And never chases a quote more than {FOLLOWUP_MAX_AGE_DAYS / 7} weeks old — by then it&apos;s
                            a phone call, not a text.
                          </span>
                        </div>
                        <div className="followup-fact">
                          <strong>Texted, or emailed with no mobile</strong>
                          <span>Only to clients who opted in to texts. A STOP reply ends it for good.</span>
                        </div>
                      </div>

                      <div className="followup-preview">
                        <p className="eyebrow">What the client sees</p>
                        <p className="followup-lede">The first nudge, {followupSchedule()[0]} days after you share a quote.</p>
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
                      </div>
                    </div>
                  </div>
                </AutomationCard>

                <AutomationCard group="follow-through" id="reminders" title="Appointment reminders" subtitle="Day-before text or email" toggle={{ on: appointmentRemindersEnabled, action: toggleAutomationAction.bind(null, 'reminders') }}>
                  <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    When on, the day before a scheduled job we automatically remind the client — texting them if
                    they have a mobile on file that&apos;s opted in, and emailing otherwise. It runs once per
                    appointment and respects text opt-outs, so it cuts no-shows without you lifting a finger.
                  </p>
                  <form action={updateReminderSettingsAction} className="form-grid compact-form">
                    <label className="checkbox-row" htmlFor="appointmentReminders">
                      <input
                        id="appointmentReminders"
                        name="appointmentReminders"
                        type="checkbox"
                        defaultChecked={appointmentRemindersEnabled}
                      />
                      <span>Automatically remind clients the day before their appointment</span>
                    </label>
                    <details className="automation-preview">
                      <summary>Preview the reminder text</summary>
                      <p className="automation-preview-bubble">{businessName} reminder — Sarah, your appointment is coming up tomorrow at 9:00 AM. Reply C to confirm. Reply STOP to opt out.</p>
                    </details>
                    <div className="form-actions">
                      <SaveButton>Save reminder settings</SaveButton>
                    </div>
                  </form>
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

                <AutomationCard
                  group="follow-through"
                  id="selections"
                  title="Choice reminders"
                  subtitle="Chase colours, materials and fixtures you're waiting on"
                  toggle={{ on: selectionRemindersEnabled, action: toggleAutomationAction.bind(null, 'selections') }}
                >
                  <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    A job stops dead while nobody picks the tile. When on, a customer sitting on a decision gets a
                    nudge as your <strong>needed-by date</strong> approaches, and once more if it passes &mdash; with a
                    link straight to the choices. Everything on one job is one message, however many choices are
                    waiting.
                  </p>
                  <div className="automation-prereq">
                    <span aria-hidden="true">🗓️</span>
                    <span>
                      Only choices you gave a <strong>needed by</strong> date get chased. Leave the date blank on a
                      choice that genuinely isn&apos;t urgent and nothing is ever sent about it.
                    </span>
                  </div>
                  <details className="automation-preview">
                    <summary>Preview the reminder text</summary>
                    <p className="automation-preview-bubble">
                      {chaseMessage({
                        businessName,
                        clientName: 'Sarah',
                        count: 2,
                        overdue: false,
                        url: 'letsgetquoted.com/client/jobs/…',
                      })}
                    </p>
                  </details>
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

                <p className="automation-group">Confirmations to you</p>
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

                <p className="automation-group">Your briefing</p>
                <AutomationCard group="briefing" id="daily-digest" title="Daily digest" subtitle="Your business each morning" toggle={{ on: dailyDigestEnabled, action: toggleAutomationAction.bind(null, 'daily-digest') }}>
                  <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    When on, each morning we email you a short digest of your business — money received,
                    new leads, quotes approved, today&apos;s schedule, appointment confirmations, new reviews,
                    and clients due to rebook. It only sends on days with something to report.
                  </p>
                  <form action={updateDigestSettingsAction} className="form-grid compact-form">
                    <label className="checkbox-row" htmlFor="dailyDigest">
                      <input
                        id="dailyDigest"
                        name="dailyDigest"
                        type="checkbox"
                        defaultChecked={dailyDigestEnabled}
                      />
                      <span>Email me a daily digest of my business</span>
                    </label>
                    <div className="form-actions">
                      <SaveButton>Save digest settings</SaveButton>
                    </div>
                  </form>
                  <form action={sendTestDigestAction} style={{ marginTop: '0.75rem' }}>
                    <SaveButton className="btn secondary" pendingLabel="Sending..." savedLabel="Sent ✓">
                      Send me a test digest
                    </SaveButton>
                  </form>
                </AutomationCard>

                {settingsHistory.length > 0 ? (
                  <>
                    <p className="automation-group">Recent changes</p>
                    <section className="panel workspace-section-card" id="settings-history">
                      <div className="section-heading workspace-section-heading compact-heading">
                        <p className="eyebrow">Settings history</p>
                        <h2>Who changed what</h2>
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
            ),
          },
          {
            id: 'business',
            label: 'Business',
            // job-costing was missing, so /dashboard/settings#job-costing
            // resolved to no tab and did nothing at all — the section exists,
            // carries that id, and could not be linked to.
            anchors: ['job-costing', 'business-basics', 'import', 'export', 'marketing-address', 'finances'],
            content: (
              <>
                <p className="automation-group">Business info</p>
                {/* The customer portal used to sit here. It moved to
                    Automations → Customer follow-through: it runs for customers
                    on its own, which is that tab, not a business detail. */}

                <section className="panel workspace-section-card" id="job-costing">
                  <JobCostingSection burdenPct={defaultBurdenPct} minMarginPct={minMarginPct} />
                </section>

                <section className="panel workspace-section-card" id="business-basics">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Business basics</p>
                    <h2>Company name, trade &amp; service area</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    These power your whole website &mdash; your headline, services, service area, and Google listing all
                    build from them. You can also edit them in the <Link href="/dashboard/sites">Website builder</Link>;
                    both stay in sync.
                  </p>
                  <form action={updateBusinessBasicsAction} className="form-grid compact-form">
                    <div className="field full">
                      <label htmlFor="companyName">Company name</label>
                      <input id="companyName" name="companyName" defaultValue={site?.company_name ?? ''} placeholder="Lawn &amp; Order Landscaping" />
                    </div>
                    <div className="field">
                      <label htmlFor="trade">Field of work / trade</label>
                      <input id="trade" name="trade" defaultValue={businessBasics.trade} placeholder="landscaping and lawn care" />
                    </div>
                    <div className="field">
                      <label htmlFor="zip">ZIP code</label>
                      <input id="zip" name="zip" defaultValue={businessBasics.zip} placeholder="64002" />
                      <small className="field-hint">Sets your service area &mdash; the AI names the real nearby cities and towns you serve.</small>
                    </div>
                    <div className="form-actions">
                      <SaveButton>Save business basics</SaveButton>
                    </div>
                  </form>
                </section>

                <section className="panel workspace-section-card" id="marketing-address">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Marketing email</p>
                    <h2>Business mailing address</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    Anti-spam law (CAN-SPAM) requires a real physical postal address in the footer of promotional
                    emails — your campaign blasts, &ldquo;book again&rdquo; invites, and review requests. Add yours
                    here (a PO box is fine). Campaign emails won&apos;t send until this is set.
                  </p>
                  <form action={updateMailingAddressAction} className="form-grid compact-form">
                    <div className="field">
                      <label htmlFor="mailingAddress">Mailing address</label>
                      {/* Verified-as-you-type rather than free text. This address is
                          doing two jobs: the CAN-SPAM footer, and — once geocoded —
                          the point Plan my day measures the drive out and back from.
                          A typo or a city-only entry fails the precise-match test
                          silently, and the only symptom is a day whose mileage is
                          quietly short. Picking a real place makes that impossible. */}
                      <AddressAutocomplete
                        id="mailingAddress"
                        name="mailingAddress"
                        placeholder="123 Main St, Suite 4, Springfield, IL 62704"
                        defaultValue={mailingAddress}
                      />
                      <small className="field-hint">
                        Start typing and pick your address. We also use this to work out the drive to your first job
                        and back from your last.
                      </small>
                    </div>
                    <div className="form-actions">
                      <SaveButton>Save mailing address</SaveButton>
                    </div>
                  </form>
                </section>

                <p className="automation-group">Your data &amp; taxes</p>
                <section className="panel workspace-section-card" id="import">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Get set up</p>
                    <h2>Import &amp; migrate</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    Moving in from another CRM? Drop in everything you exported — customers, price list, jobs,
                    invoices — in any format (CSV, Excel, or phone contacts). We figure out what each file is,
                    match the columns for you, and import them in the right order. Nothing is written until you
                    confirm.
                  </p>
                  <div className="workspace-inline-row">
                    <Link href="/dashboard/import" className="btn primary">Migrate from another CRM</Link>
                    <Link href="/dashboard/clients/import" className="btn secondary">Import customers</Link>
                    <Link href="/dashboard/services/import" className="btn secondary">Import services</Link>
                  </div>
                </section>

                <section className="panel workspace-section-card" id="export">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Take it with you</p>
                    <h2>Export my data</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    Download your records as CSV — one file per list. The columns match what the importer
                    accepts, so anything you export here can be re-imported as-is. It&apos;s your data; no lock-in.
                  </p>
                  <div className="workspace-inline-row">
                    <a href="/api/export/clients" className="btn secondary">⬇ Customers (CSV)</a>
                    <a href="/api/export/services" className="btn secondary">⬇ Price book (CSV)</a>
                    <a href="/api/export/jobs" className="btn secondary">⬇ Jobs (CSV)</a>
                    <a href="/api/export/invoices" className="btn secondary">⬇ Invoices (CSV)</a>
                  </div>
                </section>

                <QuickBooksSection
                  status={quickBooksStatus}
                  notice={searchParams.quickbooks}
                  syncAction={syncQuickBooksAction}
                  backfillAction={backfillQuickBooksAction}
                />

                <section className="panel workspace-section-card" id="finances">
                  <FinanceReports
                    year={selectedYear}
                    availableYears={availableYears}
                    pl={pl}
                    scheduleC={scheduleC}
                    subPrep={subPrep}
                  />
                </section>
              </>
            ),
          },
        ]}
      />
    </main>
  );
}
