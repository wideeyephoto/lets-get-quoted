/**
 * Google Search Ads & Campaign Autopilot Generator for Trade Contractors.
 *
 * Provides trade-calibrated keyword generation, negative keyword scrubbing,
 * character-clamped Responsive Search Ad (RSA) generation (≤30 chars headlines,
 * ≤90 chars descriptions), budget and lead projection modeling, and Google Ads Editor
 * CSV generation.
 */

export type TradeAdBenchmark = {
  trade: string;
  avgCpc: number;
  expectedCtr: number;
  landingPageConvRate: number;
  typicalJobValue: number;
};

export const TRADE_BENCHMARKS: Record<string, TradeAdBenchmark> = {
  roofing: {
    trade: 'Roofing',
    avgCpc: 11.5,
    expectedCtr: 4.8,
    landingPageConvRate: 14.0,
    typicalJobValue: 9500,
  },
  plumbing: {
    trade: 'Plumbing',
    avgCpc: 8.75,
    expectedCtr: 5.2,
    landingPageConvRate: 16.0,
    typicalJobValue: 850,
  },
  hvac: {
    trade: 'HVAC',
    avgCpc: 9.8,
    expectedCtr: 5.0,
    landingPageConvRate: 15.0,
    typicalJobValue: 4500,
  },
  electrician: {
    trade: 'Electrical',
    avgCpc: 7.2,
    expectedCtr: 4.5,
    landingPageConvRate: 13.5,
    typicalJobValue: 1200,
  },
  landscaping: {
    trade: 'Landscaping',
    avgCpc: 4.5,
    expectedCtr: 4.2,
    landingPageConvRate: 12.0,
    typicalJobValue: 2800,
  },
  painting: {
    trade: 'Painting',
    avgCpc: 6.2,
    expectedCtr: 4.4,
    landingPageConvRate: 13.0,
    typicalJobValue: 3200,
  },
  cleaning: {
    trade: 'Cleaning',
    avgCpc: 4.0,
    expectedCtr: 4.6,
    landingPageConvRate: 15.0,
    typicalJobValue: 350,
  },
  general: {
    trade: 'General Contractor',
    avgCpc: 6.8,
    expectedCtr: 4.5,
    landingPageConvRate: 13.0,
    typicalJobValue: 5000,
  },
};

export const DEFAULT_NEGATIVE_KEYWORDS: string[] = [
  'diy',
  'how to',
  'tutorial',
  'jobs',
  'hiring',
  'salary',
  'training',
  'apprentice',
  'classes',
  'license requirements',
  'exam',
  'free',
  'cheap',
  'wholesale',
  'home depot',
  'lowes',
  'harbor freight',
  'amazon',
  'youtube',
  'reddit',
  'craigslist',
  'volunteer',
  'scam',
];

export type AdProjections = {
  monthlyBudget: number;
  dailyBudget: number;
  avgCpc: number;
  estimatedMonthlyClicks: number;
  estimatedMonthlyLeads: number;
  estimatedCostPerLead: number;
  estimatedJobRevenue: number;
  benchmark: TradeAdBenchmark;
};

/**
 * Calculates realistic search traffic, lead volume, and CPL projections based on budget and trade.
 */
export function calculateAdProjections(monthlyBudget: number, tradeSlug = 'general'): AdProjections {
  const normTrade = (tradeSlug || '').toLowerCase().trim();
  const benchmark =
    TRADE_BENCHMARKS[normTrade] ||
    Object.values(TRADE_BENCHMARKS).find((b) => normTrade.includes(b.trade.toLowerCase())) ||
    TRADE_BENCHMARKS.general;

  const budget = Math.max(50, monthlyBudget);
  const dailyBudget = Math.round((budget / 30.4) * 100) / 100;
  const estimatedMonthlyClicks = Math.round(budget / benchmark.avgCpc);
  const estimatedMonthlyLeads = Math.max(1, Math.round(estimatedMonthlyClicks * (benchmark.landingPageConvRate / 100)));
  const estimatedCostPerLead = Math.round(budget / estimatedMonthlyLeads);
  const estimatedJobRevenue = Math.round(estimatedMonthlyLeads * 0.35 * benchmark.typicalJobValue);

  return {
    monthlyBudget: budget,
    dailyBudget,
    avgCpc: benchmark.avgCpc,
    estimatedMonthlyClicks,
    estimatedMonthlyLeads,
    estimatedCostPerLead,
    estimatedJobRevenue,
    benchmark,
  };
}

