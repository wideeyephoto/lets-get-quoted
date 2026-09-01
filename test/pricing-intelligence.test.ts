import { describe, it, expect } from 'vitest';
import {
  extractZipFromAddress,
  isJobWon,
  isJobLost,
  getSeasonForMonth,
  resolveTradeDemandPosture,
  computeZipPricingIntelligence,
  computeSeasonPricingIntelligence,
  computeCloseRatePricingIntelligence,
  computeAccountPricingIntelligence,
  formatPricingIntelligenceForPrompt,
  type HistoricalPricingJob,
} from '@/lib/pricing-intelligence';
import { formatQuoteHistory, type HistoricalQuote } from '@/lib/quote-draft';
import { buildDraftInstructions, type DraftContext } from '@/lib/quote-draft-ai';

describe('Pricing Intelligence - ZIP Extraction and Intelligence', () => {
  it('extracts 5-digit ZIP codes accurately from various address formats', () => {
    expect(extractZipFromAddress('1204 South Congress Ave, Austin, TX 78704')).toBe('78704');
    expect(extractZipFromAddress('450 Main St, Seattle, WA 98101-1234')).toBe('98101');
    expect(extractZipFromAddress('78701')).toBe('78701');
    expect(extractZipFromAddress('No zip code present here')).toBeNull();
    expect(extractZipFromAddress(null)).toBeNull();
    expect(extractZipFromAddress('')).toBeNull();
  });

  it('computes localized ZIP pricing signals and price delta vs account baseline', () => {
    const jobs: HistoricalPricingJob[] = [
      { id: 'j1', scope: 'Water heater in 78704', quotedAmount: 3200, address: '120 S 1st St, Austin TX 78704', status: 'complete' },
      { id: 'j2', scope: 'Repipe in 78704', quotedAmount: 3600, address: '400 Barton Springs, Austin TX 78704', status: 'complete' },
      { id: 'j3', scope: 'Drain clean in 78704', quotedAmount: 400, address: '900 Oltorf, Austin TX 78704', status: 'archived' },
      { id: 'j4', scope: 'Other area job', quotedAmount: 1800, address: '50 Round Rock Ave, Round Rock TX 78664', status: 'complete' },
      { id: 'j5', scope: 'Other area job 2', quotedAmount: 2000, address: '60 Round Rock Ave, Round Rock TX 78664', status: 'complete' },
    ];

    const intel = computeZipPricingIntelligence(jobs, '1500 S Congress Ave, Austin TX 78704');
    expect(intel).not.toBeNull();
    expect(intel?.targetZip).toBe('78704');
    expect(intel?.sampleCount).toBe(3);
    expect(intel?.wonCount).toBe(2);
    expect(intel?.closeRatePct).toBe(67);
    expect(intel?.avgQuotedAmount).toBe(2400); // (3200 + 3600 + 400)/3
    expect(intel?.avgWonAmount).toBe(3400); // (3200 + 3600)/2
    expect(intel?.accountAvgAmount).toBe(2200); // (3200+3600+400+1800+2000)/5
    expect(intel?.priceDeltaPctVsAccountAvg).toBe(9); // (2400-2200)/2200 = 9%
    expect(intel?.isTargetZipMatch).toBe(true);
    expect(intel?.summary).toContain('ZIP 78704');
    expect(intel?.summary).toContain('67% win rate');
  });

  it('handles target addresses with no prior jobs gracefully', () => {
    const jobs: HistoricalPricingJob[] = [
      { id: 'j1', scope: 'Plumbing in 78704', quotedAmount: 2000, address: 'Austin TX 78704', status: 'complete' },
    ];
    const intel = computeZipPricingIntelligence(jobs, '100 North St, Dallas TX 75201');
    expect(intel?.targetZip).toBe('75201');
    expect(intel?.sampleCount).toBe(0);
    expect(intel?.isTargetZipMatch).toBe(false);
    expect(intel?.summary).toContain('new market area');
  });
});

