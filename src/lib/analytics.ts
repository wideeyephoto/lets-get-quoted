// Visitor measurement on a contractor's website.
//
// THE IDS BELONG TO THE CONTRACTOR, NOT TO US. This is their Google Analytics
// property and their Meta pixel, on their own site, feeding their own ad
// account. We render the tags; we never read the data.
//
// NOTHING LOADS UNTIL SOMEONE SAYS YES. The usual pattern is Google Consent
// Mode — load the tag immediately with storage "denied" and let it ping anyway
// for modelled conversions. That is defensible for a company with a privacy
// team. It is the wrong default to hand a one-truck plumber who will never read
// the setting, because it still contacts Google on every page view before the
// visitor has agreed to anything. So the tag is not loaded at all until consent
// is granted: simpler to explain, simpler to defend, and it fails closed.
//
// The consequence, stated plainly so nobody reports it as a bug: pageviews from
// visitors who decline, or who leave before choosing, are not counted. The
// numbers will be lower than a contractor's previous site if that one tracked
// everybody. That is what consent means.

export type AnalyticsConfig = {
  /** Google Analytics 4 measurement id, e.g. G-ABCD1234. Empty = off. */
  ga4: string;
  /** Meta (Facebook) pixel id — digits only. Empty = off. */
  metaPixel: string;
  /** Google Ads conversion id, e.g. AW-123456789. Empty = off. */
  googleAdsId?: string;
  /** TikTok pixel id — alphanumeric, e.g. C1234567890ABCDEF. Empty = off. */
  tiktokPixel?: string;
};

// G- then at least four alphanumerics. Google has never published a length, so
// this stays deliberately loose at the top end rather than rejecting a valid id
// on a guess.
const GA4_PATTERN = /^G-[A-Z0-9]{4,16}$/;
const GOOGLE_ADS_PATTERN = /^AW-\d{6,15}$/;
const META_PIXEL_PATTERN = /^\d{6,20}$/;
const TIKTOK_PIXEL_PATTERN = /^[A-Z0-9]{12,24}$/i;

/** Uppercased and trimmed, or '' if it isn't a measurement id. */
export function normalizeGa4Id(input: string): string {
  const value = String(input ?? '').trim().toUpperCase();
  return GA4_PATTERN.test(value) ? value : '';
}

/** Normalized Google Ads ID, e.g. AW-123456789. */
export function normalizeGoogleAdsId(input: string): string {
  const raw = String(input ?? '').trim().toUpperCase();
  if (GOOGLE_ADS_PATTERN.test(raw)) return raw;
  if (/^\d{6,15}$/.test(raw)) return `AW-${raw}`;
  return '';
}

/**
 * Digits only, or ''.
 *
 * People paste the whole snippet or the "Pixel ID: 123…" line from Events
 * Manager, so pull the digits out rather than rejecting it — but only when the
 * digits are the only thing of substance, so a pasted script tag full of numbers
 * can't be mistaken for an id.
 */
