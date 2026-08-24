import Link from 'next/link';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { loadOfficeTeam } from '@/lib/office-team';
import { loadOverageSummary } from '@/lib/billing/overage-summary';
import { overageSelfServeEnabled } from '@/lib/billing/overage-authorization';
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
import { loadWorkspacePlanUsage, planUsageDashboardEnabled } from '@/lib/billing/plan-usage';
import { formatStorageBytes, loadWorkspaceStorageState } from '@/lib/billing/storage-usage';
import { buildWorkspaceCapacity, loadCrewSeatsUsed } from '@/lib/billing/capacity-usage';
import { loadWorkspaceCreditLots } from '@/lib/billing/credit-lots';
import {
  NO_PURCHASED_SEATS,
  loadPurchasedSeats,
  loadActivePurchasedCapacitySubscriptions,
} from '@/lib/billing/purchased-seats';
import { basePlanSubscriptionCheckoutEnabled } from '@/lib/billing/base-plan-subscription-entrypoint';
import { basePlanSubscriptionPlanChangeEnabled } from '@/lib/billing/plan-change';
import { loadChangeableSubscription, planChangeOptions } from '@/lib/billing/plan-change';
import { parsePlanIntent } from '@/lib/plan-intent';
import { BILLING_PLANS, resolveBillingPlanId } from '@/lib/billing/catalog';
import {
  basePlanSubscriptionCancellationEnabled,
  loadCancellableSubscription,
} from '@/lib/billing/subscription-cancellation';
import {
  loadMerchantOnboardingSurfaceForOwner,
  stripeMerchantOnboardingV2Enabled,
} from '@/lib/billing/merchant-onboarding-entrypoint';
import { topUpPurchaseEnabled } from '@/lib/billing/top-up-purchase-entrypoint';
import { PUBLIC_PRICING_SUMMARY } from '@/lib/pricing';
import PlanUsageSection from './PlanUsageSection';
import OfficeTeamSection from './OfficeTeamSection';
import MerchantOnboardingSection from './MerchantOnboardingSection';

