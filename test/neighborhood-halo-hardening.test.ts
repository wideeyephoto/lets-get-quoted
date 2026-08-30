import { describe, expect, it } from 'vitest';
import {
  qualifyJobForNeighborhoodHalo,
  calculateHaversineDistanceMiles,
  findOverlappingHaloCampaigns,
  checkHaloDailyPacingLimit,
  evaluateHaloAutoKillCriteria,
  applyClusterDiscountWithMarginFloor,
  validateHaloMediaQuality,
  type NeighborhoodHaloCampaign,
  type HaloJobInput,
} from '@/lib/neighborhood-halo';
import {
  isWithinTcpaQuietHours,
  getTcpaCompliantSendTime,
  generateSpeedToLeadIdempotencyKey,
} from '@/lib/ad-speed-to-lead';

describe('Layer 1: Privacy & Consent Safeguards', () => {
  it('strictly blocks campaign launch when customer opts out of marketing showcase', () => {
    const job: HaloJobInput = {
      id: 'job_optout_1',
      status: 'completed',
      latitude: 42.68,
      longitude: -83.13,
      photoUrls: ['https://example.com/craftsmanship.jpg'],
      allowMarketingShowcase: false, // Customer opted out
    };

    const res = qualifyJobForNeighborhoodHalo(job);
    expect(res.qualified).toBe(false);
    expect(res.optedOut).toBe(true);
    expect(res.reason).toContain('Customer has opted out');
  });

  it('calculates Haversine distance accurately between two coordinates', () => {
    // Distance between Rochester, MI (42.6806, -83.1338) and Troy, MI (42.5803, -83.1499) is approx 6.9 miles
    const dist = calculateHaversineDistanceMiles(42.6806, -83.1338, 42.5803, -83.1499);
    expect(dist).toBeGreaterThan(6.5);
    expect(dist).toBeLessThan(7.5);
  });

  it('detects overlapping active halos within 0.75 miles to prevent self-competing spend', () => {
    const activeHalos: NeighborhoodHaloCampaign[] = [
      {
        id: 'halo_1',
        accountId: 'acc_1',
        jobId: 'job_1',
        rawAddress: '100 Maple Ave, Rochester, MI',
        sanitizedAddress: 'Maple Ave, Rochester, MI',
        streetName: 'Maple Ave',
        neighborhoodName: 'Oakridge',
        city: 'Rochester',
        state: 'MI',
        zip: '48307',
        geofence: {
          centerLat: 42.6806,
          centerLng: -83.1338,
          radiusMiles: 1.0,
          bounds: { minLat: 42.66, maxLat: 42.7, minLng: -83.15, maxLng: -83.11 },
        },
        budgetDollars: 25,
        durationDays: 5,
        status: 'active',
        adCopy: {} as never,
        targetLandingUrl: 'https://example.com',
        metrics: { impressions: 100, clicks: 5, leads: 1, spendDollars: 10 },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    ];

    // New candidate location only 0.2 miles away on the same street
    const overlaps = findOverlappingHaloCampaigns(42.682, -83.135, activeHalos, 0.75);
    expect(overlaps.length).toBe(1);
    expect(overlaps[0].id).toBe('halo_1');

    // New candidate location 5 miles away in another town
    const noOverlaps = findOverlappingHaloCampaigns(42.6, -83.25, activeHalos, 0.75);
    expect(noOverlaps.length).toBe(0);
  });
});

describe('Layer 2: TCPA Quiet Hours & Idempotency Locking', () => {
  it('correctly identifies TCPA quiet hours (9:00 PM to 8:00 AM)', () => {
    // 11:30 PM (23:30) is inside quiet hours
    const nightTime = new Date('2026-08-30T23:30:00Z');
    expect(isWithinTcpaQuietHours(nightTime, 'UTC')).toBe(true);

    // 2:00 PM (14:00) is outside quiet hours
    const dayTime = new Date('2026-08-30T14:00:00Z');
    expect(isWithinTcpaQuietHours(dayTime, 'UTC')).toBe(false);

    // 7:45 AM is inside quiet hours (< 8:00 AM)
    const earlyMorning = new Date('2026-08-30T07:45:00Z');
    expect(isWithinTcpaQuietHours(earlyMorning, 'UTC')).toBe(true);
  });

  it('delays overnight speed-to-lead messages until morning', () => {
    const overnightSubmission = new Date('2026-08-30T23:30:00Z');
    const result = getTcpaCompliantSendTime(overnightSubmission, 'UTC');

    expect(result.isDelayed).toBe(true);
    expect(result.reason).toContain('TCPA quiet hours');
  });

  it('generates consistent idempotency keys within 15-minute duplicate windows', () => {
    const key1 = generateSpeedToLeadIdempotencyKey('acc_abc', '248-555-0199', 15);
    const key2 = generateSpeedToLeadIdempotencyKey('acc_abc', '(248) 555-0199', 15);

    expect(key1).toBe(key2);
    expect(key1).toContain('2485550199');
  });
});

describe('Layer 3: Financial Guardrails & Spend Protection', () => {
  it('enforces $5/day daily micro-pacing limits', () => {
    // Spent $3.50 -> allowed $1.50 remaining
    const normal = checkHaloDailyPacingLimit(3.5, 5.0);
    expect(normal.canSpend).toBe(true);
    expect(normal.remainingDailyAllowanceDollars).toBe(1.5);

    // Spent $5.00 -> blocked for today
    const capped = checkHaloDailyPacingLimit(5.0, 5.0);
    expect(capped.canSpend).toBe(false);
    expect(capped.remainingDailyAllowanceDollars).toBe(0);
    expect(capped.reason).toContain('pace cap');
  });

  it('triggers auto-kill and refund on underperforming halos after 72 hours', () => {
    const seventyFourHoursAgo = new Date(Date.now() - 74 * 60 * 60 * 1000).toISOString();

    const deadCampaign: NeighborhoodHaloCampaign = {
      id: 'halo_stale',
      accountId: 'acc_1',
      jobId: 'job_1',
      rawAddress: '200 Elm St',
      sanitizedAddress: 'Elm St',
      streetName: 'Elm St',
      neighborhoodName: 'West End',
      city: 'Rochester',
      state: 'MI',
      zip: '48307',
      geofence: {} as never,
      budgetDollars: 25,
      durationDays: 5,
      status: 'active',
      adCopy: {} as never,
      targetLandingUrl: 'https://example.com',
      metrics: {
        impressions: 220, // High impressions
        clicks: 0,        // 0 clicks in 74h
        leads: 0,
        spendDollars: 8.5,
      },
      createdAt: seventyFourHoursAgo,
      expiresAt: new Date().toISOString(),
    };

    const autoKill = evaluateHaloAutoKillCriteria(deadCampaign);
    expect(autoKill.shouldKill).toBe(true);
    expect(autoKill.unspentBudgetDollars).toBe(16.5);
    expect(autoKill.reason).toContain('Auto-reallocating');
  });

  it('enforces 10% maximum discount margin floor on small job quotes', () => {
    // $1,000 small job: requested $250 cluster discount capped at $100 (10% floor)
    const smallJob = applyClusterDiscountWithMarginFloor(1000, 250, 10);
    expect(smallJob.cappedByMarginFloor).toBe(true);
    expect(smallJob.appliedDiscountDollars).toBe(100);
    expect(smallJob.effectiveDiscountPercentage).toBe(10);
    expect(smallJob.message).toContain('margin floor');

    // $5,000 job: requested $250 cluster discount is fully allowed (5% of total)
    const largeJob = applyClusterDiscountWithMarginFloor(5000, 250, 10);
    expect(largeJob.cappedByMarginFloor).toBe(false);
    expect(largeJob.appliedDiscountDollars).toBe(250);
    expect(largeJob.effectiveDiscountPercentage).toBe(5);
  });
});

describe('Layer 4: Media & Image Resilience', () => {
  it('validates photo resolution and rejects undersized images', () => {
    const undersized = validateHaloMediaQuality({ width: 400, height: 300 });
    expect(undersized.valid).toBe(false);
    expect(undersized.errors.some((e) => e.includes('Resolution'))).toBe(true);

    const goodSize = validateHaloMediaQuality({ width: 1600, height: 1200 });
    expect(goodSize.valid).toBe(true);
    expect(goodSize.errors.length).toBe(0);
  });

  it('flags blurry photos as errors and warns on underexposed photos', () => {
    const blurry = validateHaloMediaQuality({ isBlurry: true });
    expect(blurry.valid).toBe(false);
    expect(blurry.errors.some((e) => e.includes('blurry'))).toBe(true);

    const dark = validateHaloMediaQuality({ brightness: 30 });
    expect(dark.valid).toBe(true); // Still allowed but with warning
    expect(dark.warnings.some((w) => w.includes('dark'))).toBe(true);
  });

  it('detects Apple HEIC/HEVC and specifies auto-transcoding', () => {
    const heic = validateHaloMediaQuality({ format: 'heic' });
    expect(heic.transcodeRequired).toBe(true);
    expect(heic.recommendedFormat).toBe('webp');

    const hevc = validateHaloMediaQuality({ format: 'mov' });
    expect(hevc.transcodeRequired).toBe(true);
    expect(hevc.recommendedFormat).toBe('mp4');
  });
});
