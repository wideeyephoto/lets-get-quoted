import { describe, expect, it } from 'vitest';
import {
  detectWeatherSurgeOpportunity,
  isOutdoorWeatherSensitiveTrade,
  isStormDamageSurgeTrade,
  isTradeSurgeEligible,
} from '@/lib/weather-ad-surge';

describe('Weather-Triggered Ad Surge Engine', () => {
  it('triggers storm damage surge for roofers when high winds or storms occur', () => {
    const surge = detectWeatherSurgeOpportunity('Roofing', 'Austin, TX', {
      hasStorm: true,
      hasHighWind: true,
      alertHeadline: 'Severe Thunderstorm Warning',
    });

    expect(surge.surgeActive).toBe(true);
    expect(surge.budgetProtected).toBe(false);
    expect(surge.recommendedAngle).toBe('storm_seasonal');
    expect(surge.recommendedBudgetBoostPct).toBe(25);
    expect(surge.surgeTitle).toContain('Storm & Wind');
  });

  it('triggers storm damage surge for gutters and water damage restoration during storms', () => {
    const gutterSurge = detectWeatherSurgeOpportunity('Seamless Gutters & Guards', 'Tampa, FL', {
      hasStorm: true,
      alertHeadline: 'Tropical Storm Watch',
    });
    expect(gutterSurge.surgeActive).toBe(true);
    expect(gutterSurge.recommendedAngle).toBe('storm_seasonal');

    const restorationSurge = detectWeatherSurgeOpportunity('Water Damage Restoration & Flood Cleanup', 'Houston, TX', {
      hasStorm: true,
      alertHeadline: 'Flash Flood and Severe Thunderstorm Warning',
    });
    expect(restorationSurge.surgeActive).toBe(true);
    expect(restorationSurge.recommendedAngle).toBe('storm_seasonal');

    const treeSurge = detectWeatherSurgeOpportunity('Emergency Tree Service & Removal', 'Atlanta, GA', {
      hasHighWind: true,
      alertHeadline: 'High Wind Warning (60mph gusts)',
    });
    expect(treeSurge.surgeActive).toBe(true);
  });

  it('protects outdoor weather-sensitive contractors (painters, landscapers, concrete) from surging during storms', () => {
    const outdoorTrades = [
      'Exterior Painting',
      'Residential Painting & Staining',
      'Landscaping & Lawn Care',
      'Concrete & Masonry Paving',
      'Asphalt Driveways',
      'Pressure Washing & Exterior Cleaning',
      'Deck Building & Fencing',
    ];

    for (const trade of outdoorTrades) {
      const surge = detectWeatherSurgeOpportunity(trade, 'Charlotte, NC', {
        hasStorm: true,
        hasHighWind: true,
        alertHeadline: 'Severe Thunderstorm & Flash Flood Warning',
      });

      expect(surge.surgeActive).toBe(false);
      expect(surge.recommendedBudgetBoostPct).toBe(0);
      expect(surge.recommendedAngle).toBe('standard');
      expect(surge.budgetProtected).toBe(true);
      expect(surge.surgeTitle).toContain('Bad Weather Budget Guard');
      expect(surge.rationale).toContain('halt outdoor');
      expect(surge.rationale).toContain('Ad budget surge is suppressed');
      expect(surge.weatherHoldReason).toContain('Outdoor work unsafe or prohibited');
    }
  });

  it('does NOT surge exterior painters even though the trade name contains "exterior"', () => {
    const surge = detectWeatherSurgeOpportunity('Exterior Painting Pros', 'Denver, CO', {
      hasStorm: true,
      hasHighWind: true,
    });

    expect(surge.surgeActive).toBe(false);
    expect(surge.budgetProtected).toBe(true);
    expect(surge.recommendedBudgetBoostPct).toBe(0);
    expect(surge.recommendedAngle).toBe('standard');
  });

  it('does NOT surge plumbing or HVAC during rain/thunderstorms without temperature extremes', () => {
    const plumberRain = detectWeatherSurgeOpportunity('Plumbing & Drain Services', 'Austin, TX', {
      hasStorm: true,
      temperatureF: 72,
      alertHeadline: 'Severe Thunderstorm Warning',
    });
    expect(plumberRain.surgeActive).toBe(false);
    expect(plumberRain.recommendedBudgetBoostPct).toBe(0);

    const hvacRain = detectWeatherSurgeOpportunity('HVAC Heating & Cooling', 'Dallas, TX', {
      hasStorm: true,
      temperatureF: 75,
      alertHeadline: 'Severe Thunderstorm Warning',
    });
    expect(hvacRain.surgeActive).toBe(false);
    expect(hvacRain.recommendedBudgetBoostPct).toBe(0);
  });

  it('does NOT surge indoor non-emergency contractors during storms', () => {
    const indoorTrades = [
      'Kitchen & Bathroom Remodeling',
      'Tile & Hardwood Flooring',
      'Custom Cabinetry',
      'Drywall & Plaster',
    ];

    for (const trade of indoorTrades) {
      const surge = detectWeatherSurgeOpportunity(trade, 'Seattle, WA', {
        hasStorm: true,
        alertHeadline: 'Heavy Rain and Wind Advisory',
      });

      expect(surge.surgeActive).toBe(false);
      expect(surge.recommendedBudgetBoostPct).toBe(0);
      expect(surge.recommendedAngle).toBe('standard');
    }
  });

  it('triggers extreme heat emergency surge for HVAC during heatwaves', () => {
    const surge = detectWeatherSurgeOpportunity('HVAC Contractor', 'Phoenix, AZ', {
      temperatureF: 104,
      hasExtremeHeat: true,
    });

    expect(surge.surgeActive).toBe(true);
    expect(surge.recommendedAngle).toBe('emergency');
    expect(surge.recommendedBudgetBoostPct).toBe(30);
    expect(surge.surgeTitle).toContain('Extreme Heat');
  });

  it('triggers pipe freeze emergency surge for plumbers during freeze events', () => {
    const surge = detectWeatherSurgeOpportunity('Plumbing & Rooter', 'Dallas, TX', {
      temperatureF: 24,
      hasFreeze: true,
    });

    expect(surge.surgeActive).toBe(true);
    expect(surge.recommendedAngle).toBe('emergency');
    expect(surge.recommendedBudgetBoostPct).toBe(35);
    expect(surge.surgeTitle).toContain('Freeze Warning');
  });

  it('remains on baseline pacing when weather is normal', () => {
    const surge = detectWeatherSurgeOpportunity('Landscapers', 'San Diego, CA', {
      temperatureF: 72,
    });

    expect(surge.surgeActive).toBe(false);
    expect(surge.recommendedAngle).toBe('standard');
    expect(surge.recommendedBudgetBoostPct).toBe(0);
  });

  it('validates trade classification and eligibility helpers', () => {
    expect(isOutdoorWeatherSensitiveTrade('Exterior Painting')).toBe(true);
    expect(isOutdoorWeatherSensitiveTrade('Landscaping')).toBe(true);
    expect(isOutdoorWeatherSensitiveTrade('Concrete & Pavers')).toBe(true);
    expect(isOutdoorWeatherSensitiveTrade('Roofing')).toBe(false);

    expect(isStormDamageSurgeTrade('Roof Replacement')).toBe(true);
    expect(isStormDamageSurgeTrade('Gutters & Downspouts')).toBe(true);
    expect(isStormDamageSurgeTrade('Water Damage Mitigation')).toBe(true);
    expect(isStormDamageSurgeTrade('Exterior Painting')).toBe(false);
    expect(isStormDamageSurgeTrade('Landscaping')).toBe(false);

    expect(isTradeSurgeEligible('Roofing', { hasStorm: true })).toBe(true);
    expect(isTradeSurgeEligible('Exterior Painting', { hasStorm: true })).toBe(false);
    expect(isTradeSurgeEligible('Plumbing', { hasStorm: true, temperatureF: 75 })).toBe(false);
    expect(isTradeSurgeEligible('Plumbing', { hasFreeze: true, temperatureF: 20 })).toBe(true);
  });
});

