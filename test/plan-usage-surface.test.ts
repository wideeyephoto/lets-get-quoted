import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const PAGE = read('src', 'app', 'dashboard', 'settings', 'page.tsx');
const SECTION = read('src', 'app', 'dashboard', 'settings', 'PlanUsageSection.tsx');
const TABS = read('src', 'app', 'dashboard', 'settings', 'SettingsTabs.tsx');
const LOADER = read('src', 'lib', 'billing', 'plan-usage.ts');
const DEMO = read('src', 'app', 'demo', 'settings', 'page.tsx');
const ENV = read('.env.example');

describe('the Plan & usage settings surface stays dark until explicitly activated', () => {
  it('uses one server-only flag with an off default', () => {
    expect(LOADER).toContain("import 'server-only'");
    expect(LOADER).toContain("LGQ_PRICING_DASHBOARD_ENABLED");
    expect(LOADER).toContain("=== '1'");
    expect(ENV).toContain('LGQ_PRICING_DASHBOARD_ENABLED=0');
  });

  it('does not query the entitlement tables while disabled', () => {
    expect(PAGE).toContain('pricingDashboardEnabled ? loadWorkspacePlanUsage(supabase, accountId) : Promise.resolve(null)');
  });

  it('uses a canonical static pricing fallback without querying legacy tiers', () => {
    expect(PAGE).toContain('!pricingDashboardEnabled ?');
    expect(PAGE).toContain('{PUBLIC_PRICING_SUMMARY}');
    expect(PAGE).not.toContain('getTrailingVolume');
    expect(PAGE).not.toContain('getTierInfo');
  });
});

describe('Plan & usage navigation', () => {
  it('adds a dedicated tab without changing the Stripe payout destination', () => {
    expect(PAGE).toContain("id: 'plan'");
    expect(PAGE).toContain("label: 'Plan & usage'");
    expect(PAGE).toContain("...(showSubscriptionCheckout ? ['choose-paid-plan'] : [])");
    expect(PAGE).toContain("'usage-balances'");
    expect(PAGE).toContain("'included-limits'");
    expect(PAGE).toContain("id: 'payments'");
    expect(PAGE).toContain("'payouts'");
    expect(PAGE).toContain("...(!pricingDashboardEnabled ? ['platform-fee'] : [])");
    expect(SECTION).toContain('id="platform-fee"');
    expect(TABS).toContain("plan: '");
  });

  it('uses the same rollout gate for demo-tab parity', () => {
    expect(DEMO).toContain('const pricingDashboardEnabled = planUsageDashboardEnabled()');
    expect(DEMO).toContain("...(pricingDashboardEnabled ? [{");
    expect(DEMO).toContain("label: 'Plan & usage'");
  });
});

describe('the contractor-facing claims are bounded by what the ledger knows', () => {
  it('shows available balances rather than pretending to know monthly usage', () => {
    for (const label of ['Text credits', 'Marketing emails', 'AI Intake credits', 'AI writing drafts']) {
      expect(LOADER).toContain(label);
    }
    expect(SECTION).toContain('available`');
    // THE OLD ASSERTION PINNED THE SENTENCE "this is not presented as a monthly
    // usage chart", and it was right to while the surface read only the balance
    // VIEW -- which sums every lot an account was ever granted and cannot tell a
    // monthly allowance from a purchase, so any meter drawn from it read past
    // 100% the first time somebody topped up.
    //
    // credit-lots.ts removed the premise. The meter measures only the open,
    // expiring window, and non-expiring credits are stated as their own figure
    // and never enter the denominator. So the refusal is replaced by the
    // arithmetic that made the refusal unnecessary, and test/credit-lots holds
    // the ">100% is impossible" property directly.
    expect(SECTION).toContain('are counted separately');
    expect(SECTION).not.toContain('progressbar');
    expect(SECTION).not.toContain('fee-tier-bar');
  });

  it('does not expose a purchase or plan-change action before billing mechanics exist', () => {
    expect(SECTION).not.toContain('<button');
    expect(SECTION).not.toContain('<form');
    expect(SECTION).not.toMatch(/Upgrade now|Buy credits|Change plan|Add top-up/i);
  });

  it('reads only the owner-safe entitlement and balance projections', () => {
    expect(LOADER).toContain("from('workspace_entitlements')");
    expect(LOADER).toContain("from('workspace_usage_credit_balances')");
    expect(LOADER.match(/\.eq\('account_id', accountId\)/g) ?? []).toHaveLength(2);
    expect(LOADER).not.toContain('createAdminClient');
    expect(LOADER).not.toContain("from('billing_subscriptions')");
    expect(LOADER).not.toContain("from('usage_credit_lots')");
  });

  it('never prints raw entitlement flags or backend billing identifiers', () => {
    expect(LOADER).not.toContain('feature_flags');
    expect(SECTION).not.toContain('provider_');
    expect(SECTION).not.toContain('stripe_');
  });
});

