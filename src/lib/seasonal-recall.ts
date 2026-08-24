// Seasonal service recall & client re-engagement engine.
//
// Identifies past completed jobs eligible for recurring maintenance or seasonal
// service, and generates trade-tailored outreach invitations.

export type SeasonalRecallCandidate = {
  jobId: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  trade: string;
  scope: string;
  completedAt: string;
  monthsSinceCompletion: number;
  recallSeason: 'spring' | 'summer' | 'fall' | 'winter' | 'annual';
};

export type SeasonalTopic = {
  season: 'spring' | 'summer' | 'fall' | 'winter' | 'annual';
  headline: string;
  serviceSuggestion: string;
  messageTemplate: string;
};

const TRADE_SEASONAL_TOPICS: Record<string, Record<string, { suggestion: string; benefit: string }>> = {
  hvac: {
    spring: { suggestion: 'A/C system start-up & refrigerant check', benefit: 'ensure crisp cooling and lower summer electric bills' },
    fall: { suggestion: 'Furnace safety inspection & tune-up', benefit: 'prevent mid-winter breakdowns and ensure carbon monoxide safety' },
    annual: { suggestion: 'Annual HVAC system maintenance', benefit: 'extend the lifespan of your heating & cooling equipment' },
  },
  plumbing: {
    spring: { suggestion: 'Outdoor spigot & sump pump inspection', benefit: 'prevent spring basement flooding and check outdoor lines' },
    fall: { suggestion: 'Winter pipe insulation & water heater flush', benefit: 'prevent frozen pipe bursts and clear tank sediment' },
    annual: { suggestion: 'Annual whole-home plumbing safety check', benefit: 'catch hidden leaks before they cause water damage' },
  },
  roofing: {
    spring: { suggestion: 'Post-winter roof inspection & gutter cleaning', benefit: 'check for winter ice damage, lifted shingles, and gutter clogs' },
    fall: { suggestion: 'Pre-winter roof tune-up & debris clearance', benefit: 'prevent winter ice dams and protect against heavy snow loads' },
    annual: { suggestion: 'Annual roof health check', benefit: 'preserve your roof warranty and spot minor wear before leaks start' },
  },
  landscaping: {
    spring: { suggestion: 'Spring cleanup, mulch & bed edging', benefit: 'prep your turf for healthy green growth' },
    fall: { suggestion: 'Fall leaf cleanup & lawn aeration/overseeding', benefit: 'strengthen root systems ahead of winter frost' },
    annual: { suggestion: 'Annual property care plan', benefit: 'keep your outdoor spaces pristine all year round' },
  },
  painting: {
    spring: { suggestion: 'Exterior power washing & deck staining', benefit: 'protect exterior wood surfaces from summer UV and moisture' },
    fall: { suggestion: 'Interior painting & trim refreshes', benefit: 'refresh your indoor spaces before holiday gatherings' },
    annual: { suggestion: 'Annual exterior sealant & touch-up check', benefit: 'prevent moisture intrusion and paint peeling' },
  },
};

function normalizeTradeKey(trade: string | null | undefined): string {
  const clean = (trade || '').toLowerCase();
  if (clean.includes('hvac') || clean.includes('air') || clean.includes('heat')) return 'hvac';
  if (clean.includes('plumb')) return 'plumbing';
  if (clean.includes('roof')) return 'roofing';
  if (clean.includes('landscap') || clean.includes('lawn')) return 'landscaping';
  if (clean.includes('paint')) return 'painting';
  return 'general';
}

export function getCurrentSeason(date = new Date()): 'spring' | 'summer' | 'fall' | 'winter' {
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 11 = Dec
  if (month >= 2 && month <= 4) return 'spring'; // Mar, Apr, May
  if (month >= 5 && month <= 7) return 'summer'; // Jun, Jul, Aug
  if (month >= 8 && month <= 10) return 'fall';  // Sep, Oct, Nov
  return 'winter'; // Dec, Jan, Feb
}

export function resolveSeasonalRecallTopic(trade: string, season?: 'spring' | 'summer' | 'fall' | 'winter' | 'annual'): { suggestion: string; benefit: string } {
  const key = normalizeTradeKey(trade);
  const targetSeason = season || getCurrentSeason();
  const tradeTopics = TRADE_SEASONAL_TOPICS[key];
  if (tradeTopics && tradeTopics[targetSeason]) {
    return tradeTopics[targetSeason];
  }
  if (tradeTopics && tradeTopics.annual) {
    return tradeTopics.annual;
  }
  return {
    suggestion: 'Annual maintenance & safety inspection',
    benefit: 'keep your home operating smoothly and prevent unexpected repair costs',
  };
}

export function buildSeasonalRecallMessage(opts: {
  clientName: string;
  businessName: string;
  trade: string;
  bookingUrl: string;
  season?: 'spring' | 'summer' | 'fall' | 'winter' | 'annual';
}): string {
  const firstName = (opts.clientName || 'there').trim().split(/\s+/)[0] || 'there';
  const business = (opts.businessName || 'our team').trim();
  const bookingUrl = opts.bookingUrl.trim();
  const topic = resolveSeasonalRecallTopic(opts.trade, opts.season);

  return `Hi ${firstName}, this is ${business}! It's that time of year again for ${topic.suggestion} to ${topic.benefit}. Book your preferred window in 60 seconds here: ${bookingUrl}`;
}

export function isJobEligibleForRecall(completedAt: string | null | undefined, now = new Date()): { eligible: boolean; monthsAgo: number } {
  if (!completedAt) return { eligible: false, monthsAgo: 0 };
  const date = new Date(completedAt);
  if (isNaN(date.getTime())) return { eligible: false, monthsAgo: 0 };

  const monthsAgo = Math.max(0, (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth()));

  // Eligible if completed between 5 to 7 months ago (half-year cadence) or 11 to 14 months ago (annual cadence)
  const eligible = (monthsAgo >= 5 && monthsAgo <= 7) || (monthsAgo >= 11 && monthsAgo <= 14);
  return { eligible, monthsAgo };
}
