import { describe, expect, it } from 'vitest';
import {
  extractStreetAndNeighborhood,
  calculateHaloGeofence,
  qualifyJobForNeighborhoodHalo,
  allocateHaloMicroBudget,
  generateDeterministicHaloCopy,
  buildHaloLandingPageUrl,
  calculateNeighborClusterDiscount,
  generateNeighborClusterShareText,
  DEFAULT_HALO_CONFIG,
  type HaloJobInput,
} from '@/lib/neighborhood-halo';
import {
  buildHaloCreativeBundle,
  generateHaloVideoReelScript,
  generateBeforeAfterSliderMetadata,
} from '@/lib/neighborhood-halo-ai';

describe('Neighborhood Halo — extractStreetAndNeighborhood', () => {
  it('strips exact street house numbers for neighbor privacy', () => {
    const res = extractStreetAndNeighborhood('1428 Maple Ave, Rochester, MI 48307');
    expect(res.streetName).toBe('Maple Ave');
    expect(res.city).toBe('Rochester');
    expect(res.state).toBe('MI');
    expect(res.zip).toBe('48307');
    expect(res.sanitizedAddress).toBe('Maple Ave, Rochester, MI');
  });

  it('handles suite and apartment numbers correctly', () => {
    const res = extractStreetAndNeighborhood('Suite 200, 500 Oak Ridge Rd, Dallas, TX 75001');
    expect(res.streetName).toBe('Oak Ridge Rd');
    expect(res.city).toBe('Dallas');
    expect(res.state).toBe('TX');
  });

  it('uses custom subdivision name when provided', () => {
    const res = extractStreetAndNeighborhood('742 Evergreen Terrace, Springfield, OR 97477', 'Whispering Pines');
    expect(res.neighborhoodName).toBe('Whispering Pines');
    expect(res.streetName).toBe('Evergreen Terrace');
  });

  it('handles empty or missing address gracefully without crashing', () => {
    const res = extractStreetAndNeighborhood('');
    expect(res.streetName).toBe('Local Area');
    expect(res.sanitizedAddress).toBe('Your Neighborhood');
  });
});

describe('Neighborhood Halo — calculateHaloGeofence', () => {
  it('computes 1-mile bounding box correctly around coordinates', () => {
    const lat = 42.6806;
    const lng = -83.1338;
    const geofence = calculateHaloGeofence(lat, lng, 1.0);

    expect(geofence.centerLat).toBe(lat);
    expect(geofence.centerLng).toBe(lng);
    expect(geofence.radiusMiles).toBe(1.0);

    // Lat delta for 1 mile is approx 1/69 = 0.0145
    expect(geofence.bounds.maxLat).toBeGreaterThan(lat);
    expect(geofence.bounds.minLat).toBeLessThan(lat);
    expect(geofence.bounds.maxLat - lat).toBeCloseTo(1 / 69, 3);
  });

  it('clamps invalid or extreme radius values between 0.25 and 5.0 miles', () => {
    const geofenceSmall = calculateHaloGeofence(30.0, -97.0, 0.05);
    expect(geofenceSmall.radiusMiles).toBe(0.25);

    const geofenceLarge = calculateHaloGeofence(30.0, -97.0, 50.0);
    expect(geofenceLarge.radiusMiles).toBe(5.0);
  });
});

describe('Neighborhood Halo — qualifyJobForNeighborhoodHalo', () => {
  it('qualifies a completed job with coordinates and photos', () => {
    const job: HaloJobInput = {
      id: 'job_123',
      status: 'completed',
      latitude: 42.68,
      longitude: -83.13,
      photoUrls: ['https://example.com/photo1.jpg'],
    };

    const res = qualifyJobForNeighborhoodHalo(job);
    expect(res.qualified).toBe(true);
    expect(res.hasPhotos).toBe(true);
    expect(res.hasCoordinates).toBe(true);
  });

  it('rejects an active or uncompleted job', () => {
    const job: HaloJobInput = {
      id: 'job_456',
      status: 'in_progress',
      latitude: 42.68,
      longitude: -83.13,
      photoUrls: ['https://example.com/photo1.jpg'],
    };

    const res = qualifyJobForNeighborhoodHalo(job);
    expect(res.qualified).toBe(false);
    expect(res.reason).toContain('marked completed');
  });

  it('rejects a completed job missing GPS coordinates', () => {
    const job: HaloJobInput = {
      id: 'job_789',
      status: 'completed',
      latitude: null,
      longitude: null,
      photoUrls: ['https://example.com/photo1.jpg'],
    };

    const res = qualifyJobForNeighborhoodHalo(job);
    expect(res.qualified).toBe(false);
    expect(res.hasCoordinates).toBe(false);
  });

  it('rejects a completed job missing site photos', () => {
    const job: HaloJobInput = {
      id: 'job_999',
      status: 'completed',
      latitude: 42.68,
      longitude: -83.13,
      photoUrls: [],
    };

    const res = qualifyJobForNeighborhoodHalo(job);
    expect(res.qualified).toBe(false);
    expect(res.hasPhotos).toBe(false);
  });
});

