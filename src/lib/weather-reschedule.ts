/**
 * 1-Tap Weather Reschedule Notification Engine.
 *
 * Automatically detects severe weather risks (heavy rain, freezing temperatures, high winds)
 * and drafts batch reschedule outreach to homeowners for outdoor trades.
 */

export type WeatherCondition = 'rain' | 'storm' | 'freeze' | 'snow' | 'wind' | 'extreme_heat';

export type WeatherRescheduleInput = {
  clientName: string;
  businessName: string;
  originalDate: string;
  proposedDate: string;
  condition: WeatherCondition;
  scope?: string | null;
  bookingUrl?: string | null;
};

export type TradeWeatherRisk = {
  hasRisk: boolean;
  reason: string | null;
  severity: 'low' | 'medium' | 'high';
};

const WEATHER_CONDITION_COPY: Record<WeatherCondition, string> = {
  rain: 'heavy rain forecast',
  storm: 'severe thunderstorm warning',
  freeze: 'freezing temperatures',
  snow: 'snow and icy conditions',
  wind: 'high wind gusts',
  extreme_heat: 'excessive heat advisory',
};

/**
 * Builds professional SMS reschedule copy for weather-delayed visits.
 */
export function buildWeatherRescheduleSms(input: WeatherRescheduleInput): string {
  const firstName = input.clientName.trim().split(/\s+/)[0] || 'there';
  const conditionText = WEATHER_CONDITION_COPY[input.condition] || 'inclement weather';
  const jobScope = input.scope ? ` for your ${input.scope.toLowerCase()}` : '';

  let message = `Hi ${firstName}, due to the ${conditionText} on ${input.originalDate}, ${input.businessName} would like to reschedule our visit${jobScope} to ${input.proposedDate} to ensure the highest quality craftsmanship and safety.`;

  if (input.bookingUrl) {
    message += ` Reply YES to confirm this new time, or choose a different date here: ${input.bookingUrl}`;
  } else {
    message += ` Reply YES if ${input.proposedDate} works for you, or let us know what day is best.`;
  }

  return message;
}

/**
 * Detects whether upcoming weather parameters pose a work-stopping hazard for a given trade.
 */
export function detectWeatherRiskForTrade(
  trade: string,
  forecast: {
    precipProbability?: number;
    windMph?: number;
    tempMin?: number;
    tempMax?: number;
  }
): TradeWeatherRisk {
  const t = trade.toLowerCase();
  const precip = forecast.precipProbability ?? 0;
  const wind = forecast.windMph ?? 0;
  const minTemp = forecast.tempMin ?? 60;
  const maxTemp = forecast.tempMax ?? 75;

  const isRainSensitive =
    t.includes('roof') ||
    t.includes('paint') ||
    t.includes('concrete') ||
    t.includes('paving') ||
    t.includes('pressure-wash') ||
    t.includes('gutter');

  if (isRainSensitive && precip >= 60) {
    return {
      hasRisk: true,
      reason: `${precip}% chance of rain makes exterior installation/curing unsafe.`,
      severity: 'high',
    };
  }

  if ((t.includes('roof') || t.includes('tree') || t.includes('siding')) && wind >= 25) {
    return {
      hasRisk: true,
      reason: `Sustained winds of ${wind} mph exceed ladder and roof safety limits.`,
      severity: 'high',
    };
  }

  if ((t.includes('concrete') || t.includes('masonry') || t.includes('irrigation')) && minTemp <= 32) {
    return {
      hasRisk: true,
      reason: `Freezing low of ${minTemp}°F disrupts curing and damages water lines.`,
      severity: 'high',
    };
  }

  if ((t.includes('roof') || t.includes('paving') || t.includes('tree')) && maxTemp >= 100) {
    return {
      hasRisk: true,
      reason: `Extreme heat high of ${maxTemp}°F poses heat exhaustion hazards on outdoor sites.`,
      severity: 'high',
    };
  }

  if (isRainSensitive && precip >= 40) {
    return {
      hasRisk: true,
      reason: `Moderate rain risk (${precip}%). Monitor weather for potential shift.`,
      severity: 'medium',
    };
  }

  return {
    hasRisk: false,
    reason: null,
    severity: 'low',
  };
}
