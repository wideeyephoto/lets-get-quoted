import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const PAGE = read('src', 'app', 'dashboard', 'settings', 'page.tsx');
const SECTION = read('src', 'app', 'dashboard', 'settings', 'PlanUsageSection.tsx');

describe('Ad $ Balance in Settings Usage Section', () => {
  it('reads adCampaign wallet state from site content on the settings page and passes it to PlanUsageSection', () => {
    expect(PAGE).toContain('adWallet={(site?.content as Record<string, unknown> | null | undefined)?.adCampaign as AdBudgetWalletState | undefined ?? null}');
    expect(SECTION).toContain('adWallet = null');
    expect(SECTION).toContain('adWallet?: AdBudgetWalletState | null');
  });

  it('renders AdBalanceCard in the balance grid alongside credit resources', () => {
    expect(SECTION).toContain('<AdBalanceCard adWallet={adWallet} />');
    expect(SECTION).toContain('function AdBalanceCard({ adWallet }: { adWallet?: AdBudgetWalletState | null })');
  });

  it('formats the ad balance as exact dollar amount or clean unconfigured state', () => {
    expect(SECTION).toContain('`$${(balanceCents / 100).toFixed(2)} available`');
    expect(SECTION).toContain("'Not configured'");
  });

  it('links directly to the Google & Meta ads management cockpit at /dashboard/marketing/ads', () => {
    expect(SECTION).toContain('href="/dashboard/marketing/ads"');
    expect(SECTION).toContain("isConfigured ? 'Manage Ads ↗' : '+ Launch Ads'");
  });

  it('calculates honest status tones and warning cues for low balance, paused, and past due states', () => {
    expect(SECTION).toContain("status === 'past_due' || status === 'failed'");
    expect(SECTION).toContain("? 'danger'");
    expect(SECTION).toContain("status === 'paused'");
    expect(SECTION).toContain("? 'warn'");
    expect(SECTION).toContain("balanceCents <= refillThresholdCents");
    expect(SECTION).toContain("? 'warn'");
    expect(SECTION).toContain(": 'healthy'");
    expect(SECTION).toContain('Payment past due — click Manage to update card');
    expect(SECTION).toContain('Campaign paused — bidding suspended');
  });

  it('renders visual spend progress meter when active spend caps or monthly targets exist', () => {
    expect(SECTION).toContain('percentUsed !== null ?');
    expect(SECTION).toContain('plan-usage-storage-meter');
    expect(SECTION).toContain('plan-usage-storage-meter-fill');
    expect(SECTION).toContain('ad spend cap used');
  });

  it('supports Auto-Refill Wallet, Weekly Drip, and Monthly Fixed funding models', () => {
    expect(SECTION).toContain("fundingModel === 'auto_refill_wallet'");
    expect(SECTION).toContain('Auto-refills when balance drops below');
    expect(SECTION).toContain("fundingModel === 'weekly_drip'");
    expect(SECTION).toContain('Weekly drip:');
    expect(SECTION).toContain('Monthly budget:');
  });

  it('includes the ad $ balance in the credit fold summary note', () => {
    expect(SECTION).toContain('const adSummary = adWallet && adWallet.status && adWallet.status !== \'inactive\'');
    expect(SECTION).toContain('`Ads: $${((adWallet.walletBalanceCents ?? 0) / 100).toFixed(2)}`');
    expect(SECTION).toContain("'Ads: Standby'");
  });

  it('supports dedicated ad / marketing icon in ResourceIcon', () => {
    expect(SECTION).toContain("norm.includes('ad') || norm.includes('advertising') || norm.includes('campaign') || norm.includes('google')");
  });
});
