import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('Enhanced Managed Ads Dashboard Screen (/dashboard/marketing/ads)', () => {
  const SCREEN_SRC = read('src/app/dashboard/marketing/ads/ManagedAdsScreen.tsx');
  const CSS_SRC = read('src/app/dashboard/marketing/ads/ManagedAdsScreen.module.css');
  const API_SRC = read('src/app/api/stripe/ad-budget/route.ts');

  it('renders comprehensive trust chips and AI recommendation strategy with weekly drip & auto-refill wallet', () => {
    expect(SCREEN_SRC).toContain('trustChipsBar');
    expect(SCREEN_SRC).toContain('Weekly Drip ($176–$616/wk) or Auto-Refill Wallet');
    expect(SCREEN_SRC).toContain('Zero Agency Retainers ($0 vs $2,500/mo)');
    expect(SCREEN_SRC).toContain('&lt;60s Speed-to-Lead AI SMS');
    expect(SCREEN_SRC).toContain('Weather Surge &amp; Capacity Guard');
    expect(SCREEN_SRC).toContain('Closed-Loop Revenue Sync');
    expect(SCREEN_SRC).toContain('Cancel Anytime');
    expect(SCREEN_SRC).toContain('Weekly Drip Allocation');
    expect(SCREEN_SRC).toContain('Why Weekly Drip Billing?');
  });

  it('supports the Auto-Refilling Advertising Wallet option with deposit, refill threshold, and max monthly spend cap', () => {
    expect(SCREEN_SRC).toContain('fundingModelToggleRow');
    expect(SCREEN_SRC).toContain('Auto-Refill Wallet');
    expect(SCREEN_SRC).toContain('walletConfigContainer');
    expect(SCREEN_SRC).toContain('Starting Deposit &amp; Auto-Refill Amount');
    expect(SCREEN_SRC).toContain('wallet-deposit-250');
    expect(SCREEN_SRC).toContain('Auto-Refill Trigger');
    expect(SCREEN_SRC).toContain('MAX Monthly Spend Cap');
    expect(SCREEN_SRC).toContain('walletFlowCard');
    expect(SCREEN_SRC).toContain('Auto-Refill Wallet Lifecycle &amp; Safeguards');
    expect(SCREEN_SRC).toContain('Zero Risk Guarantee');

    expect(CSS_SRC).toContain('.fundingModelToggleRow');
    expect(CSS_SRC).toContain('.fundingModelBtn');
    expect(CSS_SRC).toContain('.walletConfigContainer');
    expect(CSS_SRC).toContain('.depositPresetsGrid');
    expect(CSS_SRC).toContain('.walletFlowCard');
    expect(CSS_SRC).toContain('.walletStepsRow');
  });

  it('provides an interactive ROI & revenue calculator with sliders and live metrics', () => {
    expect(SCREEN_SRC).toContain('roiCalcCard');
    expect(SCREEN_SRC).toContain('Projected Return on Ad Spend (ROAS)');
    expect(SCREEN_SRC).toContain('Average Job Revenue');
    expect(SCREEN_SRC).toContain('Estimate Close Rate');
    expect(SCREEN_SRC).toContain('roiResultsGrid');
    expect(SCREEN_SRC).toContain('effectiveLeads');
    expect(SCREEN_SRC).toContain('wonJobs');
    expect(SCREEN_SRC).toContain('grossRevenue');
    expect(SCREEN_SRC).toContain('roas');
  });

  it('includes a 6-view preview console with SMS chat demo and keyword transparency', () => {
    expect(SCREEN_SRC).toContain("'mobile' | 'desktop' | 'meta' | 'retargeting' | 'sms' | 'keywords'");
    expect(SCREEN_SRC).toContain('smsDemoContainer');
    expect(SCREEN_SRC).toContain('12s Response');
    expect(SCREEN_SRC).toContain('keywordExplorerCard');
    expect(SCREEN_SRC).toContain('kwPillTarget');
    expect(SCREEN_SRC).toContain('kwPillNegative');
  });

  it('includes deep-dive sections for the 4-Stage Engine, Smart Shield Trio, Agency Comparison, Milestones, and FAQs', () => {
    expect(SCREEN_SRC).toContain('The 4-Stage Closed-Loop Customer Acquisition Engine');
    expect(SCREEN_SRC).toContain('Hour 0: Instant Google MCC Provisioning');
    expect(SCREEN_SRC).toContain('Hour 1: Dynamic Message-Match Intake');
    expect(SCREEN_SRC).toContain('Instant: Sub-60s Speed-to-Lead Auto-SMS');
    expect(SCREEN_SRC).toContain('Ongoing: Closed-Loop Revenue Sync');

    expect(SCREEN_SRC).toContain('AI Smart Shield Trio: Zero Wasted Dollars');
    expect(SCREEN_SRC).toContain('Weather Surge Radar');
    expect(SCREEN_SRC).toContain('Fully-Booked Capacity Guard');
    expect(SCREEN_SRC).toContain('Negative Waste Filter');

    expect(SCREEN_SRC).toContain('Let’s Get Quoted Autopilot vs. Traditional Agencies');
    expect(SCREEN_SRC).toContain('compTable');

    expect(SCREEN_SRC).toContain('What to Expect Over Your First 90 Days');
    expect(SCREEN_SRC).toContain('Calibration &amp; Ingestion');
    expect(SCREEN_SRC).toContain('Conversion Acceleration');
    expect(SCREEN_SRC).toContain('Offline Revenue Scaling');

    expect(SCREEN_SRC).toContain('Frequently Asked Questions (FAQs)');
    expect(SCREEN_SRC).toContain('faqList');
  });

  it('supports interactive campaign dayparting and schedule customization', () => {
    expect(SCREEN_SRC).toContain('scheduleSectionCard');
    expect(SCREEN_SRC).toContain('Active Days &amp; Hours');
    expect(SCREEN_SRC).toContain('⚡ Weekdays (Mon–Fri · 7 AM–6 PM)');
    expect(SCREEN_SRC).toContain('🌟 24/7 Always On (All Week)');
    expect(SCREEN_SRC).toContain('daysGrid');
    expect(SCREEN_SRC).toContain('hoursConfigBox');
    expect(SCREEN_SRC).toContain('schedulePacingSummary');
    expect(SCREEN_SRC).toContain('Concentrated Daily Pace');

    expect(CSS_SRC).toContain('.scheduleSectionCard');
    expect(CSS_SRC).toContain('.daysGrid');
    expect(CSS_SRC).toContain('.dayBtn');
    expect(CSS_SRC).toContain('.hoursConfigBox');
    expect(CSS_SRC).toContain('.schedulePacingSummary');
  });

  it('supports active customer billing portal in Stripe API route', () => {
    expect(API_SRC).toContain("if (body.action === 'portal')");
    expect(API_SRC).toContain('createAdBudgetBillingPortalSession');
  });

  it('supports AI Smart Field for custom campaign focus and verified buyer search terms', () => {
    expect(SCREEN_SRC).toContain('customFocusSectionCard');
    expect(SCREEN_SRC).toContain('Customization &amp; ROI');
    expect(SCREEN_SRC).toContain('custom-focus-input');
    expect(SCREEN_SRC).toContain('focusPillsRow');
    expect(SCREEN_SRC).toContain('$1,500 Off Full Replacement');
    expect(SCREEN_SRC).toContain('Generac Whole-Home Generators');
    expect(SCREEN_SRC).toContain('aiComprehensionBox');
    expect(SCREEN_SRC).toContain('AI Comprehension &amp; Search Verification');
    expect(SCREEN_SRC).toContain('aiKeywordsVerificationGrid');

    expect(CSS_SRC).toContain('.customFocusSectionCard');
    expect(CSS_SRC).toContain('.focusInput');
    expect(CSS_SRC).toContain('.aiComprehensionBox');
    expect(CSS_SRC).toContain('.aiKeywordsVerificationGrid');
  });

  it('renders the Ad Wallet Burn & Depletion Predictor widget with runway pacing and weekend surge detection', () => {
    expect(SCREEN_SRC).toContain('walletBurnWidget');
    expect(SCREEN_SRC).toContain('Ad Wallet Runway &amp; Depletion Forecast');
    expect(SCREEN_SRC).toContain('walletBurnDaysPill');
    expect(SCREEN_SRC).toContain('Estimated Runway');
    expect(SCREEN_SRC).toContain('Daily Burn Rate');
    expect(SCREEN_SRC).toContain('Predicted Refill Date');
    expect(SCREEN_SRC).toContain('Weekend Search Surge Active (+35%)');

    expect(CSS_SRC).toContain('.walletBurnWidget');
    expect(CSS_SRC).toContain('.walletBurnHeader');
    expect(CSS_SRC).toContain('.walletBurnDaysPill');
    expect(CSS_SRC).toContain('.walletBurnGrid');
    expect(CSS_SRC).toContain('.walletBurnSurgeAlert');
  });

  it('renders the Google Ads 10/10 Quality Score & Message-Match Readiness Meter with tripartite scoring', () => {
    expect(SCREEN_SRC).toContain('qualityScoreCard');
    expect(SCREEN_SRC).toContain('Google Ads Quality Score Readiness');
    expect(SCREEN_SRC).toContain('10/10 Quality Score');
    expect(SCREEN_SRC).toContain('Expected CTR');
    expect(SCREEN_SRC).toContain('Ad Relevance');
    expect(SCREEN_SRC).toContain('Landing Page Experience');
    expect(SCREEN_SRC).toContain('100% Message-Match Verification Chain');
    expect(SCREEN_SRC).toContain('messageMatchChain');

    expect(CSS_SRC).toContain('.qualityScoreCard');
    expect(CSS_SRC).toContain('.qualityScoreHeader');
    expect(CSS_SRC).toContain('.qualityScoreBadge');
    expect(CSS_SRC).toContain('.qualityScoreGrid');
    expect(CSS_SRC).toContain('.messageMatchChain');
  });

  it('renders the Google Trifecta Dominance Hub (Search Ads + LSA + GBP Maps 3-Pack)', () => {
    expect(SCREEN_SRC).toContain('The Google Dominance Trifecta: Search Ads, Local Services & Google Maps 3-Pack');
    expect(SCREEN_SRC).toContain('Google Trifecta (Ads + LSA + GBP)');
    expect(SCREEN_SRC).toContain('lsaSynergyCard');
    expect(SCREEN_SRC).toContain('googleTrifectaGrid');
    expect(SCREEN_SRC).toContain('trifectaCol');
    expect(SCREEN_SRC).toContain('Google Guaranteed (LSA)');
    expect(SCREEN_SRC).toContain('Google Search Ads (PPC)');
    expect(SCREEN_SRC).toContain('Google Maps 3-Pack (GBP)');
    expect(SCREEN_SRC).toContain('The 3-Pillar Google Dominance Synergy');

    expect(CSS_SRC).toContain('.lsaSynergyCard');
    expect(CSS_SRC).toContain('.googleTrifectaGrid');
    expect(CSS_SRC).toContain('.trifectaCol');
    expect(CSS_SRC).toContain('.lsaColHeader');
    expect(CSS_SRC).toContain('.lsaFeatureList');
    expect(CSS_SRC).toContain('.lsaSynergyBanner');
  });

  it('renders the Seasonal Demand Posture & Multiplier Badge with trade-specific directive', () => {
    expect(SCREEN_SRC).toContain('seasonalDemandBadge');
    expect(SCREEN_SRC).toContain('seasonalDemandCard');
    expect(SCREEN_SRC).toContain('Trade Seasonal Pricing &amp; Bidding Directive');
    expect(CSS_SRC).toContain('.seasonalDemandBadge');
    expect(CSS_SRC).toContain('.seasonalDemandCard');
  });

  it('renders Closed-Loop Offline Revenue Synchronization telemetry connected to Google Ads API v20', () => {
    expect(SCREEN_SRC).toContain('offlineSyncCard');
    expect(SCREEN_SRC).toContain('Closed-Loop Offline Revenue Synchronization');
    expect(SCREEN_SRC).toContain('offlineSyncBadge');
    expect(SCREEN_SRC).toContain('Active &amp; Synced with Google Ads API v20');
    expect(SCREEN_SRC).toContain('Enhanced Offline Conversions');
    expect(SCREEN_SRC).toContain('Max Value / Target ROAS');

    expect(CSS_SRC).toContain('.offlineSyncCard');
    expect(CSS_SRC).toContain('.offlineSyncHeader');
    expect(CSS_SRC).toContain('.offlineSyncBadge');
    expect(CSS_SRC).toContain('.offlineSyncGrid');
    expect(CSS_SRC).toContain('.offlineSyncItem');
  });

  it('renders Speed-to-Lead velocity conversion benchmark with 12s vs 42m comparison', () => {
    expect(SCREEN_SRC).toContain('speedToLeadBenchmarkBox');
    expect(SCREEN_SRC).toContain('Speed-to-Lead Conversion Velocity Benchmark');
    expect(SCREEN_SRC).toContain('+391% Close Rate Advantage');
    expect(SCREEN_SRC).toContain('78% Lead-to-Appointment Rate');

    expect(CSS_SRC).toContain('.speedToLeadBenchmarkBox');
    expect(CSS_SRC).toContain('.benchmarkRow');
    expect(CSS_SRC).toContain('.benchmarkBar');
    expect(CSS_SRC).toContain('.benchmarkBarFillFast');
    expect(CSS_SRC).toContain('.benchmarkBarFillSlow');
  });

  it('renders Negative Keyword Waste Prevention Ticker with live category pills and estimated monthly savings', () => {
    expect(SCREEN_SRC).toContain('negativeWasteTicker');
    expect(SCREEN_SRC).toContain('100+ Negative Search Queries Scrubbed 24/7');
    expect(SCREEN_SRC).toContain('wasteCategoryPill');
    expect(SCREEN_SRC).toContain('wasteSavingsTag');
    expect(SCREEN_SRC).toContain('Saves ~$340–$620/mo in Wasted Clicks');

    expect(CSS_SRC).toContain('.negativeWasteTicker');
    expect(CSS_SRC).toContain('.wasteCategoryPill');
    expect(CSS_SRC).toContain('.wasteSavingsTag');
  });

  it('has corresponding CSS styles for all enhanced modules', () => {
    expect(CSS_SRC).toContain('.roiCalcCard');
    expect(CSS_SRC).toContain('.smsDemoContainer');
    expect(CSS_SRC).toContain('.keywordExplorerCard');
    expect(CSS_SRC).toContain('.stepsGrid');
    expect(CSS_SRC).toContain('.shieldCardsGrid');
    expect(CSS_SRC).toContain('.compTable');
    expect(CSS_SRC).toContain('.milestonesGrid');
    expect(CSS_SRC).toContain('.faqList');
  });
});