describe('Pricing Intelligence - Seasonal Trade Posture and Learning', () => {
  it('correctly maps months to seasonal quarters', () => {
    expect(getSeasonForMonth(0)).toBe('winter'); // Jan
    expect(getSeasonForMonth(3)).toBe('spring'); // Apr
    expect(getSeasonForMonth(6)).toBe('summer'); // Jul
    expect(getSeasonForMonth(9)).toBe('fall');   // Oct
  });

  it('resolves trade-specific seasonal demand multipliers and guidance', () => {
    // Roofing peak in Summer (month 6 = July)
    const roofingSummer = resolveTradeDemandPosture('roofing', 6);
    expect(roofingSummer.demandPosture).toBe('peak');
    expect(roofingSummer.seasonalMultiplier).toBe(1.2);
    expect(roofingSummer.guidance).toContain('Peak season demand');

    // Roofing winter off-peak (month 0 = Jan)
    const roofingWinter = resolveTradeDemandPosture('roofing', 0);
    expect(roofingWinter.demandPosture).toBe('off_peak');
    expect(roofingWinter.seasonalMultiplier).toBe(0.85);

    // HVAC dual peak (Summer heat month 6, Winter freeze month 0)
    const hvacSummer = resolveTradeDemandPosture('hvac', 6);
    expect(hvacSummer.demandPosture).toBe('peak');
    expect(hvacSummer.seasonalMultiplier).toBe(1.25);

    const hvacWinter = resolveTradeDemandPosture('hvac', 0);
    expect(hvacWinter.demandPosture).toBe('peak');
    expect(hvacWinter.seasonalMultiplier).toBe(1.2);

    const hvacSpring = resolveTradeDemandPosture('hvac', 3);
    expect(hvacSpring.demandPosture).toBe('shoulder');
  });

  it('computes historical seasonal performance from past jobs', () => {
    const jobs: HistoricalPricingJob[] = [
      { id: 'j1', scope: 'AC install in July', quotedAmount: 5500, createdAt: '2025-07-15T10:00:00Z', status: 'complete' },
      { id: 'j2', scope: 'AC repair in August', quotedAmount: 1200, createdAt: '2025-08-01T10:00:00Z', status: 'complete' },
      { id: 'j3', scope: 'Winter heating in Jan', quotedAmount: 3000, createdAt: '2026-01-10T10:00:00Z', status: 'complete' },
    ];

    // Reference date in July 2026 (month index 6 = Summer)
    const refDate = new Date('2026-07-20T12:00:00Z');
    const intel = computeSeasonPricingIntelligence(jobs, 'HVAC contractor', refDate);

    expect(intel.currentSeason).toBe('summer');
    expect(intel.currentMonthName).toBe('July');
    expect(intel.demandPosture).toBe('peak');
    expect(intel.historicalSeasonalJobsCount).toBe(2);
    expect(intel.historicalSeasonalCloseRatePct).toBe(100);
    expect(intel.historicalSeasonalAvgWonAmount).toBe(3350); // (5500+1200)/2
  });
});

