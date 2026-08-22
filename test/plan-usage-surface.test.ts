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
 * THE NEW INFORMATION ARCHITECTURE, AND THE TILE THAT IS STILL DELIBERATELY NOT
 * IN IT.
 *
 * The glance strip was three tiles and is now four. THE FOURTH USED TO BE PINNED
 * ABSENT HERE, and the reason it is no longer absent is not that somebody wanted
 * it -- it is that the frame that made it wrong was fixed. The dropped tile said
 * "Estimated this MONTH", and `basePriceCents` is a per-YEAR number on an annual
 * plan, so it would have quoted a Growth annual subscriber $1,188 for a month
 * costing $99. A billing PERIOD is exactly the span that figure covers, so
 * "Projected this period" makes the units agree by construction. The other
 * original objection -- that proration, tax, discounts and account credits are
 * invisible -- was never solved and never will be from this data, so it is
 * answered by SAYING SO on the page rather than by withholding the figure, and
 * the sentence that says so is pinned below.
 *
 * A fifth tile ranking a "best opportunity" is STILL absent, and for a reason
 * that has not changed: the remedies it would rank -- more storage, more office
 * seats -- are withheld SKUs with no live Price. It would press somebody toward
 * a purchase that cannot be completed.
 */
describe('the Plan & usage glance strip claims only what it can prove', () => {
  /**
   * Comments stripped: this block asserts what the page RENDERS, and the file
   * explains in prose exactly which figures it refuses to show. Matching raw
   * source would fail on the explanation for the absence -- which is how a
   * guard ends up rewritten to be satisfiable rather than true.
   */
  const RENDERED = SECTION.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /**
   * THIS GUARD USED TO SAY "reuses the existing metric grid rather than a second
   * one", and it was right until the design changed under it. The glance strip
   * is now the mockup's single bar with hairline dividers and an icon per cell;
   * `.workspace-metric-grid` is separate bordered cards BY CONSTRUCTION and
   * cannot express that. So the strip genuinely is its own component now.
   *
   * What the original guard was protecting -- do not fork a system that already
   * exists -- still holds, and moves to the thing that could still be forked:
   * the icon convention, and the rule that a tone never travels without a word.
   */
  it('does not fork the icon system for its own glyphs', () => {
    // Path data dropped into a 24-box that inherits stroke from CSS, exactly as
    // SettingsTabs does it. A second icon system for four glyphs would be two
    // things to keep in step.
    expect(SECTION).toContain('GLANCE_ICONS');
    expect(SECTION).toContain('viewBox="0 0 24 24"');
    expect(read('src', 'app', 'dashboard', 'settings', 'SettingsTabs.tsx')).toContain('viewBox="0 0 24 24"');
  });

  it('carries a word beside every tone in the bar, not just a colour', () => {
    expect(SECTION).toContain('plan-glancebar');
    const cells = (SECTION.match(/<GlanceCell/g) ?? []).length;
    const statuses = (SECTION.match(/<StatusLine/g) ?? []).length;
    expect(cells).toBe(4);
    // Every cell renders one, and the sections below render more.
    expect(statuses).toBeGreaterThanOrEqual(cells);
  });

  it('frames the money figure per period, never per month', () => {
    expect(SECTION).toContain('Projected this period');
    // The unit bug that kept this tile off the page for two stages. Banning the
    // exact string is the point: the arithmetic is correct only because nothing
    // converts a period into a month anywhere on this surface.
    expect(RENDERED).not.toMatch(/Estimated this month/i);
  });

  it('never prints the projection without saying what it leaves out', () => {
    expect(SECTION).toContain('A projection, not a bill.');
    expect(SECTION).toContain('Excludes tax, proration, discounts and account credits');
    // The platform fee is netted out of collections rather than charged, so
    // adding it here would sum two money flows into a number matching neither.
    // Excluded on purpose, and the page has to admit the exclusion.
    expect(SECTION).toContain('platform fee is taken from the payments you collect');
  });

  it('does not dress a pinned agreement as a failure', () => {
    // Both branches render no number, and only ONE of them is a fault. A
    // workspace pinned to a superseded catalog is active, paying and renewing;
    // "Unavailable" above it is the word a customer screenshots and asks about.
    expect(SECTION).toContain("forecast.basis === 'price_unknown' ? 'Not projected' : 'Unavailable'");
  });

  it('carries a basis word beside the number, never a bare dollar figure', () => {
    // Two of the seven bases are cases where something is MISSING from the
    // total -- an unreadable overage read, and a price set by agreement. A
    // number rendered without its basis reads as an invoice in both.
    expect(SECTION).toContain('forecastStatusWord(forecast, data.plan)');
    expect(SECTION).toContain("case 'plan_plus_unknown':");
    expect(SECTION).toContain('Extra usage could not be read');
  });

  it('still refuses the tile whose remedies cannot be bought', () => {
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
