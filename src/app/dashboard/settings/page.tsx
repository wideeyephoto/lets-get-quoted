import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { pickBusinessName } from '@/lib/business-name';
import { DEFAULT_BURDEN_PCT, DEFAULT_MIN_MARGIN_PCT } from '@/lib/cost-truth';
import { connectStripeAction, disconnectStripeAction } from '../stripe-actions';
import SignInMethods from './SignInMethods';
import PayoutAccount from './PayoutAccount';
import SettingsTabs from './SettingsTabs';
import QuickBooksSection from './QuickBooksSection';
import { connectionStatus } from '@/lib/quickbooks/connection';
import SaveButton from '@/components/save-button';
import ThemeToggle from '@/components/theme-toggle';
import AddressAutocomplete from '@/components/address-autocomplete';
import TradeAutocomplete from '@/components/trade-autocomplete';
import ExportData from './ExportData';
import DeleteAccountButton from './DeleteAccountButton';
import { updateBusinessAddressesAction, updateBusinessBasicsAction, deleteAccountAction } from './actions';
import { syncQuickBooksAction, backfillQuickBooksAction, updateInsuranceAction, removeInsuranceAction } from './actions';
import InsuranceSection from './InsuranceSection';
import BusinessWorkspace from './BusinessWorkspace';
import { businessSetup } from '@/lib/business-setup';
import { insuranceState } from '@/lib/insurance';
import { insuranceProofUrl } from '@/lib/insurance-storage';
import JobCostingSection from './JobCostingSection';
import QuoteChangesSection from './QuoteChangesSection';
import { displayPhone } from '@/lib/phone';
import { getSiteContent } from '@/lib/site-content';
import { googleReviewUrl } from '@/lib/review-routing';
import { getTrailingVolume } from '@/lib/payments';
import { getTierInfo } from '@/lib/stripe';
import { formatMoney } from '@/lib/jobs';

