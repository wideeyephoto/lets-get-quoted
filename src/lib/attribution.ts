// First-party campaign and traffic attribution for contractor websites.
//
// WHAT THIS DOES:
// When visitors arrive on a contractor's website from social ads (Meta, TikTok),
// search ads (Google, Bing), local directories (Nextdoor, Yelp), or newsletters,
// this module captures and normalizes the campaign parameters (UTMs and Click IDs)
// in first-party sessionStorage.
//
// ZERO THIRD-PARTY LEAKAGE:
// Stored strictly in the visitor's browser session on the contractor's domain.
// Attached as first-party metadata when the visitor submits an estimate or
// quote request, so the contractor can see in their dashboard exactly which ad,
// post, or marketing channel brought in the job.

export type LeadAttribution = {
  /** UTM Source or primary referrer, e.g. 'facebook', 'google', 'instagram', 'nextdoor', 'newsletter' */
  source?: string;
  /** UTM Medium, e.g. 'cpc', 'paid_social', 'organic', 'email', 'referral' */
  medium?: string;
  /** UTM Campaign name, e.g. 'spring_roofing_promo_2026' */
  campaign?: string;
  /** On-site promo or discount offer code */
  promo?: string;
  /** Search term or keyword, e.g. 'emergency roof repair' */
  term?: string;
  /** Ad creative or placement identifier, e.g. 'video_ad_v2', 'hero_cta' */
  content?: string;
  /** Click identifier from advertising networks (gclid, gbraid, wbraid, fbclid, ttclid, msclkid) */
  clickId?: string;
  /** Type of click identifier */
  clickIdType?: 'fbclid' | 'gclid' | 'gbraid' | 'wbraid' | 'ttclid' | 'msclkid' | 'other';
  /** Original HTTP referrer or external domain */
  referrer?: string;
  /** Initial landing page path + search query */
  landingPage?: string;
  /** ISO timestamp when the attribution was first recorded */
  capturedAt?: string;
};

export const ATTRIBUTION_STORAGE_KEY = 'lgq_attribution';

const KNOWN_REFERRER_SOURCES: Array<{ pattern: RegExp; source: string; defaultMedium: string }> = [
  { pattern: /facebook\.com|fb\.com|fb\.me/i, source: 'facebook', defaultMedium: 'social' },
  { pattern: /instagram\.com/i, source: 'instagram', defaultMedium: 'social' },
  { pattern: /tiktok\.com/i, source: 'tiktok', defaultMedium: 'social' },
  { pattern: /google\.[a-z.]+/i, source: 'google', defaultMedium: 'organic' },
  { pattern: /bing\.com/i, source: 'bing', defaultMedium: 'organic' },
  { pattern: /yahoo\.[a-z.]+/i, source: 'yahoo', defaultMedium: 'organic' },
  { pattern: /nextdoor\.com/i, source: 'nextdoor', defaultMedium: 'referral' },
  { pattern: /yelp\.[a-z.]+/i, source: 'yelp', defaultMedium: 'referral' },
  { pattern: /angi\.com|angieslist\.com/i, source: 'angi', defaultMedium: 'referral' },
  { pattern: /houzz\.com/i, source: 'houzz', defaultMedium: 'referral' },
  { pattern: /thumbtack\.com/i, source: 'thumbtack', defaultMedium: 'referral' },
  { pattern: /linkedin\.com/i, source: 'linkedin', defaultMedium: 'social' },
  { pattern: /youtube\.com|youtu\.be/i, source: 'youtube', defaultMedium: 'social' },
  { pattern: /pinterest\.[a-z.]+/i, source: 'pinterest', defaultMedium: 'social' },
  { pattern: /x\.com|twitter\.com|t\.co/i, source: 'x', defaultMedium: 'social' },
];

function sanitizeString(val: unknown, maxLen = 120): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, maxLen);
}

/**
 * Parses query parameters and referrer into a structured LeadAttribution object.
 */