export const metadata = { title: 'Account' };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: {
    year?: string;
    quickbooks?: string;
    merchant_onboarding?: string;
    top_up_checkout?: string;
    // Carried from /pricing through signup. Pre-selects the paid-plan checkout
    // below rather than making someone re-answer a question they already did.
    plan?: string;
    billing?: string;
  };
}) {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const pricingDashboardEnabled = planUsageDashboardEnabled();
  const subscriptionCheckoutEnabled = basePlanSubscriptionCheckoutEnabled();
  const topUpPurchaseCheckoutEnabled = topUpPurchaseEnabled();
  const merchantOnboardingEnabled = stripeMerchantOnboardingV2Enabled();

  const [{ data: userData }, { data: identityData }, { data: account }, { data: site }, { count: pendingPaymentsCount }, planUsage, merchantOnboarding, storageState, purchasedSeats, purchasedCapacitySubscriptions] =
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
      // Dark by default. A disabled rollout performs no entitlement query, so
      // deploying the code ahead of the production migration cannot disturb
      // the existing Account page.
      pricingDashboardEnabled ? loadWorkspacePlanUsage(supabase, accountId) : Promise.resolve(null),
      // A separate exact-1 gate keeps the Accounts v2 surface and its
      // service-role readiness read completely dark. This does not replace or
      // alter the live Recipient payout card above it.
      merchantOnboardingEnabled
        ? loadMerchantOnboardingSurfaceForOwner({ accountId })
        : Promise.resolve(null),
      // The ONE read on this page that does not go through the owner's session
      // client. The effective limit is the plan allowance plus purchased
      // capacity, and workspace_purchased_capacity is deliberately service-role
      // only -- owners see the effect, not the ledger. accountId is already
      // authenticated by requireOwnerContext above and is passed explicitly, so
      // the widened client never widens the scope.
      pricingDashboardEnabled
        ? loadWorkspaceStorageState(createAdminClient(), accountId)
        : Promise.resolve(null),
      // Same posture and the same reason as the storage read above: the ledger
      // behind a purchased seat is service-role only, and the owner is shown its
      // effect rather than its rows. Reads to zero on failure, which is exactly
      // the plan-allowance-only behavior that shipped before it existed.
      pricingDashboardEnabled
        ? loadPurchasedSeats(createAdminClient(), accountId)
        : Promise.resolve(NO_PURCHASED_SEATS),
      pricingDashboardEnabled
        ? loadActivePurchasedCapacitySubscriptions(createAdminClient(), accountId)
        : Promise.resolve([]),
    ]);

  // Its own read, and tolerant of the migrations not being applied. Everything
  // it touches -- office_invitations, and memberships filtered to office --
  // lands ahead of its migration on any environment that has not run it, and
  // loadOfficeTeam already degrades an unreadable team to an empty one rather
  // than throwing. A Settings page that 500s because one card cannot load is a
  // worse failure than a card that says nobody is here.
  const officeTeam = await loadOfficeTeam(createAdminClient(), accountId);

  // Only offered when there is genuinely something to cancel. Same failure
  // posture as the cards above: a subscription read that falls over must not
  // take the whole Settings page with it, and the absence of the panel is the
  // safe direction -- nobody is shown a cancel button that cannot work.
  const cancellable = basePlanSubscriptionCancellationEnabled()
    ? await loadCancellableSubscription(createAdminClient(), accountId)
      .then((subscription) => (subscription
        ? {
          planName: BILLING_PLANS[resolveBillingPlanId(subscription.planCode)].name,
          currentPeriodEnd: subscription.currentPeriodEnd,
          alreadyScheduled: subscription.cancelAtPeriodEnd,
        }
        : null))
      .catch(() => null)
    : null;

  /**
   * Withheld 2026-08-23 because the rail could not record a plan change at all;
   * un-hardcoded 2026-08-23 once it could.
   *
   * WHAT IT WAS PROTECTING AGAINST. `changeBasePlan` calls
   * `stripe.subscriptions.update` with `proration_behavior: 'always_invoice'`,
   * so the difference is taken immediately -- and then every event for that
   * subscription failed to project, permanently, leaving the workspace on the
   * OLD plan's limits, allowances and platform fee while paying the new price.
   * Nothing self-healed, because the only thing that could repair the
   * entitlement was the projector that was refusing it.
   *
   * WHY IT IS NO LONGER A CONSTANT. All of it landed: `20260823200000` gives a
   * plan change its own consent recorder, `20260823210000`-`230000` its own
   * ledger and transitions, `20260823235000` teaches the projector and the
   * binding to read that ledger, and `20260823235500` makes an upgrade hand over
   * the new plan's full allowance. The write path claims its row before calling
   * Stripe and records the proration invoice activation binds to.
   *
   * So there is no longer a second, hidden reason to keep the surface off, and
   * two independent switches would mean turning the rail on required a code
   * change AND an env change -- which is how a flag ends up looking enabled while
   * the feature is invisible. ONE control now:
   * LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED, absent in every environment,
   * which also gates the operation itself inside `changeBasePlan`.
   *
   * The end-to-end projection test in test mode is what should gate turning that
   * flag on -- not a migration, and not a design note.
   */
  const PLAN_CHANGE_PANEL_WITHHELD = !basePlanSubscriptionPlanChangeEnabled();

  const planChange = PLAN_CHANGE_PANEL_WITHHELD ? null : await loadChangeableSubscription(createAdminClient(), accountId)
    .then((subscription) => (subscription && subscription.planCode !== 'flex'
      ? {
        currentPlanCode: subscription.planCode,
        currentBillingInterval: subscription.billingInterval,
        currentPeriodEnd: subscription.currentPeriodEnd,
        pendingPlanCode: subscription.pendingPlanCode,
        pendingEffectiveAt: subscription.pendingEffectiveAt,
        options: planChangeOptions(subscription),
      }
      : null))
    .catch(() => null);

  // Through the SESSION client: every overage table is owner-read and
  // service-role-write, because an owner who could write their own settings row
  // could raise their own cap without leaving evidence. Reading it with the
  // admin client would work and would quietly remove the check that matters.
  // Its own read, and error-tolerant, like the two above it.
  const overage = pricingDashboardEnabled ? await loadOverageSummary(supabase, accountId) : null;

  // A SECOND flag, on top of the one that revealed this tab. Showing somebody
  // what they are spending and letting them authorize more spending are
  // different decisions with different blast radii, and the read half shipped
  // first deliberately. This only decides whether the control RENDERS -- the
  // operation checks the same flag itself, because a gate that lives only where
  // a button is drawn turns out to gate the button.
  const overageSelfServe = pricingDashboardEnabled && overageSelfServeEnabled();

  // OCCUPANCY, to sit beside the entitlement. Through the owner's session client
  // for the same reason the overage read is: crew_owner already scopes it, and
  // widening the client would remove the check rather than satisfy it.
  const crewSeatsUsed = pricingDashboardEnabled
    ? await loadCrewSeatsUsed(supabase, accountId).catch(() => null)
    : null;

  // The lots behind the balances, so a refreshing allowance can be shown
  // against its own denominator rather than against every credit the account
  // has ever been granted. Session client: usage_credit_lots_owner_read is the
  // boundary, and only the columns granted to `authenticated` are selected.
  // Its own `unavailable`, so a refusal here falls back to the balance view
  // rather than emptying the card.
  const creditLots = pricingDashboardEnabled
    ? await loadWorkspaceCreditLots(supabase, accountId).catch(() => ({ kind: 'unavailable' as const }))
    : null;

  const capacity = pricingDashboardEnabled && planUsage
    ? buildWorkspaceCapacity(
      planUsage.plan.kind === 'ready' ? planUsage.plan.limits : null,
      purchasedSeats,
      {
        // loadOfficeTeam degrades an unreadable team to seatsUsed: 0, and a
        // readable workspace ALWAYS has at least the owner in a seat. So zero
        // here means the read failed, not that the office is empty -- and
        // "0 of 2 used" would invent an emptiness that cannot exist.
        officeSeatsUsed: officeTeam.seatsUsed > 0 ? officeTeam.seatsUsed : null,
        crewSeatsUsed,
        // Connected means VERIFIED. A domain saved but never verified serves
        // nothing, so counting it would show a contractor a slot consumed by
        // something that is not working.
        customDomainsUsed: site ? (site.custom_domain && site.custom_domain_verified_at ? 1 : 0) : null,
      },
      storageState,
      formatStorageBytes,
    )
    : null;

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

  // The first-subscription form has its own stricter server switch in addition
  // to the dark Plan & usage surface. With the switch off no control exists in
  // the page; the client mints its stable intent only after an eligible render.
  const showSubscriptionCheckout = subscriptionCheckoutEnabled
    && planUsage?.plan.kind === 'ready'
    && planUsage.plan.planCode === 'flex'
    && planUsage.plan.billingInterval === 'none'
    && planUsage.plan.billingStatus === 'free'
    && planUsage.plan.entitlementState === 'active';

  // Add-ons need no first-subscription eligibility: every plan including Flex
  // may buy credits. Only an active entitlement and the dark switch gate it,
  // and which SKUs appear is the catalog's answer, not this page's.
  const showTopUpPurchase = topUpPurchaseCheckoutEnabled
    && planUsage?.plan.kind === 'ready'
    && planUsage.plan.entitlementState === 'active';
  const topUpCheckoutStatus = searchParams.top_up_checkout === 'success'
    ? 'success' as const
    : searchParams.top_up_checkout === 'canceled'
      ? 'canceled' as const
      : null;

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
    <main className="wide-shell workspace-shell settings-shell">
      <section className="workspace-hero settings-hero panel">
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
            id: 'team',
            label: 'Team',
            anchors: ['office-team'],
            content: (
              <section id="office-team" className="settings-card">
                <h2>Office team</h2>
                <OfficeTeamSection team={officeTeam} />
              </section>
            ),
          },
          ...(pricingDashboardEnabled && planUsage ? [{
            id: 'plan',
            label: 'Plan & usage',
            anchors: [
              'plan-at-a-glance',
              'current-plan',
              'platform-fee',
              // Rendered only for a workspace on the CURRENT catalog -- a pinned
              // one is billed at prices the ladder does not know. Listed
              // unconditionally anyway: an anchor for a section that is absent
              // costs a reader nothing, while a section with no anchor is one
              // they cannot link to at all.
              'plan-fit',
              ...(showSubscriptionCheckout ? ['choose-paid-plan'] : []),
              ...(planChange ? ['change-plan'] : []),
              ...(cancellable ? ['cancel-plan'] : []),
              'usage-balances',
              ...(storageState ? ['workspace-storage'] : []),
              // OverageCard renders whenever `overage` is non-null -- in BOTH
              // its branches, so the id is always in the DOM when the card is.
              // It was missing here, which is not a cosmetic gap: a hash this
              // list does not know resolves to no tab at all, so
              // /dashboard/settings#overage left the reader on Account with the
              // card sitting inside a hidden panel. Guarded now by
              // test/plan-usage-anchors.test.ts.
              ...(overage ? ['overage'] : []),
              ...(showTopUpPurchase ? ['buy-credits'] : []),
              'included-limits',
            ],
            content: (
              <PlanUsageSection
                cancellable={cancellable}
                planChange={planChange}
                planIntent={parsePlanIntent(searchParams.plan ?? null, searchParams.billing ?? null)}
                data={planUsage}
                storage={storageState}
                purchasedSeats={purchasedSeats}
                purchasedCapacitySubscriptions={purchasedCapacitySubscriptions}
                capacity={capacity}
                lots={creditLots}
                overage={overage}
                overageSelfServe={overageSelfServe}
                showSubscriptionCheckout={showSubscriptionCheckout}
                showTopUpPurchase={showTopUpPurchase}
                topUpCheckoutStatus={topUpCheckoutStatus}
              />
            ),
          }] : []),
          {
            id: 'payments',
            label: 'Payments',
            // Was []. Its sections carried no id either, so this tab could not
            // be linked to AT ALL — the same bug job-costing had, and the
            // reason a contrast sweep that walks tabs by anchor never rendered
            // this tab and never saw what was wrong on it.
            anchors: [
              'payouts',
              ...(merchantOnboardingEnabled && merchantOnboarding ? ['merchant-payments'] : []),
              ...(!pricingDashboardEnabled ? ['platform-fee'] : []),
            ],
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

                {merchantOnboardingEnabled && merchantOnboarding ? (
                  <MerchantOnboardingSection
                    surface={merchantOnboarding}
                    feedback={searchParams.merchant_onboarding}
                  />
                ) : null}

                {!pricingDashboardEnabled ? (
                  <section className="panel workspace-section-card" id="platform-fee">
                    <div className="section-heading workspace-section-heading compact-heading">
                      <p className="eyebrow">Plans &amp; pricing</p>
                      <h2>Compare the published plans</h2>
                    </div>
                    <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                      {PUBLIC_PRICING_SUMMARY} The plan-and-usage dashboard is not enabled in this environment yet.
                    </p>
                    <Link className="button secondary" href="/pricing">See plans, limits, and fee terms</Link>
                  </section>
                ) : null}
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