export function normalizeMetaPixelId(input: string): string {
  const raw = String(input ?? '').trim();
  if (META_PIXEL_PATTERN.test(raw)) return raw;
  // Code punctuation means a pasted snippet, not an id with a label in front of
  // it. Scraping digits out of a snippet is not safe: a real Meta tag carries
  // version numbers and several calls besides the id, so "the digits" is an
  // ambiguous question with a plausible-looking wrong answer.
  if (/[<>(){};='"/\\]/.test(raw)) return '';
  const digits = raw.replace(/\D+/g, '');
  // A human label, not a paragraph. "Pixel ID: 123…" yes, an essay no.
  if (raw.replace(/\d+/g, '').trim().length > 24) return '';
  return META_PIXEL_PATTERN.test(digits) ? digits : '';
}

/** Alphanumeric TikTok pixel id, trimmed or ''. */
export function normalizeTiktokPixelId(input: string): string {
  const raw = String(input ?? '').trim();
  if (/[<>(){};='"/\\]/.test(raw)) return '';
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, '');
  return TIKTOK_PIXEL_PATTERN.test(cleaned) ? cleaned.toUpperCase() : '';
}

/** An inline message for the builder, or '' when the value is fine. */
export function analyticsIdProblem(kind: 'ga4' | 'metaPixel' | 'googleAds' | 'tiktokPixel', input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (kind === 'ga4') {
    if (normalizeGa4Id(raw)) return '';
    if (/^UA-/i.test(raw)) return 'That’s an old Universal Analytics ID. Google stopped collecting data for those — you need the G- one from your GA4 property.';
    if (/^GTM-/i.test(raw)) return 'That’s a Google Tag Manager ID. Paste the Measurement ID from your Analytics property instead — it starts with G-.';
    return 'A Measurement ID looks like G-ABCD1234. Find it in Analytics under Admin → Data streams.';
  }
  if (kind === 'googleAds') {
    if (normalizeGoogleAdsId(raw)) return '';
    return 'A Google Ads ID looks like AW-123456789. Find it in Google Ads under Tools & Settings → Conversions.';
  }
  if (kind === 'metaPixel') {
    if (normalizeMetaPixelId(raw)) return '';
    return 'A pixel ID is a long number, like 123456789012345. Find it in Meta Events Manager.';
  }
  if (kind === 'tiktokPixel') {
    if (normalizeTiktokPixelId(raw)) return '';
    return 'A TikTok Pixel ID looks like C1234567890ABCDEF. Find it in TikTok Ads Manager under Assets → Events.';
  }
  return '';
}

export function hasAnalytics(config: AnalyticsConfig): boolean {
  return Boolean(
    normalizeGa4Id(config.ga4) ||
    normalizeMetaPixelId(config.metaPixel) ||
    normalizeGoogleAdsId(config.googleAdsId ?? '') ||
    normalizeTiktokPixelId(config.tiktokPixel ?? '')
  );
}

/**
 * What the banner has to be honest about.
 *
 * An ad pixel is advertising tracking, not measurement, and a banner that says
 * "just analytics" while loading one is the dark pattern this is meant to avoid.
 * So the wording is derived from what is actually configured rather than being
 * a fixed string.
 */
export function consentWording(config: AnalyticsConfig): { body: string; kind: 'analytics' | 'ads' } {
  const ads = Boolean(
    normalizeMetaPixelId(config.metaPixel) ||
    normalizeGoogleAdsId(config.googleAdsId ?? '') ||
    normalizeTiktokPixelId(config.tiktokPixel ?? '')
  );
  return ads
    ? {
        kind: 'ads',
        body: 'We use cookies to see which pages bring in work, and to measure our ads on Google, Facebook, Instagram, or TikTok. Say no and we won’t.',
      }
    : {
        kind: 'analytics',
        body: 'We use cookies to see which pages bring in work — how many people visit and what they look at. No ads, and nothing is sold on. Say no and we won’t.',
      };
}

/**
 * Whether measurement should run on this page at all, independent of consent.
 *
 * Three cases where it must not, all of which would otherwise put OUR traffic
 * into a contractor's reports:
 *   - the builder's live preview, which reloads on every keystroke
 *   - the template gallery, which renders demo sites
 *   - local development
 *
 * `inFrame` covers the first two: the only place a contractor site renders
 * inside an iframe is our own preview, so an owner nudging their headline would
 * otherwise register as hundreds of pageviews.
 */
export function shouldMeasure({ hostname, inFrame }: { hostname: string; inFrame: boolean }): boolean {
  if (inFrame) return false;
  const host = String(hostname ?? '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
  // Vercel preview deployments are real hosts, but their traffic is us.
  if (host.endsWith('.vercel.app')) return false;
  return true;
}

/**
 * Where the visitor's answer is remembered.
 *
 * Named for what it is rather than for us: a visitor who opens devtools to see
 * what a site stored should be able to read the key and understand it. It also
 * lives on the CONTRACTOR's domain, where our brand has no business appearing.
 */
export const CONSENT_STORAGE_KEY = 'cookie-consent';
export type ConsentDecision = 'granted' | 'denied';

export function readConsent(raw: string | null): ConsentDecision | null {
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

export type QuoteFunnelStep = 'form_impression' | 'form_started' | 'first_step_completed' | 'contact_submitted';

export type QuoteFunnelPayload = {
  step: QuoteFunnelStep;
  formStyle: string;
  template: string;
  colorScheme?: string;
  device: 'mobile' | 'desktop';
  siteId?: string;
};

export function trackQuoteFunnelStep(payload: QuoteFunnelPayload): void {
  if (typeof window === 'undefined') return;

  // Custom DOM event for telemetry & testing
  try {
    const event = new CustomEvent('lgq:quote-funnel', { detail: payload });
    window.dispatchEvent(event);
  } catch {
    // ignore
  }

  // Google Analytics 4 & Google Ads (if loaded & consented)
  const win = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (event: string, params?: Record<string, unknown>) => void };
  };

  if (typeof win.gtag === 'function') {
    try {
      win.gtag('event', `quote_${payload.step}`, {
        event_category: 'quote_intake',
        form_style: payload.formStyle,
        template: payload.template,
        color_scheme: payload.colorScheme || 'default',
        device_type: payload.device,
        site_id: payload.siteId || '',
      });

      if (payload.step === 'contact_submitted') {
        win.gtag('event', 'conversion', {
          send_to: 'default',
          event_category: 'quote_intake',
          event_label: payload.formStyle,
        });
      }
    } catch {
      // ignore
    }
  }

  // Meta Pixel (if loaded & consented)
  if (typeof win.fbq === 'function') {
    try {
      if (payload.step === 'form_started') {
        win.fbq('trackCustom', 'QuoteFormStarted', { formStyle: payload.formStyle, template: payload.template });
      } else if (payload.step === 'contact_submitted') {
        win.fbq('track', 'Lead', { content_name: `Quote - ${payload.formStyle}`, value: 0, currency: 'USD' });
      }
    } catch {
      // ignore
    }
  }

  // TikTok Pixel (if loaded & consented)
  if (win.ttq && typeof win.ttq.track === 'function') {
    try {
      if (payload.step === 'form_started') {
        win.ttq.track('InitiateCheckout', { content_name: `Quote - ${payload.formStyle}` });
      } else if (payload.step === 'contact_submitted') {
        win.ttq.track('SubmitForm', { content_name: `Quote - ${payload.formStyle}` });
      }
    } catch {
      // ignore
    }
  }
}