export const metadata = { title: 'Account' };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { year?: string; quickbooks?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const [{ data: userData }, { data: identityData }, { data: account }, { data: site }, { count: pendingPaymentsCount }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getUserIdentities(),
      // Narrowed when Automations moved to its own page. Thirteen of these
      // columns — the workday, the buffer, call forwarding, every arrival_* and
      // the time-clock mode — were read for cards that now live on
      // /dashboard/automations, and nothing on this page has consumed them
      // since. ESLint cannot see inside a select string, so an over-wide read
      // like this one goes unnoticed forever unless it is trimmed by hand at
      // the moment its consumers leave.
      supabase.from('accounts').select('account_number, business_name, created_at, connect_onboarded, connect_disabled_at, timezone').eq('id', accountId).single(),
      // Still the whole row: the Business tab reads company_name, published,
      // content and the domain fields off it, and getSiteContent takes the
      // content blob wholesale. (The justification used to be the intake
      // preview, which went to /dashboard/automations with everything else it
      // belonged to.)
      supabase.from('sites').select('*').eq('account_id', accountId).maybeSingle(),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .in('status', ['requested', 'processing']),
    ]);

  const providers = (identityData?.identities ?? []).map((identity) => identity.provider);
  const businessName = pickBusinessName(site, account);

  // Whether customers may change their own extras. Read on its own rather than
  // added to the accounts select above, because that select is a `.single()` —
  // on a database where the migration has not run, naming a column that isn't
  // there fails the whole query and takes the Settings page with it.
  const settingsRead = await supabase.from('accounts').select('client_quote_changes').eq('id', accountId).maybeSingle();
  const settingsRow = settingsRead.error ? null : (settingsRead.data as { client_quote_changes?: boolean | null } | null);
  const clientQuoteChanges = settingsRow?.client_quote_changes === true;

  const businessBasics = getSiteContent((site?.content as Record<string, unknown> | null | undefined) ?? null);
  // The two ends of the review ask, built the same way the sender builds them so
  // the preview shows the link the customer really taps. The feedback-page one
  // is a real invite token per job; the preview stands in for the token rather
  // than inventing one that looks like somebody's.
  const reviewGoogleUrl = googleReviewUrl({
    placeId: businessBasics.testimonials.googlePlaceId,
    listingUrl: businessBasics.testimonials.googleUrl,
  });

  // Platform fee tier, shown on the Payments tab so a contractor can see the rate
  // they're on and what it takes to reach the next (lower) one.
  const trailingVolume = await getTrailingVolume(accountId);
  const feeTier = getTierInfo(trailingVolume);

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

  const { data: mailingSettings } = await supabase
    .from('accounts')
    .select('mailing_address, operating_address, service_center_lat, service_center_lng')
    .eq('id', accountId)
    .maybeSingle();
  // Older values were typed into a textarea; a newline inside an <input> value
  // renders as nothing, so an existing address would look half-missing until the
  // owner retyped it.
  const oneLine = (value: unknown) => ((value as string | null) ?? '').replace(/\s*\n\s*/g, ', ').trim();
  const mailingAddress = oneLine(mailingSettings?.mailing_address);
  const operatingAddress = oneLine(mailingSettings?.operating_address);
  // Whether the address we geocode actually resolved. Null here means Plan my
  // day has no point to measure the drive from, which is invisible on this page
  // and only shows up as a day whose mileage is quietly short.
  const hasServiceCenter = mailingSettings?.service_center_lat != null && mailingSettings?.service_center_lng != null;

  // Never throws and never returns a token — a missing table (feature deployed
  // ahead of its migration) reports "not connected".
  const quickBooksStatus = await connectionStatus(accountId);

  // Proof of insurance. Read straight off the account so a lapsed certificate
  // reports as lapsed on the day it lapses, with no sweep to wait for.
  const { data: insuranceRow } = await supabase
    .from('accounts')
    .select('insurance_path, insurance_filename, insurance_carrier, insurance_policy_number, insurance_coverage_amount, insurance_expires_on, insurance_show_on_quotes, insurance_uploaded_at')
    .eq('id', accountId)
    .maybeSingle();
  const ins = (insuranceRow ?? {}) as Record<string, unknown>;
  const insuranceRecord = {
    path: (ins.insurance_path as string) ?? null,
    filename: (ins.insurance_filename as string) ?? null,
    carrier: (ins.insurance_carrier as string) ?? null,
    policyNumber: (ins.insurance_policy_number as string) ?? null,
    coverageAmount: ins.insurance_coverage_amount != null ? Number(ins.insurance_coverage_amount) : null,
    expiresOn: (ins.insurance_expires_on as string) ?? null,
    showOnQuotes: ins.insurance_show_on_quotes !== false,
  };
  const insuranceUrl = await insuranceProofUrl(accountId, insuranceRecord.path);
  // Expiry is a calendar question, so it is answered in the owner's own zone.
  const insuranceToday = new Date().toLocaleDateString('en-CA', {
    timeZone: (account?.timezone as string) || 'America/Detroit',
  });

  // Is this account still moving in?
  //
  // A proxy, and worth naming as one: no import writes an event, so there is no
  // record of "they migrated". What there is, is a book of customers — and
  // somebody with one is past the point where "Moving in from another CRM?"
  // deserves the top of a section. Five rather than one, because a couple of
  // hand-typed customers is still setting up.
  const { count: clientCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);
  const stillMovingIn = (clientCount ?? 0) < 5;

  // A place id is the thing that actually works — the review ask needs one to
  // send anybody anywhere. A listing URL on its own is a link somebody pasted.
  const googleLinked = Boolean(businessBasics.testimonials.googlePlaceId);

  // "Is my account actually set up?" — the one thing the Business tab could not
  // answer without opening all eight of its forms.
  const setup = businessSetup({
    companyName: site?.company_name ?? null,
    trade: businessBasics.trade || null,
    zip: businessBasics.zip || null,
    operatingAddress: operatingAddress || null,
    mailingAddress: mailingAddress || null,
    hasServiceCenter,
    // A stored value means somebody chose it. NaN means the column is still
    // null and the number on screen is our default, which is a guess about
    // somebody else's business.
    burdenConfigured: Number.isFinite(storedBurden),
    burdenPct: defaultBurdenPct,
    insurance: insuranceState(insuranceRecord, insuranceToday),
    quickBooksConnected: quickBooksStatus.state === 'connected',
  });

  // The profit & loss, Schedule C and 1099 builds used to run HERE, on every
  // render of a page people open to change a phone number. They live on
  // /dashboard/reports now, where somebody is actually asking for them.

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
                    phone={displayPhone(userData.user?.phone ?? '') || null}
                    providers={providers}
                  />
                  <div className="signout-row">
                    <span className="field-hint" style={{ margin: 0 }}>Signed in on this device — you&apos;ll need to sign back in after logging out.</span>
                    <form action="/auth/signout" method="post">
                      <button type="submit" className="btn secondary">Log out</button>
                    </form>
                  </div>
                </section>

                {/* APPEARANCE AND SUPPORT, THE TWO THINGS THE RAIL MENU HAD
                    THAT THIS PAGE DID NOT.
                    The footer dropdown that used to hold them is gone — it was
                    a menu of one real link plus duplicates — so they land here,
                    on the page "Account" now opens directly. Both belong to the
                    PERSON rather than the business: how the tool looks to them,
                    and who they ask when it breaks. That is this tab. */}
                <section className="panel workspace-section-card" id="appearance">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Appearance</p>
                    <h2>Light or dark</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '0.9rem' }}>
                    Auto follows your phone or computer, including its night schedule. There is also a
                    switch in the bottom-left corner of every page for when the light changes and you
                    need it now — it sets Light or Dark, so come back here to hand it back to Auto.
                  </p>
                  <ThemeToggle />
                </section>

                <section className="panel workspace-section-card" id="support">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Support</p>
                    <h2>Help &amp; support</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '0.9rem' }}>
                    Ask us anything and track the answer. This is where support lives — there is no
                    longer a <strong>?</strong> floating over every page.
                  </p>
                  <Link href="/dashboard/help" className="btn secondary">Open help &amp; support</Link>
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
            id: 'business',
            label: 'Business',
            // job-costing was missing, so /dashboard/settings#job-costing
            // resolved to no tab and did nothing at all — the section exists,
            // carries that id, and could not be linked to.
            anchors: ['job-costing', 'business-basics', 'quote-changes', 'import', 'export', 'marketing-address', 'finances', 'insurance', 'quickbooks', 'addresses'],
            content: (
              <BusinessWorkspace
                setup={setup}
                sections={[
        {
          id: 'overview',
          label: 'Overview',
          blurb: 'What is set up, and what still needs you.',
          content: null,
        },
        {
          id: 'profile',
          label: 'Profile & locations',
          blurb: 'Who you are, what you do, and where you work from.',
          anchors: ['business-basics', 'quote-changes', 'marketing-address', 'addresses'],
          content: (
              <>
                {/* The customer portal used to sit here. It moved to
                    Automations → Customer follow-through: it runs for customers
                    on its own, which is that tab, not a business detail. */}

                <QuoteChangesSection enabled={clientQuoteChanges} />

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
                      {/* Suggests from the same vocabulary the /for/<trade>
                          landing pages use, and understands what people call
                          themselves — "electrician" offers "electrical work".
                          Never constrains: trades are stranger than any list. */}
                      <TradeAutocomplete id="trade" name="trade" defaultValue={businessBasics.trade} placeholder="landscaping and lawn care" />
                    </div>
                    <div className="field">
                      <label htmlFor="zip">ZIP code</label>
                      <input id="zip" name="zip" defaultValue={businessBasics.zip} placeholder="64002" />
                      <small className="field-hint">Sets your service area &mdash; the AI names the real nearby cities and towns you serve.</small>
                    </div>
                    <div className="form-actions">
                      <SaveButton onlyWhenChanged>Save business basics</SaveButton>
                    </div>
                  </form>
                </section>

                <section className="panel workspace-section-card" id="addresses">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Locations</p>
                    <h2>Where you work from, and where your post goes</h2>
                  </div>
                  {/* Two fields, because they were one field doing two jobs.
                      CAN-SPAM wants a postal address and a PO box is a perfectly
                      good one; the route planner wants somewhere with a driveway.
                      Whoever did the sensible thing for their post was quietly
                      having every day's mileage measured from a mail counter. */}
                  <form action={updateBusinessAddressesAction} className="form-grid compact-form">
                    <div className="field full">
                      <label htmlFor="operatingAddress">Operating location</label>
                      {/* Verified-as-you-type rather than free text: a typo or a
                          city-only entry fails the precise-match test silently,
                          and the only symptom is a day whose mileage is short. */}
                      <AddressAutocomplete
                        id="operatingAddress"
                        name="operatingAddress"
                        placeholder="The yard, shop or home you leave from"
                        defaultValue={operatingAddress}
                      />
                      <small className="field-hint">
                        Where the working day starts and ends. Used to work out the drive to your first job and back
                        from your last. Leave it blank and we&rsquo;ll use your mailing address below.
                      </small>
                    </div>
                    {/* Keeps the old #marketing-address anchor alive. The
                        section around it was renamed, and a bookmark that opens
                        the right panel but scrolls nowhere looks like it worked. */}
                    <div className="field full" id="marketing-address">
                      <label htmlFor="mailingAddress">Business mailing address</label>
                      <AddressAutocomplete
                        id="mailingAddress"
                        name="mailingAddress"
                        placeholder="123 Main St, Suite 4, Springfield, IL 62704"
                        defaultValue={mailingAddress}
                      />
                      <small className="field-hint">
                        Printed in the footer of promotional emails &mdash; campaign blasts, &ldquo;book again&rdquo;
                        invites and review requests. Anti-spam law (CAN-SPAM) requires a real postal address, and a PO
                        box is fine. Campaign emails won&rsquo;t send until this is set.
                      </small>
                    </div>
                    <div className="form-actions">
                      <SaveButton onlyWhenChanged>Save locations</SaveButton>
                    </div>
                  </form>
                </section>
              </>
          ),
        },
        {
          id: 'costs',
          label: 'Costs & job settings',
          blurb: 'What labour really costs you, and when to warn about a thin job.',
          anchors: ['job-costing'],
          content: (
            <section className="panel workspace-section-card" id="job-costing">
              <JobCostingSection burdenPct={defaultBurdenPct} minMarginPct={minMarginPct} />
            </section>
          ),
        },
        {
          id: 'trust',
          label: 'Trust & compliance',
          blurb: 'The credentials that go in front of a customer.',
          anchors: ['insurance'],
          content: (
                <InsuranceSection
                  record={insuranceRecord}
                  todayKey={insuranceToday}
                  proofUrl={insuranceUrl}
                  uploadedAt={(ins.insurance_uploaded_at as string) ?? null}
                  saveAction={updateInsuranceAction}
                  removeAction={removeInsuranceAction}
                />
          ),
        },
        {
          id: 'apps',
          label: 'Connected apps',
          blurb: 'The other tools your business runs on.',
          anchors: ['quickbooks'],
          content: (
              <>
                <QuickBooksSection
                  status={quickBooksStatus}
                  notice={searchParams.quickbooks}
                  syncAction={syncQuickBooksAction}
                  backfillAction={backfillQuickBooksAction}
                />

                {/* The status lives here, where somebody looking for their
                    integrations looks. The linking itself stays in the website
                    builder — it needs the Google Places library and the
                    builder's own save path, and a second place to set one thing
                    is a second place for it to be wrong. */}
                <section className="panel workspace-section-card" id="google-business">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Google</p>
                    <h2>Google Business Profile</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    {googleLinked ? (
                      <>
                        Linked to <strong>{businessBasics.testimonials.googleName || 'your Google Business Profile'}</strong>.
                        Review requests send customers here, and your star rating shows on your website.
                      </>
                    ) : (
                      <>
                        Not linked. Review requests have nowhere to send a customer, and your website can&rsquo;t show
                        your Google rating until it is.
                      </>
                    )}
                  </p>
                  <div className="workspace-inline-row">
                    <Link href="/dashboard/sites?open=google" className={googleLinked ? 'btn secondary' : 'btn primary'}>
                      {googleLinked ? 'Change the linked profile' : 'Link your Google Business Profile'}
                    </Link>
                    {reviewGoogleUrl ? (
                      <a href={reviewGoogleUrl} target="_blank" rel="noreferrer" className="btn secondary">Open it on Google</a>
                    ) : null}
                  </div>
                </section>
              </>
          ),
        },
        {
          id: 'data',
          label: 'Import & data',
          blurb: 'Bring your records in, or take them out.',
          anchors: ['import', 'export'],
          content: (
              <>
                {/* Migrating is an onboarding action, not an everyday setting.
                    Once there is a book of customers it stops holding the top
                    of the section and becomes one more way in among three. */}
                <section className="panel workspace-section-card" id="import">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">{stillMovingIn ? 'Get set up' : 'Bring data in'}</p>
                    <h2>Import &amp; migrate</h2>
                  </div>
                  {stillMovingIn ? (
                    <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                      Moving in from another CRM? Drop in everything you exported — customers, price list, jobs,
                      invoices — in any format (CSV, Excel, or phone contacts). We figure out what each file is,
                      match the columns for you, and import them in the right order. Nothing is written until you
                      confirm.
                    </p>
                  ) : (
                    <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                      Add records from a file at any time. Nothing is written until you confirm.
                    </p>
                  )}
                  <div className="workspace-inline-row">
                    <Link href="/dashboard/import" className={stillMovingIn ? 'btn primary' : 'btn secondary'}>
                      Migrate from another CRM
                    </Link>
                    <Link href="/dashboard/clients/import" className="btn secondary">Import customers</Link>
                    <Link href="/dashboard/services/import" className="btn secondary">Import services</Link>
                    {/* These two came off the Jobs page, which is not a place
                        anybody sets up their account from. Without them here
                        both importers would exist with nothing linking to them. */}
                    <Link href="/dashboard/jobs/import" className="btn secondary">Import jobs</Link>
                    <Link href="/dashboard/jobs/import-invoices" className="btn secondary">Import invoices</Link>
                  </div>
                </section>

                <section className="panel workspace-section-card" id="export">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Take it with you</p>
                    <h2>Export my data</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    Download your records as CSV. The columns match what the importer accepts, so anything you
                    export here can be re-imported as-is. It&apos;s your data; no lock-in.
                  </p>
                  {/* One action, with the choice behind it. Four pills side by
                      side made picking the SET the first decision, when the
                      first decision is almost always "give me all of it". */}
                  <ExportData />
                  <p className="bz-quick-exports">
                    Or grab one on its own:{' '}
                    <a href="/api/export/clients">customers</a>{', '}
                    <a href="/api/export/services">price book</a>{', '}
                    <a href="/api/export/jobs">jobs</a>{', '}
                    <a href="/api/export/invoices">invoices</a>.
                  </p>
                </section>
              </>
          ),
        },
        {
          id: 'taxes',
          label: 'Taxes & reports',
          blurb: 'Your figures, prepared the way a bookkeeper wants them.',
          anchors: ['finances'],
          content: (
                /* A shortcut, not the reports. They are output, not settings —
                   nothing in them is a preference — and building three of them
                   on every render of a page people open to change a phone
                   number was work nobody asked for. The id stays so
                   /dashboard/settings#finances still lands here. */
                <section className="panel workspace-section-card" id="finances">
                  <div className="section-heading workspace-section-heading compact-heading">
                    <p className="eyebrow">Finances</p>
                    <h2>Financial reports</h2>
                  </div>
                  <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                    Prepare your records for bookkeeping and tax season. These are prep tools, not official IRS
                    forms &mdash; hand them to your accountant, or use them to fill out your own Schedule C.
                  </p>
                  <ul className="bz-report-links">
                    <li><Link href="/dashboard/reports">Profit &amp; loss</Link></li>
                    <li><Link href="/dashboard/reports">Schedule C worksheet</Link></li>
                    <li><Link href="/dashboard/reports">Subcontractor and 1099 report</Link></li>
                  </ul>
                  <Link className="btn primary" href="/dashboard/reports">View financial reports</Link>
                </section>
          ),
        },
                ]}
              />
            ),
          },
        ]}
      />
    </main>
  );
}
