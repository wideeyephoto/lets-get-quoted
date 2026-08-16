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
    expect(SECTION).toContain('this is not presented as a monthly usage chart');
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