/**
 * THE NEW INFORMATION ARCHITECTURE, AND THE TWO TILES THAT ARE DELIBERATELY NOT
 * IN IT.
 *
 * The glance strip is three tiles. A fourth showing an estimated monthly cost
 * was designed and dropped, because no upcoming-invoice read exists anywhere in
 * this codebase: the figure would exclude proration, tax, discounts and account
 * credits, and basePriceCents is a per-YEAR number for an annual subscriber. A
 * fifth ranking a "best opportunity" was dropped because the remedies it would
 * rank -- more storage, more office seats -- are withheld SKUs with no live
 * Price. Both are cheap to add back and wrong until the data exists, so they are
 * pinned absent here rather than left to somebody's judgement in a hurry.
 */
describe('the Plan & usage glance strip claims only what it can prove', () => {
  /**
   * Comments stripped: this block asserts what the page RENDERS, and the file
   * explains in prose exactly which figures it refuses to show. Matching raw
   * source would fail on the explanation for the absence -- which is how a
   * guard ends up rewritten to be satisfiable rather than true.
   */
  const RENDERED = SECTION.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('reuses the existing metric grid rather than a second one', () => {
    expect(SECTION).toContain('workspace-metric-grid');
    expect(SECTION).toContain('workspace-metric-label');
    expect(SECTION).toContain('workspace-metric-value');
  });

  it('shows no estimated or forecast money figure', () => {
    expect(RENDERED).not.toMatch(/Estimated this month/i);
    expect(RENDERED).not.toMatch(/\bforecast\b/i);
    expect(RENDERED).not.toMatch(/Best opportunity/i);
  });

  it('states a next event without promising a renewal it cannot see', () => {
    expect(SECTION).toContain('Next event');
    expect(SECTION).toContain('None scheduled');
    // Flex renews nothing, and saying so is the honest version of an empty tile.
    expect(SECTION).toContain('Nothing renews and nothing expires');
  });

  it('carries a word beside every tone, never a color on its own', () => {
    expect(SECTION).toContain('tone-status');
    // StatusLine takes its text as a required child, so a tone cannot be
    // rendered wordless without a type error.
    expect(SECTION).toContain('function StatusLine({ tone, children }: { tone: Tone; children: string })');
  });

  it('renders the storage measurement date it used to discard', () => {
    expect(SECTION).toContain('measuredAt');
    expect(SECTION).toContain('Measured {formatDate(storageState.measuredAt)}');
  });

  it('names the period the extra-usage figure belongs to', () => {
    expect(SECTION).toContain('overage.periodEnd');
    // period_start moves mid-month, which is why the accrual query matches by
    // overlap. It is shown only as the near end of a range, never on its own.
    expect(SECTION).toContain('overage.periodStart');
  });

  it('shows capacity as used-against-entitled, and keeps the entitlement list', () => {
    expect(SECTION).toContain('plan-usage-capacity-grid');
    expect(SECTION).toContain('CapacityMeter');
    expect(SECTION).toContain('Everything included with');
  });
});
