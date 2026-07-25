import { requireOwnerContext } from '@/lib/auth';
import { connectStripeAction, disconnectStripeAction } from '../stripe-actions';
import SignInMethods from './SignInMethods';
import PayoutAccount from './PayoutAccount';
import SettingsTabs from './SettingsTabs';
import FinanceReports from './FinanceReports';
import { getAvailableTaxYears, buildProfitAndLoss, buildScheduleCWorksheet, build1099PrepList } from '@/lib/tax-reports';
import SaveButton from '@/components/save-button';
import DeleteAccountButton from './DeleteAccountButton';
import { updateScheduleDayHoursAction, updateReviewSettingsAction, updateDepositSettingsAction, updateFollowupSettingsAction, updateReminderSettingsAction, updateMailingAddressAction, updateDigestSettingsAction, sendTestDigestAction, deleteAccountAction } from './actions';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
      supabase.from('accounts').select('account_number, business_name, created_at, connect_onboarded, schedule_day_hours').eq('id', accountId).single(),
      supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
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

  const { data: gatingSettings } = await supabase
    .from('accounts')
    .select('review_gating_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const reviewGatingEnabled = Boolean(gatingSettings?.review_gating_enabled);

  const { data: depositSettings } = await supabase
    .from('accounts')
    .select('deposit_on_approval, deposit_percent')
    .eq('id', accountId)
    .maybeSingle();
  const depositOnApproval = Boolean(depositSettings?.deposit_on_approval);
  const depositPercent = Number(depositSettings?.deposit_percent) || 25;

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
  const mailingAddress = (mailingSettings?.mailing_address as string | null) ?? '';

  const { data: digestSettings } = await supabase
    .from('accounts')
    .select('daily_digest_enabled')
    .eq('id', accountId)
    .maybeSingle();
  const dailyDigestEnabled = Boolean(digestSettings?.daily_digest_enabled);

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
            Manage how you get paid and how you sign in, so you&apos;re never locked out of your
            business or stuck waiting on a payout.
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
            label: 'Account',
            content: (
              <>
                <section className="panel workspace-section-card">
                  <SignInMethods
                    email={userData.user?.email ?? null}
                    phone={userData.user?.phone ?? null}
                    providers={providers}
                  />
                </section>

                <section className="panel workspace-section-card">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Session</p>
                    <h2>Log out</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    Sign out of this device. You&apos;ll need to sign back in to access your dashboard.
                  </p>
                  <form action="/auth/signout" method="post">
                    <button type="submit" className="btn danger">
                      Log out
                    </button>
                  </form>
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
            anchors: ['deposits'],
            content: (
              <>
                <section className="panel workspace-section-card">
                  <PayoutAccount
                    stripeOnboarded={account?.connect_onboarded ?? false}
                    connectStripeAction={connectStripeAction}
                    disconnectStripeAction={disconnectStripeAction}
                    pendingPaymentsCount={pendingPaymentsCount ?? 0}
                  />
                </section>

                <section className="panel workspace-section-card" id="deposits">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Deposits</p>
                    <h2>Deposit on approval</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    When on, the moment a client approves their quote we create a deposit request for the
                    percentage below and, if they have a mobile on file, text them the secure pay link — so you
                    collect money before the work starts. It runs once per job, and you can always request a
                    deposit by hand. Requires Stripe payouts to be connected.
                  </p>
                  <form action={updateDepositSettingsAction} className="form-grid compact-form">
                    <label className="checkbox-row" htmlFor="depositOnApproval">
                      <input
                        id="depositOnApproval"
                        name="depositOnApproval"
                        type="checkbox"
                        defaultChecked={depositOnApproval}
                      />
                      <span>Request a deposit automatically when a client approves a quote</span>
                    </label>
                    <div className="field">
                      <label htmlFor="depositPercent">Deposit percentage</label>
                      <input
                        id="depositPercent"
                        name="depositPercent"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        defaultValue={depositPercent}
                        required
                      />
                    </div>
                    <div className="form-actions">
                      <SaveButton>Save deposit settings</SaveButton>
                    </div>
                  </form>
                </section>
              </>
            ),
          },
          {
            id: 'automations',
            label: 'Automations',
            anchors: ['reviews', 'followups', 'reminders', 'daily-digest'],
            content: (
              <>
                <section className="panel workspace-section-card" id="reviews">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Reviews</p>
                    <h2>Automatic review requests</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    When on, marking a job complete automatically asks the client for a Google review — texted if
                    they have a mobile on file, emailed otherwise. It only sends once per job, and you can always
                    send the request by hand from any completed job. Link your Google Business Profile in the
                    website builder so the review has somewhere to go.
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
                    <div className="form-actions">
                      <SaveButton>Save review settings</SaveButton>
                    </div>
                  </form>
                </section>

                <section className="panel workspace-section-card" id="followups">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Follow-ups</p>
                    <h2>Automatic quote follow-ups</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
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
                    <div className="form-actions">
                      <SaveButton>Save follow-up settings</SaveButton>
                    </div>
                  </form>
                </section>

                <section className="panel workspace-section-card" id="reminders">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Reminders</p>
                    <h2>Appointment reminders</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
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
                    <div className="form-actions">
                      <SaveButton>Save reminder settings</SaveButton>
                    </div>
                  </form>
                </section>

                <section className="panel workspace-section-card" id="daily-digest">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Daily digest</p>
                    <h2>Your business, once a day</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
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
                </section>
              </>
            ),
          },
          {
            id: 'business',
            label: 'Business',
            anchors: ['marketing-address', 'finances'],
            content: (
              <>
                <section className="panel workspace-section-card">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Scheduling</p>
                    <h2>Workday length</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    Estimated job hours are spread across the calendar using this daily capacity. A 10-hour job stays on one day when this is set to 10.
                  </p>
                  <form action={updateScheduleDayHoursAction} className="form-grid compact-form">
                    <div className="field">
                      <label htmlFor="scheduleDayHours">Hours in a workday</label>
                      <input
                        id="scheduleDayHours"
                        name="scheduleDayHours"
                        type="number"
                        min="1"
                        max="24"
                        step="0.25"
                        defaultValue={account?.schedule_day_hours ?? 8}
                        required
                      />
                    </div>
                    <div className="form-actions">
                      <SaveButton>Save schedule settings</SaveButton>
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
                      <textarea
                        id="mailingAddress"
                        name="mailingAddress"
                        rows={3}
                        placeholder={'123 Main St, Suite 4\nSpringfield, IL 62704'}
                        defaultValue={mailingAddress}
                      />
                    </div>
                    <div className="form-actions">
                      <SaveButton>Save mailing address</SaveButton>
                    </div>
                  </form>
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