export type KeywordGroup = {
  service: string;
  phraseMatch: string[];
  exactMatch: string[];
};

/**
 * Generates high-intent local search keywords for each selected service in a target city.
 */
export function generateTradeKeywords(
  services: string[],
  city: string,
  tradeName = 'Contractor',
  competitorExclusions: string[] = []
): {
  keywordGroups: KeywordGroup[];
  allKeywords: string[];
  negativeKeywords: string[];
} {
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const stateMatch = (city || '').match(/,\s*([A-Z]{2})$/i);
  const state = stateMatch ? stateMatch[1].toUpperCase() : '';
  const cityLocation = cleanCity ? (state ? `${cleanCity} ${state}` : cleanCity) : 'Local';

  const keywordGroups: KeywordGroup[] = [];
  const allKeywords: string[] = [];

  const targetServices = services.length > 0 ? services : [tradeName];

  for (const s of targetServices) {
    const cleanService = s.trim();
    if (!cleanService) continue;

    const phraseMatch: string[] = [
      `"${cleanService.toLowerCase()} near me"`,
      `"${cleanService.toLowerCase()} in ${cityLocation.toLowerCase()}"`,
      `"${cleanService.toLowerCase()} company"`,
      `"${cleanService.toLowerCase()} estimate"`,
      `"emergency ${cleanService.toLowerCase()}"`,
    ];

    const exactMatch: string[] = [
      `[${cleanService.toLowerCase()} ${cleanCity.toLowerCase()}]`,
      `[best ${cleanService.toLowerCase()} ${cleanCity.toLowerCase()}]`,
      `[${cleanService.toLowerCase()} cost ${cleanCity.toLowerCase()}]`,
      `[local ${cleanService.toLowerCase()}]`,
    ];

    keywordGroups.push({
      service: cleanService,
      phraseMatch,
      exactMatch,
    });

    allKeywords.push(...phraseMatch, ...exactMatch);
  }

  // Add overall trade terms
  if (tradeName) {
    const tradePhrase = [
      `"${tradeName.toLowerCase()} near me"`,
      `"${tradeName.toLowerCase()} in ${cityLocation.toLowerCase()}"`,
      `"best ${tradeName.toLowerCase()} ${cleanCity.toLowerCase()}"`,
    ];
    allKeywords.push(...tradePhrase);
  }

  const competitorNegatives: string[] = [];
  for (const comp of competitorExclusions) {
    const cleanComp = comp.toLowerCase().trim();
    if (cleanComp) {
      competitorNegatives.push(
        cleanComp,
        `${cleanComp} reviews`,
        `${cleanComp} phone`,
        `${cleanComp} customer service`,
      );
    }
  }

  return {
    keywordGroups,
    allKeywords,
    negativeKeywords: [...DEFAULT_NEGATIVE_KEYWORDS, ...competitorNegatives],
  };
}

export type ResponsiveSearchAd = {
  headlines: string[];
  descriptions: string[];
  sitelinks: { title: string; desc: string; url: string }[];
  callExtension?: string;
  finalUrl: string;
};

export function clampText(text: string, maxLen: number): string {
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1).trim() + '…';
}

