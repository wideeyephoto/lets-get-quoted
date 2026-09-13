/**
 * Lightweight i18n for the client-facing portal.
 *
 * No external dependencies. Two supported locales: English (default) and Spanish.
 * The system reads `Accept-Language` from the request headers, and falls back to
 * English if the header is absent or asks for anything we don't have yet.
 *
 * To add a new locale:
 * 1. Create `src/lib/i18n/<code>.ts` mirroring every key in `en.ts`.
 * 2. Import it here and add it to the `messages` map.
 */

import en, { type TranslationKey } from './i18n/en';
import es from './i18n/es';

export type Locale = 'en' | 'es';

const messages: Record<Locale, Record<string, string>> = { en, es };

/**
 * Translate a key into the given locale. Falls back to English if the key is
 * missing, and to the raw key if it's missing everywhere.
 */
export function t(locale: Locale, key: TranslationKey | string): string {
  return messages[locale]?.[key] ?? messages.en[key] ?? key;
}

/**
 * Build a status-label lookup for a given prefix.
 * e.g. `tRecord(locale, 'payment.status', { requested, processing, paid, ... })`
 * returns a Record<string, string> mapping each DB value to its translated label.
 */
export function tRecord(locale: Locale, prefix: string, dbKeys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of dbKeys) out[k] = t(locale, `${prefix}.${k}`);
  return out;
}

/**
 * Detect the preferred locale from a request's `Accept-Language` header.
 * Returns 'es' if Spanish is listed, otherwise 'en'.
 */
export function detectLocale(headerValue?: string | null): Locale {
  if (!headerValue) return 'en';
  // Parse quality-weighted tags. We only care about 'es' vs everything else.
  const lower = headerValue.toLowerCase();
  if (lower.startsWith('es') || lower.includes(',es') || lower.includes(', es')) return 'es';
  return 'en';
}

export type { TranslationKey };
