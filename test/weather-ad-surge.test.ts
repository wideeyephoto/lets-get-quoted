import { describe, expect, it } from 'vitest';
import { detectWeatherSurgeOpportunity } from '@/lib/weather-ad-surge';

describe('Weather-Triggered Ad Surge Engine', () => {
  it('triggers storm damage surge for roofers when high winds or storms occur', () => {
    const surge = detectWeatherSurgeOpportunity('Roofing', 'Austin, TX', {
      hasStorm: true,
      hasHighWind: true,
      alertHeadline: 'Severe Thunderstorm Warning',
    });

    expect(surge.surgeActive).toBe(true);
    expect(surge.recommendedAngle).toBe('storm_seasonal');
    expect(surge.recommendedBudgetBoostPct).toBe(25);
    expect(surge.surgeTitle).toContain('Storm & Wind');
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
});
