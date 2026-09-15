/**
 * Lightweight i18n for the platform and client-facing portal.
 *
 * No external dependencies. Supported locales: English (default), Spanish,
 * Portuguese, and French.
 *
 * The system reads `Accept-Language` from request headers or the `lgq_locale`
 * cookie, and falls back to English if absent or unsupported.
 *
 * To add a new locale:
 * 1. Create `src/lib/i18n/<code>.ts` mirroring every key in `en.ts`.
 * 2. Import it here and add it to the `messages` map.
 */

import en, { type TranslationKey } from './i18n/en';
import es from './i18n/es';
import pt from './i18n/pt';
import fr from './i18n/fr';

export type Locale = 'en' | 'es' | 'pt' | 'fr';

export type LocaleOption = {
  code: Locale;
  label: string;
  nativeName: string;
  regionHint: string;
};

export const SUPPORTED_LOCALES: readonly LocaleOption[] = [
  { code: 'en', label: 'English', nativeName: 'English', regionHint: 'Default' },
  { code: 'es', label: 'Spanish', nativeName: 'Español', regionHint: 'Estados Unidos / Latinoamérica / España' },
  { code: 'pt', label: 'Portuguese', nativeName: 'Português', regionHint: 'Brasil / Portugal' },
  { code: 'fr', label: 'French', nativeName: 'Français', regionHint: 'Canada / France' },
] as const;

export const LOCALE_COOKIE = 'lgq_locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const messages: Record<Locale, Record<string, string>> = { en, es, pt, fr };

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (value === 'en' || value === 'es' || value === 'pt' || value === 'fr');
}

export function parseLocale(value: unknown): Locale | null {
  return isSupportedLocale(value) ? value : null;
}

export function localeCookieString(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}

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
 */
export function detectLocale(headerValue?: string | null): Locale {
  if (!headerValue) return 'en';
  const lower = headerValue.toLowerCase();
  if (lower.startsWith('es') || lower.includes(',es') || lower.includes(', es')) return 'es';
  if (lower.startsWith('pt') || lower.includes(',pt') || lower.includes(', pt')) return 'pt';
  if (lower.startsWith('fr') || lower.includes(',fr') || lower.includes(', fr')) return 'fr';
  return 'en';
}

export type { TranslationKey };