export function toTitleCase(str: string): string {
  if (!str) return '';
  return str.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Generates compliant Responsive Search Ad (RSA) copy with strict Google character limits:
 * - Headlines: max 30 characters
 * - Descriptions: max 90 characters
 */
export function generateResponsiveSearchAd(params: {
  businessName: string;
  trade: string;
  city: string;
  services: string[];
  phone?: string;
  landingPageUrl: string;
}): ResponsiveSearchAd {
  const { businessName, trade, city, services, phone, landingPageUrl } = params;
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const titleTrade = toTitleCase(trade);

  const rawHeadlines: string[] = [
    clampText(`${titleTrade} in ${cleanCity}`, 30),
    clampText(businessName || `${titleTrade} Pros`, 30),
    clampText('Fast Free Estimates', 30),
    clampText('Licensed & Insured', 30),
    clampText('Instant Online Quote', 30),
    clampText('Top-Rated Local Pros', 30),
    clampText('24/7 Emergency Service', 30),
    clampText('5-Star Customer Reviews', 30),
    clampText('Book Online in 2 Mins', 30),
    clampText('Fair & Upfront Pricing', 30),
    ...services.slice(0, 5).map((s) => clampText(`${toTitleCase(s)} Experts`, 30)),
  ];

  // Dedup and take up to 15 headlines (Google RSA limit)
  const headlines = Array.from(new Set(rawHeadlines.filter(Boolean))).slice(0, 15);

  const rawDescriptions: string[] = [
    clampText(`Need reliable ${trade.toLowerCase()} in ${cleanCity}? Instant online quotes & expert local service.`, 90),
    clampText(`Locally owned, licensed & insured. Top-rated quality backed by warranty. Request a quote!`, 90),
    clampText(`Fast response time and transparent upfront pricing. Book your project estimate online now.`, 90),
    clampText(`From emergency repairs to full installations. Staged deposits & flexible payment options.`, 90),
  ];

  const descriptions = rawDescriptions.slice(0, 4);

  const finalUrl = landingPageUrl.includes('utm_source=')
    ? landingPageUrl
    : `${landingPageUrl}${landingPageUrl.includes('?') ? '&' : '?'}utm_source=google&utm_medium=cpc&utm_campaign=managed_search`;

  const sitelinks = [
    {
      title: clampText('Get Free Estimate', 25),
      desc: clampText('Instant online quote in 60 seconds', 35),
      url: finalUrl,
    },
    {
      title: clampText('Our Services', 25),
      desc: clampText('Explore our complete service list', 35),
      url: `${finalUrl}#services`,
    },
    {
      title: clampText('Verified Reviews', 25),
      desc: clampText('See 5-star ratings from neighbors', 35),
      url: `${finalUrl}#reviews`,
    },
    {
      title: clampText('Service Area Map', 25),
      desc: clampText('Check our service radius', 35),
      url: `${finalUrl}#service-area`,
    },
  ];

  return {
    headlines,
    descriptions,
    sitelinks,
    callExtension: phone?.trim() || undefined,
    finalUrl,
  };
}

export type StructuredAdGroup = {
  name: string;
  theme: 'emergency' | 'replacement' | 'maintenance';
  bidModifierMobile: number; // e.g. 1.25 for +25% on mobile
  rsa: ResponsiveSearchAd;
  keywords: string[];
};

export type CallOnlyAd = {
  businessName: string;
  phoneNumber: string;
  headline1: string;
  headline2: string;
  description1: string;
  description2: string;
  verificationUrl: string;
};

/**
 * Generates high-converting Single-Theme Ad Groups (STAGs) segmented by urgency & job ticket value.
 */
export function generateStructuredAdGroups(params: {
  businessName: string;
  trade: string;
  city: string;
  services: string[];
  phone?: string;
  landingPageUrl: string;
}): StructuredAdGroup[] {
  const { businessName, trade, city, services, phone, landingPageUrl } = params;
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const titleTrade = toTitleCase(trade);

  // 1. Emergency & Same-Day Repairs (High urgency, high mobile bid adjustment)
  const emergencyRsa: ResponsiveSearchAd = {
    headlines: [
      clampText(`24/7 Emergency ${titleTrade}`, 30),
      clampText(`Fast Same-Day Dispatch`, 30),
      clampText(`On-Call Now in ${cleanCity}`, 30),
      clampText(businessName || `${titleTrade} Pros`, 30),
      clampText('Fast 60-Minute Arrival', 30),
      clampText('Licensed & Insured Pros', 30),
      clampText('Upfront Honest Pricing', 30),
      clampText('No Overtime Surprise Fees', 30),
    ],
    descriptions: [
      clampText(`Urgent ${titleTrade.toLowerCase()} issue in ${cleanCity}? Fast dispatch & expert repairs. Call or book online now!`, 90),
      clampText(`24/7 emergency service with transparent upfront pricing. 5-star local pros on call today.`, 90),
    ],
    sitelinks: [
      { title: clampText('Emergency Dispatch', 25), desc: clampText('Direct crew dispatch line', 35), url: `${landingPageUrl}?intent=emergency` },
      { title: clampText('Instant Estimate', 25), desc: clampText('Get quoted online in 60s', 35), url: landingPageUrl },
    ],
    callExtension: phone?.trim(),
    finalUrl: `${landingPageUrl}${landingPageUrl.includes('?') ? '&' : '?'}intent=emergency&utm_content=emergency_adgroup`,
  };

  const emergencyKeywords = [
    `"emergency ${trade.toLowerCase()} in ${cleanCity.toLowerCase()}"`,
    `"24/7 ${trade.toLowerCase()} repair"`,
    `"same day ${trade.toLowerCase()} service"`,
    `[emergency ${trade.toLowerCase()} repair ${cleanCity.toLowerCase()}]`,
    `"urgent ${trade.toLowerCase()} help"`,
    ...services.slice(0, 3).map((s) => `"emergency ${s.toLowerCase()}"`),
  ];

  // 2. Full Replacements & Major Installations (High ticket, Target ROAS)
  const replacementRsa: ResponsiveSearchAd = {
    headlines: [
      clampText(`${titleTrade} Replacement Experts`, 30),
      clampText(`Complete System Installation`, 30),
      clampText(`Free In-Home Assessment`, 30),
      clampText(`Top-Rated ${cleanCity} Pros`, 30),
      clampText(`Financing Available $0 Down`, 30),
      clampText(`Backed by 10-Yr Warranty`, 30),
      clampText(businessName || `${titleTrade} Specialists`, 30),
      clampText(`Transparent Project Quote`, 30),
    ],
    descriptions: [
      clampText(`Upgrading or replacing your ${titleTrade.toLowerCase()} in ${cleanCity}? Premium materials & guaranteed warranty.`, 90),
      clampText(`Get a detailed, transparent proposal with flexible financing options. Schedule free estimate!`, 90),
    ],
    sitelinks: [
      { title: clampText('Free Replacement Quote', 25), desc: clampText('Custom scope & transparent pricing', 35), url: `${landingPageUrl}?intent=replacement` },
      { title: clampText('Financing Options', 25), desc: clampText('Low monthly payments available', 35), url: `${landingPageUrl}#financing` },
    ],
    callExtension: phone?.trim(),
    finalUrl: `${landingPageUrl}${landingPageUrl.includes('?') ? '&' : '?'}intent=replacement&utm_content=replacement_adgroup`,
  };

  const replacementKeywords = [
    `"${trade.toLowerCase()} replacement ${cleanCity.toLowerCase()}"`,
    `"new ${trade.toLowerCase()} installation"`,
    `"cost of ${trade.toLowerCase()} replacement"`,
    `[${trade.toLowerCase()} installation near me]`,
    ...services.slice(0, 3).map((s) => `"${s.toLowerCase()} installation ${cleanCity.toLowerCase()}"`),
  ];

  // 3. Maintenance & Seasonal Inspections (Low-friction entry offers)
  const maintenanceRsa: ResponsiveSearchAd = {
    headlines: [
      clampText(`${titleTrade} Tune-Up & Check`, 30),
      clampText(`Comprehensive Inspection`, 30),
      clampText(`Prevent Costly Breakdowns`, 30),
      clampText(`Local ${cleanCity} Experts`, 30),
      clampText(`Top-Rated Maintenance Pros`, 30),
      clampText(businessName || `${titleTrade} Service`, 30),
    ],
    descriptions: [
      clampText(`Keep your ${titleTrade.toLowerCase()} running at peak performance. Multi-point inspection & tune-up specials.`, 90),
      clampText(`Trusted local technicians. Prevent unexpected system failures with regular maintenance.`, 90),
    ],
    sitelinks: [
      { title: clampText('Schedule Tune-Up', 25), desc: clampText('Quick 45-minute inspection', 35), url: `${landingPageUrl}?intent=tuneup` },
    ],
    callExtension: phone?.trim(),
    finalUrl: `${landingPageUrl}${landingPageUrl.includes('?') ? '&' : '?'}intent=maintenance&utm_content=maintenance_adgroup`,
  };

  const maintenanceKeywords = [
    `"${trade.toLowerCase()} inspection ${cleanCity.toLowerCase()}"`,
    `"${trade.toLowerCase()} maintenance service"`,
    `"annual ${trade.toLowerCase()} tune up"`,
    `[${trade.toLowerCase()} checkup near me]`,
  ];

  return [
    {
      name: '01 - Emergency & Same-Day Repairs',
      theme: 'emergency',
      bidModifierMobile: 1.3, // +30% on mobile searches
      rsa: emergencyRsa,
      keywords: emergencyKeywords,
    },
    {
      name: '02 - Full Replacements & Installations',
      theme: 'replacement',
      bidModifierMobile: 1.0,
      rsa: replacementRsa,
      keywords: replacementKeywords,
    },
    {
      name: '03 - Maintenance & Seasonal Inspections',
      theme: 'maintenance',
      bidModifierMobile: 1.0,
      rsa: maintenanceRsa,
      keywords: maintenanceKeywords,
    },
  ];
}

/**
 * Generates a mobile Call-Only ad variation for immediate phone inquiries.
 */
export function generateCallOnlyAd(params: {
  businessName: string;
  phone: string;
  trade: string;
  city: string;
  landingPageUrl: string;
}): CallOnlyAd {
  const { businessName, phone, trade, city, landingPageUrl } = params;
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const titleTrade = toTitleCase(trade);

  return {
    businessName: clampText(businessName || `${titleTrade} Pros`, 25),
    phoneNumber: phone,
    headline1: clampText(`24/7 ${titleTrade} in ${cleanCity}`, 30),
    headline2: clampText('Fast Local Dispatch · Call Now', 30),
    description1: clampText(`Speak directly with a local licensed ${titleTrade.toLowerCase()} technician. Fast upfront estimates.`, 90),
    description2: clampText(`Top-rated 5-star quality. No waiting on hold—call our dispatch line directly today!`, 90),
    verificationUrl: landingPageUrl,
  };
}

export type AdDayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export type AdScheduleConfig = {
  days: AdDayOfWeek[];
  startHour: number; // 0-23
  endHour: number;   // 1-24
};

export const ALL_DAYS_OF_WEEK: AdDayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
];