describe('Pricing Intelligence - Close-Rate and Win/Loss Learning Engine', () => {
  it('distinguishes won vs lost jobs properly', () => {
    expect(isJobWon('complete')).toBe(true);
    expect(isJobWon('in_progress')).toBe(true);
    expect(isJobWon('completed')).toBe(true);
    expect(isJobWon('scheduled')).toBe(true);
    expect(isJobWon('archived')).toBe(false);
    expect(isJobWon('new_lead')).toBe(false);

    expect(isJobLost('archived')).toBe(true);
    expect(isJobLost('declined')).toBe(true);
    expect(isJobLost('complete')).toBe(false);
  });

  it('calculates win rates, price bands, and sweet-spot price ranges', () => {
    const jobs: HistoricalPricingJob[] = [
      // Band $500 - $1,500: 3 jobs, all won (100%)
      { id: 'j1', scope: 'Service call', quotedAmount: 650, status: 'complete' },
      { id: 'j2', scope: 'Valve replacement', quotedAmount: 850, status: 'complete' },
      { id: 'j3', scope: 'Garbage disposal', quotedAmount: 1100, status: 'complete' },
      // Band $1,500 - $3,500: 3 jobs, 2 won, 1 lost (67%)
      { id: 'j4', scope: 'Water heater 40gal', quotedAmount: 1950, status: 'complete' },
      { id: 'j5', scope: 'Water heater 50gal', quotedAmount: 2400, status: 'complete' },
      { id: 'j6', scope: 'Water filtration', quotedAmount: 3200, status: 'archived' },
      // Band $7,500 - $15,000: 2 jobs, 0 won, 2 lost (0%)
      { id: 'j7', scope: 'Whole home repipe', quotedAmount: 9500, status: 'archived' },
      { id: 'j8', scope: 'Sewer main replacement', quotedAmount: 12000, status: 'archived' },
    ];

    const closeRateIntel = computeCloseRatePricingIntelligence(jobs);
    expect(closeRateIntel.totalQuotedCount).toBe(8);
    expect(closeRateIntel.wonCount).toBe(5);
    expect(closeRateIntel.overallCloseRatePct).toBe(63); // 5/8 = 62.5 -> 63%

    // Average won ticket = (650+850+1100+1950+2400)/5 = 1390
    expect(closeRateIntel.avgWonTicket).toBe(1390);
    // Average lost ticket = (3200+9500+12000)/3 = 8233
    expect(closeRateIntel.avgLostTicket).toBe(8233);

    // Sweet spot detection: $500 - $1,500 band has 100% win rate and 3 wins
    expect(closeRateIntel.sweetSpotRange).not.toBeNull();
    expect(closeRateIntel.sweetSpotRange?.label).toBe('$500 – $1,500');
    expect(closeRateIntel.sweetSpotRange?.closeRatePct).toBe(100);
    expect(closeRateIntel.sweetSpotRange?.wonCount).toBe(3);

    expect(closeRateIntel.recommendedPricingPosture).toBe('balanced_growth');
    expect(closeRateIntel.pricingTip).toContain('proven won averages');
  });

  it('recommends premium margins when win rate is very high', () => {
    const jobs: HistoricalPricingJob[] = [
      { id: 'j1', scope: 'Job 1', quotedAmount: 2000, status: 'complete' },
      { id: 'j2', scope: 'Job 2', quotedAmount: 2200, status: 'complete' },
      { id: 'j3', scope: 'Job 3', quotedAmount: 2400, status: 'complete' },
      { id: 'j4', scope: 'Job 4', quotedAmount: 2100, status: 'complete' },
    ];

    const intel = computeCloseRatePricingIntelligence(jobs);
    expect(intel.overallCloseRatePct).toBe(100);
    expect(intel.recommendedPricingPosture).toBe('premium_margins');
    expect(intel.pricingTip).toContain('pricing power');
  });
});

