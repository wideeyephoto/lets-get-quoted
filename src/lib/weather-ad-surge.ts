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
  budgetProtected?: boolean;
  weatherHoldReason?: string;
};

/**
 * Trades that experience an emergency surge in local search volume during storms, hail, or high wind.
 */
export function isStormDamageSurgeTrade(trade: string): boolean {
  const norm = (trade || '').toLowerCase().trim();
  // Exclude trades whose outdoor operations are blocked by storms
  if (
    norm.includes('paint') ||
    norm.includes('stain') ||
    norm.includes('concrete') ||
    norm.includes('paving') ||
    norm.includes('asphalt') ||
    norm.includes('lawn') ||
    norm.includes('landscap')
  ) {
    return false;
  }
  return (
    norm.includes('roof') ||
    norm.includes('gutter') ||
    norm.includes('restoration') ||
    norm.includes('water damage') ||
    norm.includes('flood') ||
    norm.includes('mold') ||
    norm.includes('disaster') ||
    norm.includes('tree removal') ||
    norm.includes('tree service') ||
    (norm.includes('siding') && !norm.includes('paint'))
  );
}

/**
 * Trades that are outdoor weather-sensitive and must NOT surge during storms or severe weather.
 * Instead, their budgets are preserved and shielded from unserviceable or rain-delayed leads.
 */
export function isOutdoorWeatherSensitiveTrade(trade: string): boolean {
  const norm = (trade || '').toLowerCase().trim();
  if (isStormDamageSurgeTrade(trade)) {
    return false;
  }
  return (
    norm.includes('paint') ||
    norm.includes('stain') ||
    norm.includes('concrete') ||
    norm.includes('mason') ||
    norm.includes('paving') ||
    norm.includes('asphalt') ||
    norm.includes('driveway') ||
    norm.includes('landscap') ||
    norm.includes('lawn') ||
    norm.includes('garden') ||
    norm.includes('irrigation') ||
    norm.includes('pressure-wash') ||
    norm.includes('power-wash') ||
    norm.includes('powerwash') ||
    norm.includes('pressure wash') ||
    norm.includes('window clean') ||
    norm.includes('window wash') ||
    norm.includes('deck') ||
    norm.includes('fence') ||
    norm.includes('patio') ||
    norm.includes('pool')
  );
}

/**
 * Determines whether a trade qualifies for weather surge under given conditions.
 */
export function isTradeSurgeEligible(trade: string, condition: WeatherSurgeCondition): boolean {
  const result = detectWeatherSurgeOpportunity(trade, '', condition);
  return result.surgeActive;
}

/**
 * Evaluates whether local weather conditions warrant a temporary ad budget surge
 * and copy angle switch for the contractor's specific trade, while protecting
 * outdoor weather-sensitive trades from wasteful ad spend during storms.
 */
export function detectWeatherSurgeOpportunity(
  trade: string,
  city: string,
  condition: WeatherSurgeCondition
): WeatherSurgeOpportunity {
  const normTrade = (trade || '').toLowerCase().trim();
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const isStormEvent = Boolean(
    condition.hasStorm ||
    condition.hasHighWind ||
    (condition.alertHeadline && /storm|wind|tornado|hurricane|hail|gale|flood/i.test(condition.alertHeadline))
  );

  // 1. Outdoor Weather-Sensitive Trades during Storms & Bad Weather:
  // Bad weather halts painting, concrete curing, paving, and landscaping operations.
  // We explicitly SUPPRESS surge to protect contractor budgets from unserviceable or rain-delayed clicks.
  if (isOutdoorWeatherSensitiveTrade(trade) && isStormEvent) {
    return {
      surgeActive: false,
      budgetProtected: true,
      surgeTitle: `Bad Weather Budget Guard: Pacing Protected in ${cleanCity}`,
      recommendedAngle: 'standard',
      recommendedBudgetBoostPct: 0,
      rationale: `Severe weather and storm conditions halt outdoor ${trade} operations. Ad budget surge is suppressed to protect your spend from unserviceable or rain-delayed inquiries while jobs are on weather delay.`,
      alertHeadline: condition.alertHeadline || 'Severe Weather / Rain Delay Watch',
      weatherHoldReason: 'Outdoor work unsafe or prohibited during storms/rain. Budget pacing held at standard baseline.',
    };
  }

  // 2. Storm Damage Surge Trades (Roofing, Gutters, Restoration, Emergency Tree Removal):
  // High winds and storm fronts cause sudden leaks and physical damage, driving emergency search volume.
  if (isStormDamageSurgeTrade(trade) && isStormEvent) {
    return {
      surgeActive: true,
      budgetProtected: false,
      surgeTitle: `Storm & Wind Activity Detected in ${cleanCity}`,
      recommendedAngle: 'storm_seasonal',
      recommendedBudgetBoostPct: 25,
      rationale: 'High winds and storm fronts cause sudden roof leaks and structural damage, driving a 3–4x surge in local search volume.',
      alertHeadline: condition.alertHeadline || 'Severe Weather / Storm Watch',
    };
  }

  // 3. HVAC: Extreme Heat (> 90°F) or Hard Freeze (< 32°F)
  if (normTrade.includes('hvac') || normTrade.includes('air') || normTrade.includes('heat') || normTrade.includes('cool')) {
    if (condition.hasExtremeHeat || (condition.temperatureF !== undefined && condition.temperatureF >= 90)) {
      return {
        surgeActive: true,
        budgetProtected: false,
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
        budgetProtected: false,
        surgeTitle: `Freezing Weather Alert in ${cleanCity}`,
        recommendedAngle: 'emergency',
        recommendedBudgetBoostPct: 30,
        rationale: 'Sub-freezing temperatures cause furnace shutdowns and heating emergency searches.',
        alertHeadline: condition.alertHeadline || 'Hard Freeze Warning',
      };
    }
  }

  // 4. Plumbing: Sub-freezing temperatures
  if (normTrade.includes('plumb')) {
    if (condition.hasFreeze || (condition.temperatureF !== undefined && condition.temperatureF <= 32)) {
      return {
        surgeActive: true,
        budgetProtected: false,
        surgeTitle: `Freeze Warning & Burst Pipe Surge in ${cleanCity}`,
        recommendedAngle: 'emergency',
        recommendedBudgetBoostPct: 35,
        rationale: 'Freezing weather causes exposed pipes to burst, driving urgent 24/7 emergency plumber calls.',
        alertHeadline: condition.alertHeadline || 'Freeze Advisory',
      };
    }
  }

  // 5. Default / Baseline: No active surge
  return {
    surgeActive: false,
    budgetProtected: false,
    surgeTitle: 'Normal Seasonal Demand',
    recommendedAngle: 'standard',
    recommendedBudgetBoostPct: 0,
    rationale: 'Weather conditions in your service area are normal. Standard daily pacing is optimal.',
  };
}