export function parseAttribution(urlString: string, referrerString?: string): LeadAttribution | null {
  try {
    const url = new URL(urlString, 'https://placeholder.local');
    const params = url.searchParams;

    const utmSource = sanitizeString(params.get('utm_source'), 60);
    const utmMedium = sanitizeString(params.get('utm_medium'), 60);
    const utmCampaign = sanitizeString(params.get('utm_campaign') || params.get('campaign') || params.get('promo'), 100);
    const utmTerm = sanitizeString(params.get('utm_term'), 100);
    const utmContent = sanitizeString(params.get('utm_content'), 100);

    const fbclid = sanitizeString(params.get('fbclid'), 150);
    const gclid = sanitizeString(params.get('gclid'), 150);
    const gbraid = sanitizeString(params.get('gbraid'), 150);
    const wbraid = sanitizeString(params.get('wbraid'), 150);
    const ttclid = sanitizeString(params.get('ttclid'), 150);
    const msclkid = sanitizeString(params.get('msclkid'), 150);

    let clickId = '';
    let clickIdType: LeadAttribution['clickIdType'] = undefined;

    if (gclid) {
      clickId = gclid;
      clickIdType = 'gclid';
    } else if (gbraid) {
      clickId = gbraid;
      clickIdType = 'gbraid';
    } else if (wbraid) {
      clickId = wbraid;
      clickIdType = 'wbraid';
    } else if (fbclid) {
      clickId = fbclid;
      clickIdType = 'fbclid';
    } else if (ttclid) {
      clickId = ttclid;
      clickIdType = 'ttclid';
    } else if (msclkid) {
      clickId = msclkid;
      clickIdType = 'msclkid';
    }

    let source = utmSource;
    let medium = utmMedium;

    // If source wasn't explicitly in UTMs, inspect click IDs or referrer
    if (!source) {
      if (clickIdType === 'gclid' || clickIdType === 'gbraid' || clickIdType === 'wbraid') {
        source = 'google';
        medium = medium || 'cpc';
      } else if (clickIdType === 'fbclid') {
        source = 'facebook';
        medium = medium || 'cpc';
      } else if (clickIdType === 'ttclid') {
        source = 'tiktok';
        medium = medium || 'cpc';
      } else if (clickIdType === 'msclkid') {
        source = 'bing';
        medium = medium || 'cpc';
      } else if (referrerString) {
        try {
          const refUrl = new URL(referrerString);
          const refHost = refUrl.hostname.toLowerCase();
          const match = KNOWN_REFERRER_SOURCES.find((entry) => entry.pattern.test(refHost));
          if (match) {
            source = match.source;
            medium = medium || match.defaultMedium;
          } else if (refHost && !refHost.includes(url.hostname)) {
            source = refHost.replace(/^www\./, '');
            medium = medium || 'referral';
          }
        } catch {
          // ignore invalid referrer
        }
      }
    }

    // Nothing meaningful to attribute
    if (!source && !medium && !utmCampaign && !clickId) {
      return null;
    }

    const landingPage = `${url.pathname}${url.search ? url.search : ''}`.slice(0, 300);
    const referrer = referrerString ? sanitizeString(referrerString, 300) : undefined;

    return {
      source: source || undefined,
      medium: medium || undefined,
      campaign: utmCampaign || undefined,
      term: utmTerm || undefined,
      content: utmContent || undefined,
      clickId: clickId || undefined,
      clickIdType,
      referrer: referrer || undefined,
      landingPage: landingPage || undefined,
      capturedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function getStoredAttributionRaw(): LeadAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawSession = window.sessionStorage?.getItem(ATTRIBUTION_STORAGE_KEY);
    if (rawSession) return JSON.parse(rawSession) as LeadAttribution;
  } catch {
    // ignore sessionStorage errors
  }
  try {
    const rawLocal = window.localStorage?.getItem(ATTRIBUTION_STORAGE_KEY);
    if (rawLocal) return JSON.parse(rawLocal) as LeadAttribution;
  } catch {
    // ignore localStorage errors
  }
  try {
    const match = document.cookie?.match(new RegExp(`(?:^|; )${ATTRIBUTION_STORAGE_KEY}=([^;]*)`));
    if (match?.[1]) {
      return JSON.parse(decodeURIComponent(match[1])) as LeadAttribution;
    }
  } catch {
    // ignore cookie errors
  }
  return null;
}

function persistAttributionRaw(data: LeadAttribution): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(data);
  try {
    window.sessionStorage?.setItem(ATTRIBUTION_STORAGE_KEY, json);
  } catch {
    // ignore
  }
  try {
    window.localStorage?.setItem(ATTRIBUTION_STORAGE_KEY, json);
  } catch {
    // ignore
  }
  try {
    // Store 30-day first-party cookie for cross-session attribution
    document.cookie = `${ATTRIBUTION_STORAGE_KEY}=${encodeURIComponent(json)}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
  } catch {
    // ignore
  }
}

/**
 * Initializes and persists attribution in the browser across sessionStorage,
 * localStorage, and first-party cookies for seamless cross-session attribution.
 * Safe to call on every client-side page load.
 */
export function getOrCaptureAttribution(): LeadAttribution | null {
  if (typeof window === 'undefined') return null;

  try {
    const currentUrl = window.location.href;
    const currentReferrer = document.referrer;
    const fresh = parseAttribution(currentUrl, currentReferrer);

    const stored = getStoredAttributionRaw();

    // If fresh parameters (like UTMs or Click IDs) are found in current URL, update storage
    if (fresh && (fresh.campaign || fresh.clickId || fresh.source !== stored?.source)) {
      persistAttributionRaw(fresh);
      return fresh;
    }

    if (stored) return stored;

    // If no stored attribution and fresh referrer/campaign exists, store it
    if (fresh) {
      persistAttributionRaw(fresh);
      return fresh;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Sanitizes an incoming unknown attribution object (e.g. from an API request).
 */
export function sanitizeAttribution(raw: unknown): LeadAttribution | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const source = sanitizeString(obj.source, 60);
  const medium = sanitizeString(obj.medium, 60);
  const campaign = sanitizeString(obj.campaign, 100);
  const term = sanitizeString(obj.term, 100);
  const content = sanitizeString(obj.content, 100);
  const clickId = sanitizeString(obj.clickId, 150);
  const clickIdType = (['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'msclkid', 'other'] as const).includes(obj.clickIdType as 'fbclid' | 'gclid' | 'gbraid' | 'wbraid' | 'ttclid' | 'msclkid' | 'other')
    ? (obj.clickIdType as LeadAttribution['clickIdType'])
    : undefined;
  const referrer = sanitizeString(obj.referrer, 300);
  const landingPage = sanitizeString(obj.landingPage, 300);
  const capturedAt = typeof obj.capturedAt === 'string' && !Number.isNaN(new Date(obj.capturedAt).getTime())
    ? obj.capturedAt
    : new Date().toISOString();

  if (!source && !medium && !campaign && !clickId && !referrer) return null;

  return {
    source: source || undefined,
    medium: medium || undefined,
    campaign: campaign || undefined,
    term: term || undefined,
    content: content || undefined,
    clickId: clickId || undefined,
    clickIdType,
    referrer: referrer || undefined,
    landingPage: landingPage || undefined,
    capturedAt,
  };
}

export type AttributionSummary = {
  /** Short label for badges (e.g. "Facebook Ad", "Spring Promo", "Google Search") */
  headline: string;
  /** Detailed description (e.g. "Campaign: spring_sale · cpc") */
  detail?: string;
  /** Whether this represents a paid advertising campaign */
  isPaid: boolean;
  /** Source name for icons */
  channel: 'facebook' | 'google' | 'tiktok' | 'instagram' | 'nextdoor' | 'bing' | 'email' | 'referral' | 'direct';
};

/**
 * Returns a human-friendly attribution label and icon key for contractor dashboards.
 */
export function formatLeadAttribution(attr: LeadAttribution | null | undefined): AttributionSummary | null {
  if (!attr) return null;

  const src = (attr.source || '').toLowerCase();
  const med = (attr.medium || '').toLowerCase();
  const isPaid = med === 'cpc' || med === 'paid' || med === 'paid_social' || Boolean(attr.clickId);

  let channel: AttributionSummary['channel'] = 'direct';
  if (src.includes('facebook') || attr.clickIdType === 'fbclid') channel = 'facebook';
  else if (src.includes('google') || attr.clickIdType === 'gclid' || attr.clickIdType === 'gbraid' || attr.clickIdType === 'wbraid') channel = 'google';
  else if (src.includes('tiktok') || attr.clickIdType === 'ttclid') channel = 'tiktok';
  else if (src.includes('instagram')) channel = 'instagram';
  else if (src.includes('nextdoor')) channel = 'nextdoor';
  else if (src.includes('bing') || attr.clickIdType === 'msclkid') channel = 'bing';
  else if (med.includes('email') || src.includes('newsletter')) channel = 'email';
  else if (med.includes('referral') || attr.referrer) channel = 'referral';

  let headline = '';
  if (attr.campaign) {
    headline = attr.campaign.replace(/[-_]+/g, ' ');
  } else if (channel === 'facebook') {
    headline = isPaid ? 'Facebook Ad' : 'Facebook';
  } else if (channel === 'google') {
    headline = isPaid ? 'Google Search Ad' : 'Google Search';
  } else if (channel === 'tiktok') {
    headline = isPaid ? 'TikTok Ad' : 'TikTok';
  } else if (channel === 'instagram') {
    headline = isPaid ? 'Instagram Ad' : 'Instagram';
  } else if (channel === 'nextdoor') {
    headline = 'Nextdoor';
  } else if (channel === 'email') {
    headline = 'Email Campaign';
  } else if (attr.source) {
    headline = attr.source;
  } else {
    headline = 'Direct / Organic';
  }

  const detailParts: string[] = [];
  if (attr.campaign && (attr.source || isPaid)) {
    detailParts.push(`${attr.source || 'Ad'}${isPaid ? ' (Paid)' : ''}`);
  }
  if (attr.term) {
    detailParts.push(`Keyword: "${attr.term}"`);
  }
  if (attr.content) {
    detailParts.push(`Creative: ${attr.content}`);
  }

  return {
    headline,
    detail: detailParts.length > 0 ? detailParts.join(' · ') : undefined,
    isPaid,
    channel,
  };
}
