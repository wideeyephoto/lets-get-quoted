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
};

// G- then at least four alphanumerics. Google has never published a length, so
// this stays deliberately loose at the top end rather than rejecting a valid id
// on a guess.
const GA4_PATTERN = /^G-[A-Z0-9]{4,16}$/;
const META_PIXEL_PATTERN = /^\d{6,20}$/;

/** Uppercased and trimmed, or '' if it isn't a measurement id. */
export function normalizeGa4Id(input: string): string {
  const value = String(input ?? '').trim().toUpperCase();
  return GA4_PATTERN.test(value) ? value : '';
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

/** An inline message for the builder, or '' when the value is fine. */
export function analyticsIdProblem(kind: 'ga4' | 'metaPixel', input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  if (kind === 'ga4') {
    if (normalizeGa4Id(raw)) return '';
    if (/^UA-/i.test(raw)) return 'That’s an old Universal Analytics ID. Google stopped collecting data for those — you need the G- one from your GA4 property.';
    if (/^GTM-/i.test(raw)) return 'That’s a Google Tag Manager ID. Paste the Measurement ID from your Analytics property instead — it starts with G-.';
    return 'A Measurement ID looks like G-ABCD1234. Find it in Analytics under Admin → Data streams.';
  }
  if (normalizeMetaPixelId(raw)) return '';
  return 'A pixel ID is a long number, like 123456789012345. Find it in Meta Events Manager.';
}

export function hasAnalytics(config: AnalyticsConfig): boolean {
  return Boolean(normalizeGa4Id(config.ga4) || normalizeMetaPixelId(config.metaPixel));
}

/**
 * What the banner has to be honest about.
 *
 * A Meta pixel is advertising tracking, not measurement, and a banner that says
 * "just analytics" while loading one is the dark pattern this is meant to avoid.
 * So the wording is derived from what is actually configured rather than being
 * a fixed string.
 */
export function consentWording(config: AnalyticsConfig): { body: string; kind: 'analytics' | 'ads' } {
  const ads = Boolean(normalizeMetaPixelId(config.metaPixel));
  return ads
    ? {
        kind: 'ads',
        body: 'We use cookies to see which pages bring in work, and to measure our ads on Facebook and Instagram. Say no and we won’t.',
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
