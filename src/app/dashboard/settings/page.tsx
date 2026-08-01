import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { connectStripeAction, disconnectStripeAction } from '../stripe-actions';
import SignInMethods from './SignInMethods';
import PayoutAccount from './PayoutAccount';
import SettingsTabs from './SettingsTabs';
import FinanceReports from './FinanceReports';
import { getAvailableTaxYears, buildProfitAndLoss, buildScheduleCWorksheet, build1099PrepList } from '@/lib/tax-reports';
import SaveButton from '@/components/save-button';
import AddressAutocomplete from '@/components/address-autocomplete';
import AutomationSwitch from '@/components/automation-switch';
import { listAccountEvents } from '@/lib/account-events';
import DeleteAccountButton from './DeleteAccountButton';
import { updateReviewSettingsAction, updateFollowupSettingsAction, updateReminderSettingsAction, updateMailingAddressAction, updateDigestSettingsAction, updateIntakeSettingsAction, updateBookingAvailabilityAction, updateBusinessBasicsAction, sendTestDigestAction, deleteAccountAction, enableRecommendedAutomationsAction, updateCallTextbackSettingsAction, toggleAutomationAction, toggleSmartIntakeAction } from './actions';
import { ESTIMATE_POSTURES, normalizeEstimatePosture } from '@/lib/estimate-posture';
import { getSiteContent } from '@/lib/site-content';
import { WEEKDAY_LABELS, BOOKING_WINDOW_PRESETS, TIMEZONE_OPTIONS, bookingAvailabilityFromAccount } from '@/lib/booking-availability';
import { EXTRA_STOP_SETTINGS_COLUMNS } from '@/lib/extra-stop';
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
  searchParams: { year?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const [{ data: userData }, { data: identityData }, { data: account }, { data: site }, availableYears, { count: pendingPaymentsCount }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getUserIdentities(),
      supabase.from('accounts').select('account_number, business_name, created_at, connect_onboarded, connect_disabled_at, schedule_day_hours, workday_start, workday_end, job_buffer_minutes, call_textback_enabled, call_forward_number, call_tracking_number').eq('id', accountId).single(),
      supabase.from('sites').select('id, company_name, content').eq('account_id', accountId).maybeSingle(),
      getAvailableTaxYears(supabase, accountId),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('status', ['requested', 'processing']),
    ]);

  const providers = (identityData?.identities ?? []).map((identity) => identity.provider);
  const businessName = site?.company_name || account?.business_name || 'My Business';

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
  const estimatePosture = normalizeEstimatePosture(intakeSettings?.estimate_posture);
  const highValueLeadAmount = intakeSettings?.high_value_lead_amount ? Number(intakeSettings.high_value_lead_amount) : null;
  const muteLowQualityLeads = intakeSettings?.mute_low_quality_leads !== false; // default on
  const highValueSmsEnabled = Boolean(intakeSettings?.high_value_sms_enabled);
  const alertPhone = (intakeSettings?.alert_phone as string | null) || '';

  // Online-booking availability — read defensively so a pre-migration DB degrades
  // to the old-behavior defaults instead of 500-ing the page.
  const { data: bookingSettings } = await supabase
    .from('accounts')
    .select('timezone, booking_enabled, booking_weekdays, booking_windows, booking_max_per_day, booking_lead_days, instant_book_enabled, instant_book_min_amount, instant_book_radius_miles, instant_book_geo_mode, instant_book_drive_time')
    .eq('id', accountId)
    .maybeSingle();
  const booking = bookingAvailabilityFromAccount(bookingSettings);

  const { data: extraStopSettings } = await supabase
    .from('accounts')
    .select(EXTRA_STOP_SETTINGS_COLUMNS)
    .eq('id', accountId)
    .single();
  // Platform fee tier, shown on the Payments tab so a contractor can see the rate
  // they're on and what it takes to reach the next (lower) one.
  const trailingVolume = await getTrailingVolume(accountId);
  const feeTier = getTierInfo(trailingVolume);
  // At-a-glance status for the Automations accordion cards.
  const extraStopEnabled = Boolean((extraStopSettings as { extra_stop_enabled?: boolean } | null)?.extra_stop_enabled);
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
  const instantBookEnabled = Boolean(bookingSettings?.instant_book_enabled);
  const instantBookMinAmount = bookingSettings?.instant_book_min_amount ? Number(bookingSettings.instant_book_min_amount) : 0;
  const instantBookRadius = bookingSettings?.instant_book_radius_miles ? Number(bookingSettings.instant_book_radius_miles) : 15;
  const instantBookGeoMode = bookingSettings?.instant_book_geo_mode === 'restrict' ? 'restrict' : 'prefer';
  const instantBookDriveTime = Boolean(bookingSettings?.instant_book_drive_time);

  const { data: gatingSettings } = await supabase
    .from('accounts')
    .select('review_gating_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const reviewGatingEnabled = Boolean(gatingSettings?.review_gating_enabled);

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
  const callForwardNumber = String((account as { call_forward_number?: string } | null)?.call_forward_number ?? '');
  const callTrackingNumber = String((account as { call_tracking_number?: string } | null)?.call_tracking_number ?? '');

  const requestedYear = searchParams.year ? parseInt(searchParams.year, 10) : NaN;
  const selectedYear = availableYears.includes(requestedYear) ? requestedYear : availableYears[0];

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
            anchors: [],
            content: (
              <>
                <section className="panel workspace-section-card">
                  <PayoutAccount
                    stripeOnboarded={account?.connect_onboarded ?? false}
                    payoutsPaused={Boolean(account?.connect_disabled_at)}
                    connectStripeAction={connectStripeAction}
                    disconnectStripeAction={disconnectStripeAction}
                    pendingPaymentsCount={pendingPaymentsCount ?? 0}
                  />
                </section>

                <section className="panel workspace-section-card">
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
            anchors: ['intake-ai', 'booking-availability', 'extra-stop', 'missed-call', 'reviews', 'followups', 'reminders', 'daily-digest'],
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
                  <p className="workspace-details-copy">
                    Estimate wording, pricing posture, lead filters and high-value alerts are all tuned in the{' '}
                    <Link href="/dashboard/sites">website builder</Link> &mdash; they change what the AI asks and how it
                    prices, so they live next to the page itself.
                  </p>
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
                </AutomationCard>

                <AutomationCard group="booking-intake" id="booking-availability" title="Online booking" subtitle="Days & windows customers can grab" toggle={{ on: bookingEnabled, action: toggleAutomationAction.bind(null, 'booking') }}>
                  {bookingEnabled && !bookingActive ? (
                    <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
                      <span aria-hidden="true">⚠️</span>
                      <span>Booking is on, but no weekdays are selected below &mdash; so nothing is bookable yet. Pick the days you take work.</span>
                    </div>
                  ) : null}
                  <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    This controls the times customers can grab on your public <strong>Book a time</strong> page. Pick
                    the days you take work, the arrival windows you offer, and how many bookings a day is enough. A
                    booking still lands as a request for you to confirm &mdash; this just decides what&apos;s offered.
                  </p>
                  <form action={updateBookingAvailabilityAction} className="form-grid compact-form">
                    <label className="checkbox-row" htmlFor="instantBookEnabled">
                      <input id="instantBookEnabled" name="instantBookEnabled" type="checkbox" defaultChecked={instantBookEnabled} />
                      <span>
                        <strong>Only let qualified jobs book instantly.</strong> When on, the Book page asks a
                        couple of quick questions for an instant AI estimate first &mdash; small, out-of-area, or
                        work-you-don&apos;t-take jobs are routed to &ldquo;request a callback&rdquo; instead of grabbing a
                        slot. Off = booking is open to everyone.
                      </span>
                    </label>
                    <div className="field full">
                      <label htmlFor="instantBookMinAmount">Minimum estimated job value to book instantly ($)</label>
                      <input id="instantBookMinAmount" name="instantBookMinAmount" type="number" min="0" step="100" inputMode="numeric" placeholder="e.g. 500" defaultValue={instantBookMinAmount || ''} />
                      <small className="field-hint">A job whose instant estimate tops out below this is sent to request-a-callback instead of taking a premium slot. Leave blank/0 for no floor. Only applies when the toggle above is on.</small>
                    </div>

                    <div className="field full">
                      <label htmlFor="timezone">Your timezone</label>
                      <select id="timezone" name="timezone" defaultValue={booking.timezone}>
                        {TIMEZONE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <small className="field-hint">So booking days line up with your local calendar &mdash; not the server&apos;s.</small>
                    </div>

                    <div className="field full">
                      <label>Days you accept bookings</label>
                      <div className="checkbox-grid">
                        {WEEKDAY_LABELS.map((label, day) => (
                          <label className="checkbox-chip" key={day}>
                            <input type="checkbox" name="bookingWeekday" value={day} defaultChecked={booking.weekdays.includes(day)} />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      <small className="field-hint">Uncheck a day to take it off the public calendar. Clear them all to pause online booking.</small>
                    </div>

                    <div className="field full">
                      <label>Arrival windows you offer</label>
                      <div className="checkbox-grid">
                        {BOOKING_WINDOW_PRESETS.map((window) => (
                          <label className="checkbox-chip" key={window.time}>
                            <input type="checkbox" name="bookingWindow" value={window.time} defaultChecked={booking.windowTimes.includes(window.time)} />
                            <span>{window.label}</span>
                          </label>
                        ))}
                      </div>
                      <small className="field-hint">Coarse on purpose &mdash; a customer picks a part of the day, and you set the exact time when you confirm.</small>
                    </div>

                    <details className="advanced-settings">
                      <summary>Advanced — capacity, timing &amp; route matching</summary>
                      <div className="form-grid compact-form" style={{ marginTop: '0.7rem' }}>
                        <div className="field">
                          <label htmlFor="bookingMaxPerDay">Max bookings per day</label>
                          <input id="bookingMaxPerDay" name="bookingMaxPerDay" type="number" min="1" max="50" step="1" inputMode="numeric" defaultValue={booking.maxPerDay} />
                          <small className="field-hint">Once a day hits this many jobs, it stops offering slots.</small>
                        </div>
                        <div className="field">
                          <label htmlFor="bookingLeadDays">Soonest a customer can book</label>
                          <select id="bookingLeadDays" name="bookingLeadDays" defaultValue={String(booking.leadDays)}>
                            <option value={0}>Same day</option>
                            <option value={1}>From tomorrow</option>
                            <option value={2}>2 days out</option>
                            <option value={3}>3 days out</option>
                            <option value={7}>A week out</option>
                          </select>
                          <small className="field-hint">Gives you lead time to plan your route.</small>
                        </div>

                        <div className="field">
                          <label htmlFor="instantBookRadius">&ldquo;Nearby&rdquo; radius (miles)</label>
                          <input id="instantBookRadius" name="instantBookRadius" type="number" min="1" max="100" step="1" inputMode="numeric" defaultValue={instantBookRadius} />
                          <small className="field-hint">How close one of your existing jobs counts as &ldquo;we&apos;ll already be in your area&rdquo; that day.</small>
                        </div>
                        <div className="field">
                          <label htmlFor="instantBookGeoMode">Days near your existing jobs</label>
                          <select id="instantBookGeoMode" name="instantBookGeoMode" defaultValue={instantBookGeoMode}>
                            <option value="prefer">Prefer &mdash; show nearby days first</option>
                            <option value="restrict">Restrict &mdash; only offer nearby days</option>
                          </select>
                          <small className="field-hint">Restrict keeps routes tight; a customer with no nearby day is offered a callback instead. Needs your business address (below) geocoded — set it under Business &rarr; mailing address. Only applies when the gate above is on.</small>
                        </div>
                        <label className="checkbox-row" htmlFor="instantBookDriveTime">
                          <input id="instantBookDriveTime" name="instantBookDriveTime" type="checkbox" defaultChecked={instantBookDriveTime} />
                          <span>Use real <strong>driving distance &amp; time</strong> for &ldquo;nearby&rdquo; (more accurate than straight-line, and shows &ldquo;~X min away&rdquo;). Uses your Google key and needs the <em>Distance Matrix API</em> enabled &mdash; it falls back to straight-line if not.</span>
                        </label>
                      </div>
                    </details>

                    <div className="form-actions">
                      <SaveButton>Save booking availability</SaveButton>
                    </div>
                  </form>
                </AutomationCard>

                <AutomationCard group="booking-intake" id="extra-stop" title="Extra Stop" subtitle="Same-day &ldquo;add me to your route&rdquo;" toggle={{ on: extraStopEnabled, action: toggleAutomationAction.bind(null, 'extra-stop') }}>
                  {!account?.connect_onboarded ? (
                    <div className="automation-prereq" style={{ marginBottom: '0.9rem' }}>
                      <span aria-hidden="true">💳</span>
                      <span>Extra Stop collects a fee before the visit — <Link href="/dashboard/settings#payments">connect Stripe</Link> to get paid. You can still set it up now.</span>
                    </div>
                  ) : null}
                  {/* The thirty-odd settings that used to live here moved to the
                      Extra Stops page, where the requests they govern are. What
                      belongs on an Automations tab is the switch and the way in. */}
                  <p className="workspace-details-copy" style={{ marginTop: 0 }}>
                    A customer asks to be fitted in today — mid-day or at the end of your route. You review
                    the job, propose an arrival window and set a one-off fee; they pay before it&apos;s
                    booked.
                  </p>
                  <Link className="btn secondary" href="/dashboard/extra-stops#extra-stop-setup">
                    Adjust Extra Stop settings →
                  </Link>
                </AutomationCard>

                <AutomationCard group="booking-intake" id="missed-call" title="Missed-call text-back" subtitle="Auto-text callers you miss" toggle={{ on: callTextbackEnabled, action: toggleAutomationAction.bind(null, 'missed-call') }}>
                  <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    When a call to your tracking number goes unanswered, we instantly text the caller back so the
                    lead doesn&apos;t go to a competitor — and log it on your leads board to follow up.
                  </p>
                  <form action={updateCallTextbackSettingsAction} className="form-grid compact-form">
                    <label className="checkbox-row" htmlFor="callTextbackEnabled">
                      <input id="callTextbackEnabled" name="callTextbackEnabled" type="checkbox" defaultChecked={callTextbackEnabled} />
                      <span>Text callers back automatically when I miss a call</span>
                    </label>
                    <div className="field">
                      <label htmlFor="callForwardNumber">Ring my phone at</label>
                      <input id="callForwardNumber" name="callForwardNumber" type="tel" inputMode="tel" placeholder="(248) 555-0100" defaultValue={callForwardNumber} />
                      <small className="field-hint">Where your tracking number forwards calls before falling back to a text.</small>
                    </div>
                    <div className="field">
                      <label htmlFor="callTrackingNumber">Your tracking number</label>
                      <input id="callTrackingNumber" name="callTrackingNumber" type="tel" inputMode="tel" placeholder="(248) 555-0199" defaultValue={callTrackingNumber} />
                      <small className="field-hint">The number customers call. Put this on your website/ads instead of your cell.</small>
                    </div>
                    <div className="automation-prereq">
                      <span aria-hidden="true">📞</span>
                      <span>Point that number&apos;s <strong>Voice webhook</strong> to <code>https://letsgetquoted.com/api/twilio/voice</code> in Twilio. Don&apos;t have a number yet? Contact support and we&apos;ll set one up.</span>
                    </div>
                    <div className="form-actions">
                      <SaveButton>Save missed-call settings</SaveButton>
                    </div>
                  </form>
                </AutomationCard>

                <p className="automation-group">Customer follow-through</p>
                <AutomationCard group="follow-through" id="reviews" title="Review requests" subtitle="Auto-ask after a completed job" toggle={{ on: autoReviewRequest, action: toggleAutomationAction.bind(null, 'reviews') }}>
                  <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    When on, marking a job complete automatically asks the client for a Google review — texted if
                    they have a mobile on file, emailed otherwise. It only sends once per job, and you can always
                    send the request by hand from any completed job.
                  </p>
                  <form action={updateReviewSettingsAction} className="form-grid compact-form">
                    <label className="checkbox-row" htmlFor="autoReviewRequest">
                      <input
                        id="autoReviewRequest"
                        name="autoReviewRequest"
                        type="checkbox"
                        defaultChecked={autoReviewRequest}
                      />
                      <span>Ask for a review automatically when I mark a job complete</span>
                    </label>
                    <label className="checkbox-row" htmlFor="reviewGating">
                      <input
                        id="reviewGating"
                        name="reviewGating"
                        type="checkbox"
                        defaultChecked={reviewGatingEnabled}
                      />
                      <span>
                        Screen reviews first — clients tap a rating; 4–5★ go to Google, 1–3★ come back to you as private
                        feedback instead of a public review
                      </span>
                    </label>
                    <div className="automation-prereq">
                      <span aria-hidden="true">🔗</span>
                      <span>Reviews need a Google Business Profile to point to — <Link href="/dashboard/sites">link yours in the Website builder</Link> so the ask has somewhere to go.</span>
                    </div>
                    <details className="automation-preview">
                      <summary>Preview the review text</summary>
                      <p className="automation-preview-bubble">Hi Sarah, thanks for choosing {businessName}! If we earned it, a quick review means the world to a small business: [your Google review link]. Reply STOP to opt out.</p>
                    </details>
                    <div className="form-actions">
                      <SaveButton>Save review settings</SaveButton>
                    </div>
                  </form>
                </AutomationCard>

                <AutomationCard group="follow-through" id="followups" title="Quote follow-ups" subtitle="Nudge unapproved quotes" toggle={{ on: quoteFollowupsEnabled, action: toggleAutomationAction.bind(null, 'followups') }}>
                  <p className="workspace-details-copy" style={{ marginTop: 0, marginBottom: '1rem' }}>
                    When on, we gently nudge clients who were sent a quote but haven&apos;t approved it yet —
                    up to twice (around day 2 and day 5), texting them if they have a mobile on file and emailing
                    otherwise. Nudges stop as soon as the quote is approved, and respect text opt-outs.
                  </p>
                  <form action={updateFollowupSettingsAction} className="form-grid compact-form">
                    <label className="checkbox-row" htmlFor="quoteFollowups">
                      <input
                        id="quoteFollowups"
                        name="quoteFollowups"
                        type="checkbox"
                        defaultChecked={quoteFollowupsEnabled}
                      />
                      <span>Automatically follow up on quotes that haven&apos;t been approved</span>
                    </label>
                    <details className="automation-preview">
                      <summary>Preview the follow-up text</summary>
                      <p className="automation-preview-bubble">Hi Sarah, just checking in on your quote from {businessName}. Ready to move forward? Review and approve it here: [link]. Reply STOP to opt out.</p>
                    </details>
                    <div className="form-actions">
                      <SaveButton>Save follow-up settings</SaveButton>
                    </div>
                  </form>
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
            anchors: ['business-basics', 'import', 'export', 'marketing-address', 'finances'],
            content: (
              <>
                <p className="automation-group">Business info</p>
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