describe('Neighborhood Halo — allocateHaloMicroBudget', () => {
  it('allocates default $25 micro-budget when balance is healthy', () => {
    const res = allocateHaloMicroBudget({
      currentWalletBalanceDollars: 350,
      haloSpendThisMonthDollars: 50,
    });

    expect(res.canLaunch).toBe(true);
    expect(res.allocatedBudgetDollars).toBe(25);
    expect(res.durationDays).toBe(DEFAULT_HALO_CONFIG.defaultDurationDays);
  });

  it('blocks launch if wallet balance is below required micro-budget', () => {
    const res = allocateHaloMicroBudget({
      currentWalletBalanceDollars: 10,
      haloSpendThisMonthDollars: 0,
    });

    expect(res.canLaunch).toBe(false);
    expect(res.allocatedBudgetDollars).toBe(0);
    expect(res.reason).toContain('Insufficient ad wallet balance');
  });

  it('blocks launch if monthly halo cap ($250) has been reached', () => {
    const res = allocateHaloMicroBudget({
      currentWalletBalanceDollars: 500,
      haloSpendThisMonthDollars: 250,
    });

    expect(res.canLaunch).toBe(false);
    expect(res.reason).toContain('budget cap');
  });
});

describe('Neighborhood Halo — AI Creative Bundle', () => {
  it('generates multi-channel copy packages with street and neighbor hooks', () => {
    const bundle = buildHaloCreativeBundle({
      trade: 'Roofing',
      businessName: 'Apex Roofing Experts',
      streetName: 'Maple Ave',
      neighborhoodName: 'Oakridge Estates',
      city: 'Rochester',
      scopeSummary: 'Architectural Shingle Replacement',
      customIncentive: 'Free 15-Point Roof & Gutter Inspection',
    });

    expect(bundle.metaAd.primaryText).toContain('Maple Ave');
    expect(bundle.metaAd.primaryText).toContain('Oakridge Estates');
    expect(bundle.metaAd.primaryText).toContain('Free 15-Point Roof & Gutter Inspection');
    expect(bundle.metaAd.headline).toContain('Maple Ave');
    expect(bundle.googleAd.headlines.some((h) => h.includes('Maple Ave'))).toBe(true);
    expect(bundle.showcaseStory.title).toContain('Maple Ave');
  });

  it('builds dynamic showcase landing page URLs correctly', () => {
    const url = buildHaloLandingPageUrl('apexroofing.com', 'halo_xyz789', 'roofing');
    expect(url).toBe('https://apexroofing.com/showcase/roofing?halo=halo_xyz789&ref=halo_ad');
  });
});

