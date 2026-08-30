import type { SeasonalAdAngle } from './google-ads-generator';

export type WeatherSurgeCondition = {
  temperatureF?: number;
  hasStorm?: boolean;
  hasHighWind?: boolean;
  hasFreeze?: boolean;
  hasExtremeHeat?: boolean;
  alertHeadline?: string;
};

export type WeatherSurgeOpportunity = {
  surgeActive: boolean;
  surgeTitle: string;
  recommendedAngle: SeasonalAdAngle;
  recommendedBudgetBoostPct: number;
  rationale: string;
  alertHeadline?: string;
};

/**
 * Evaluates whether local weather conditions warrant a temporary ad budget surge
 * and copy angle switch for the contractor's specific trade.
 */
export function detectWeatherSurgeOpportunity(
  trade: string,
  city: string,
  condition: WeatherSurgeCondition
): WeatherSurgeOpportunity {
  const normTrade = (trade || '').toLowerCase().trim();
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();

  // 1. Roofing / Gutters: Storm or High Wind
  if (normTrade.includes('roof') || normTrade.includes('gutter') || normTrade.includes('exterior')) {
    if (condition.hasStorm || condition.hasHighWind || (condition.alertHeadline && condition.alertHeadline.toLowerCase().includes('storm'))) {
      return {
        surgeActive: true,
        surgeTitle: `Storm & Wind Activity Detected in ${cleanCity}`,
        recommendedAngle: 'storm_seasonal',
        recommendedBudgetBoostPct: 25,
        rationale: 'High winds and storm fronts cause sudden roof leaks and missing shingles, driving a 3–4x surge in local search volume.',
        alertHeadline: condition.alertHeadline || 'Severe Weather / Storm Watch',
      };
    }
  }

  // 2. HVAC: Extreme Heat (> 90°F) or Hard Freeze (< 32°F)
  if (normTrade.includes('hvac') || normTrade.includes('air') || normTrade.includes('heat') || normTrade.includes('cool')) {
    if (condition.hasExtremeHeat || (condition.temperatureF !== undefined && condition.temperatureF >= 90)) {
      return {
        surgeActive: true,
        surgeTitle: `Extreme Heat Surge (${condition.temperatureF || 95}°F) in ${cleanCity}`,
        recommendedAngle: 'emergency',
        recommendedBudgetBoostPct: 30,
        rationale: 'Heatwaves overload cooling units, causing urgent same-day AC repair and emergency replacement searches.',
        alertHeadline: condition.alertHeadline || 'Excessive Heat Warning',
      };
    }

    if (condition.hasFreeze || (condition.temperatureF !== undefined && condition.temperatureF <= 32)) {
      return {
        surgeActive: true,
        surgeTitle: `Freezing Weather Alert in ${cleanCity}`,
        recommendedAngle: 'emergency',
        recommendedBudgetBoostPct: 30,
        rationale: 'Sub-freezing temperatures cause furnace shutdowns and heating emergency searches.',
        alertHeadline: condition.alertHeadline || 'Hard Freeze Warning',
      };
    }
  }

  // 3. Plumbing: Sub-freezing temperatures
  if (normTrade.includes('plumb')) {
    if (condition.hasFreeze || (condition.temperatureF !== undefined && condition.temperatureF <= 32)) {
      return {
        surgeActive: true,
        surgeTitle: `Freeze Warning & Burst Pipe Surge in ${cleanCity}`,
        recommendedAngle: 'emergency',
        recommendedBudgetBoostPct: 35,
        rationale: 'Freezing weather causes exposed pipes to burst, driving urgent 24/7 emergency plumber calls.',
        alertHeadline: condition.alertHeadline || 'Freeze Advisory',
      };
    }
  }

  // 4. Default / Baseline: No active surge
  return {
    surgeActive: false,
    surgeTitle: 'Normal Seasonal Demand',
    recommendedAngle: 'standard',
    recommendedBudgetBoostPct: 0,
    rationale: 'Weather conditions in your service area are normal. Standard daily pacing is optimal.',
  };
}