export const WEEKDAYS: AdDayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

export type GoogleAdsCampaignSpec = {
  campaignName: string;
  monthlyBudget: number;
  dailyBudget: number;
  targetCity: string;
  targetRadiusMiles: number;
  rsa: ResponsiveSearchAd;
  keywords: string[];
  negativeKeywords: string[];
  schedule?: AdScheduleConfig;
};

/**
 * Generates a Google Ads Editor CSV compatible file for 1-click import into Google Ads.
 */
export function generateGoogleAdsEditorCsv(spec: GoogleAdsCampaignSpec): string {
  const rows: string[] = [];

  // CSV Header
  rows.push(
    'Campaign,Ad Group,Keyword,Criterion Type,Headline 1,Headline 2,Headline 3,Headline 4,Headline 5,Description 1,Description 2,Description 3,Description 4,Final URL,Campaign Daily Budget,Ad Schedule'
  );

  const escape = (str: string) => `"${(str || '').replace(/"/g, '""')}"`;

  const adGroupName = 'Local Search - High Intent';
  const h = spec.rsa.headlines;
  const d = spec.rsa.descriptions;

  const scheduleStr = spec.schedule
    ? `${spec.schedule.days.join(';')}:${spec.schedule.startHour}:00-${spec.schedule.endHour}:00`
    : 'ALL_DAYS:00:00-24:00';

  // Add the Ad row
  rows.push(
    [
      escape(spec.campaignName),
      escape(adGroupName),
      '', // No keyword on Ad row
      '',
      escape(h[0] || ''),
      escape(h[1] || ''),
      escape(h[2] || ''),
      escape(h[3] || ''),
      escape(h[4] || ''),
      escape(d[0] || ''),
      escape(d[1] || ''),
      escape(d[2] || ''),
      escape(d[3] || ''),
      escape(spec.rsa.finalUrl),
      spec.dailyBudget.toFixed(2),
      escape(scheduleStr),
    ].join(',')
  );

  // Add Keyword rows
  for (const kw of spec.keywords) {
    let matchType = 'Broad';
    let cleanKw = kw;
    if (kw.startsWith('"') && kw.endsWith('"')) {
      matchType = 'Phrase';
      cleanKw = kw.slice(1, -1);
    } else if (kw.startsWith('[') && kw.endsWith(']')) {
      matchType = 'Exact';
      cleanKw = kw.slice(1, -1);
    }

    rows.push(
      [
        escape(spec.campaignName),
        escape(adGroupName),
        escape(cleanKw),
        escape(matchType),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ].join(',')
    );
  }

  // Add Negative Keyword rows
  for (const neg of spec.negativeKeywords) {
    rows.push(
      [
        escape(spec.campaignName),
        escape(adGroupName),
        escape(neg),
        escape('Negative Phrase'),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ].join(',')
    );
  }

  return rows.join('\n');
}