describe('Pricing Intelligence - Full Account Synthesis & Prompt Injection', () => {
  it('synthesizes unified intelligence summary lines for the prompt', () => {
    const jobs: HistoricalPricingJob[] = [
      { id: 'j1', scope: 'Roof repair in 78704', quotedAmount: 3500, address: 'Austin TX 78704', status: 'complete', createdAt: '2026-06-10T10:00:00Z' },
      { id: 'j2', scope: 'Reroof in 78704', quotedAmount: 11000, address: 'Austin TX 78704', status: 'complete', createdAt: '2026-06-15T10:00:00Z' },
      { id: 'j3', scope: 'Gutter replacement', quotedAmount: 2200, address: 'Dallas TX 75201', status: 'archived', createdAt: '2026-01-10T10:00:00Z' },
    ];

    const refDate = new Date('2026-06-20T12:00:00Z');
    const accountIntel = computeAccountPricingIntelligence({
      jobs,
      targetAddress: '2000 S Lamar Blvd, Austin TX 78704',
      trade: 'Roofing Contractor',
      referenceDate: refDate,
    });

    expect(accountIntel.summaryLines.length).toBeGreaterThan(1);
    expect(accountIntel.summaryLines[0]).toBe('ACCOUNT-SPECIFIC PRICING INTELLIGENCE & ADAPTIVE LEARNING:');

    const promptText = formatPricingIntelligenceForPrompt(accountIntel);
    expect(promptText).toContain('ACCOUNT-SPECIFIC PRICING INTELLIGENCE & ADAPTIVE LEARNING:');
    expect(promptText).toContain('Close-Rate Intelligence:');
    expect(promptText).toContain('Seasonal Posture (Summer / June — PEAK demand for roofing)');
    expect(promptText).toContain('Localized ZIP Intelligence (ZIP 78704');
  });

  it('formats quote history with localized ZIP markers and win/loss provenance without PII', () => {
    const quotes: HistoricalQuote[] = [
      {
        scope: 'Replace 40-gal water heater',
        total: 1850,
        lines: [{ label: 'Water heater', amount: 1850 }],
        zip: '78704',
        isSameZip: true,
        won: true,
      },
      {
        scope: 'Tankless conversion with whole-home repipe',
        total: 6500,
        lines: [{ label: 'Tankless heater', amount: 3500 }, { label: 'Repipe', amount: 3000 }],
        zip: '78664',
        isSameZip: false,
        won: false,
        status: 'archived',
      },
    ];

    const formatted = formatQuoteHistory(quotes);
    expect(formatted).toContain('[Same ZIP: 78704] [Won] "Replace 40-gal water heater" → $1850');
    expect(formatted).toContain('[ZIP 78664] [Lost] "Tankless conversion with whole-home repipe" → $6500');
    // Verify PII exclusion
    expect(formatted).not.toContain('phone');
    expect(formatted).not.toContain('@');
    expect(formatted).not.toContain('Street');
  });

  it('injects adaptive pricing intelligence rules into buildDraftInstructions', () => {
    const jobs: HistoricalPricingJob[] = [
      { id: 'j1', scope: 'Tile install', quotedAmount: 2500, address: 'Austin TX 78704', status: 'complete', createdAt: '2026-05-10T10:00:00Z' },
    ];

    const intel = computeAccountPricingIntelligence({
      jobs,
      targetAddress: 'Austin TX 78704',
      trade: 'Tile and flooring contractor',
      referenceDate: new Date('2026-05-15T12:00:00Z'),
    });

    const context: DraftContext = {
      accountId: 'acc-123',
      scope: 'Install marble tile in master bathroom 120 sq ft',
      trade: 'Tile and flooring contractor',
      estimatedHours: 12,
      services: [
        { id: 's1', name: 'Tile installation', unitPrice: 15, unit: 'sqft' },
      ],
      history: [
        { scope: 'Bathroom tile', total: 2500, lines: [{ label: 'Tile', amount: 2500 }], isSameZip: true, zip: '78704', won: true },
      ],
      pricingIntel: intel,
      targetZip: '78704',
    };

    const instructions = buildDraftInstructions(context);
    expect(instructions).toContain('ACCOUNT-SPECIFIC PRICING INTELLIGENCE & ADAPTIVE LEARNING:');
    expect(instructions).toContain('ADAPTIVE PRICING & CLOSE-RATE OPTIMIZATION:');
    expect(instructions).toContain('Leverage the account close-rate and sweet-spot intelligence');
    expect(instructions).toContain('Reflect seasonal demand posture:');
    expect(instructions).toContain('When historical comps marked [Same ZIP] are available');
  });
});