describe('Neighborhood Halo — Video Reels & Before/After Sliders', () => {
  it('generates a 15-second timed Video Reel storyboard', () => {
    const reel = generateHaloVideoReelScript({
      trade: 'HVAC',
      businessName: 'Comfort Pro Systems',
      streetName: 'Birchwood Lane',
      neighborhoodName: 'Pine Creek',
      scopeSummary: 'Carrier Heat Pump System',
      customIncentive: '$500 Federal Tax Credit + Free Thermostat',
    });

    expect(reel.durationSeconds).toBe(15);
    expect(reel.aspectRatio).toBe('9:16');
    expect(reel.segments.length).toBe(4);
    expect(reel.segments[0].phase).toBe('hook');
    expect(reel.segments[0].onScreenText).toContain('BIRCHWOOD LANE');
    expect(reel.segments[3].phase).toBe('call_to_action');
    expect(reel.segments[3].onScreenText).toContain('Pine Creek');
    expect(reel.captionCopy).toContain('#PineCreek');
  });

  it('builds interactive Before/After Slider metadata', () => {
    const slider = generateBeforeAfterSliderMetadata({
      trade: 'Plumbing',
      streetName: 'Crestview Dr',
      neighborhoodName: 'West End',
      beforePhotoUrl: 'https://example.com/old-pipes.jpg',
      afterPhotoUrl: 'https://example.com/new-pex.jpg',
    });

    expect(slider.containerId).toBe('halo-slider-crestview-dr');
    expect(slider.streetBadge).toBe('📍 Crestview Dr');
    expect(slider.defaultPositionPct).toBe(50);
    expect(slider.beforePhotoUrl).toBe('https://example.com/old-pipes.jpg');
    expect(slider.afterPhotoUrl).toBe('https://example.com/new-pex.jpg');
  });
});

describe('Neighborhood Halo — "Neighbor Cluster" Group Discount Engine', () => {
  it('calculates tiered group discounts based on street participation', () => {
    // 1 home (not yet unlocked)
    const solo = calculateNeighborClusterDiscount(1);
    expect(solo.discountDollars).toBe(0);
    expect(solo.activeTier).toBeNull();
    expect(solo.nextTier?.discountDollars).toBe(100);
    expect(solo.homesNeededForNextTier).toBe(1);

    // 2 homes (Duo unlocked)
    const duo = calculateNeighborClusterDiscount(2);
    expect(duo.discountDollars).toBe(100);
    expect(duo.activeTier?.badge).toContain('2-Neighbor Duo');
    expect(duo.homesNeededForNextTier).toBe(1); // needs 1 more for Tier 2 ($250)

    // 3 homes (Street Cluster unlocked)
    const trio = calculateNeighborClusterDiscount(3);
    expect(trio.discountDollars).toBe(250);
    expect(trio.activeTier?.badge).toContain('3-Neighbor Street Cluster');
    expect(trio.homesNeededForNextTier).toBe(2); // needs 2 more for 5+ ($500)

    // 5+ homes (HOA bulk special unlocked)
    const hoa = calculateNeighborClusterDiscount(6);
    expect(hoa.discountDollars).toBe(500);
    expect(hoa.activeTier?.badge).toContain('5+ Home HOA Group Special');
    expect(hoa.nextTier).toBeNull();
  });

  it('generates viral share text for neighborhood groups and group chats', () => {
    const clusterResult = calculateNeighborClusterDiscount(2);
    const text = generateNeighborClusterShareText({
      businessName: 'Apex Roofing Experts',
      trade: 'Roofing',
      streetName: 'Maple Ave',
      neighborhoodName: 'Oakridge Estates',
      clusterResult,
    });

    expect(text).toContain('Maple Ave');
    expect(text).toContain('Apex Roofing Experts');
    expect(text).toContain('1 more neighbor on our street');
    expect(text).toContain('$250 group cluster discount');
  });
});

describe('Neighborhood Halo — Halo-Aware Speed-to-Lead SMS', () => {
  it('personalizes instant SMS with neighbor street and neighborhood context', async () => {
    const { generateSpeedToLeadSms } = await import('@/lib/ad-speed-to-lead');

    const sms = generateSpeedToLeadSms({
      businessName: 'Apex Roofing Experts',
      leadName: 'Dave Miller',
      projectType: 'Roof Replacement',
      city: 'Rochester',
      haloContext: {
        isNeighborLead: true,
        streetName: 'Maple Ave',
        neighborhoodName: 'Oakridge Estates',
        clusterOffer: '$250 Street Cluster Discount',
      },
    });

    expect(sms).toContain('Hi Dave');
    expect(sms).toContain('Apex Roofing Experts');
    expect(sms).toContain('Maple Ave in Oakridge Estates');
    expect(sms).toContain('$250 Street Cluster Discount');
    expect(sms).toContain('estimator is working nearby this week');
    expect(sms).toContain('Reply STOP to opt out');
  });
});