export type SeasonalAdAngle = 'standard' | 'emergency' | 'storm_seasonal' | 'peak_renovation';

/**
 * Generates seasonal ad copy angles tailored to weather, storm seasons, and emergencies.
 */
export function generateSeasonalAdCopy(
  trade: string,
  city: string,
  angle: SeasonalAdAngle = 'standard'
): {
  headlineHooks: string[];
  descriptionHook: string;
} {
  const cleanCity = (city || '').replace(/,\s*[A-Z]{2}$/i, '').trim();
  const titleTrade = toTitleCase(trade);

  if (angle === 'emergency') {
    return {
      headlineHooks: [
        clampText(`24/7 Fast Emergency Response`, 30),
        clampText(`Immediate ${titleTrade} Dispatch`, 30),
        clampText(`On-Call Today in ${cleanCity}`, 30),
      ],
      descriptionHook: clampText(
        `Urgent ${titleTrade.toLowerCase()} emergency? We are on call 24/7 across ${cleanCity}. Fast dispatch and upfront pricing.`,
        90
      ),
    };
  }

  if (angle === 'storm_seasonal') {
    return {
      headlineHooks: [
        clampText(`Storm Damage Inspections`, 30),
        clampText(`Free Leak & Storm Check`, 30),
        clampText(`Local Weather Repair Pros`, 30),
      ],
      descriptionHook: clampText(
        `Recent storm in ${cleanCity}? Get a free damage assessment & insurance-ready quote today.`,
        90
      ),
    };
  }

  if (angle === 'peak_renovation') {
    return {
      headlineHooks: [
        clampText(`Book Spring Transformations`, 30),
        clampText(`Seasonal Upgrade Discounts`, 30),
        clampText(`Reserve Your Project Slot`, 30),
      ],
      descriptionHook: clampText(
        `Ready for your seasonal home upgrade in ${cleanCity}? Lock in your project date and get an instant estimate.`,
        90
      ),
    };
  }

  return {
    headlineHooks: [
      clampText(`Fast Free Estimates`, 30),
      clampText(`Top-Rated Local ${titleTrade}`, 30),
      clampText(`Licensed & Insured`, 30),
    ],
    descriptionHook: clampText(
      `Top-rated ${titleTrade.toLowerCase()} in ${cleanCity}. Transparent pricing and instant online quotes.`,
      90
    ),
  };
}

/**
 * Checks whether the contractor's site is in Capacity/Fully Booked mode and should pause ad spend.
 */
export function checkCampaignCapacityGuard(
  leadFilters?: { fullyBooked?: { enabled: boolean; until?: string; message?: string } } | null,
  now = new Date()
): {
  shouldPauseBidding: boolean;
  reason?: string;
} {
  if (!leadFilters?.fullyBooked?.enabled) {
    return { shouldPauseBidding: false };
  }

  const until = leadFilters.fullyBooked.until;
  if (!until) {
    return {
      shouldPauseBidding: true,
      reason: 'Bidding auto-paused: Website is in Fully Booked mode until turned off.',
    };
  }

  const endDate = new Date(`${until}T23:59:59`);
  if (!Number.isNaN(endDate.getTime()) && endDate.getTime() >= now.getTime()) {
    return {
      shouldPauseBidding: true,
      reason: `Bidding auto-paused: Website is in Fully Booked mode until ${until}.`,
    };
  }

  return { shouldPauseBidding: false };
}
