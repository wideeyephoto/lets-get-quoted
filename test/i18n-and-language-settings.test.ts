import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUPPORTED_LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  detectLocale,
  isSupportedLocale,
  localeCookieString,
  parseLocale,
  t,
  tRecord,
  type Locale,
} from '@/lib/i18n';
import en from '@/lib/i18n/en';
import es from '@/lib/i18n/es';
import pt from '@/lib/i18n/pt';
import fr from '@/lib/i18n/fr';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireOfficeContext: vi.fn(),
  cookieStore: {
    set: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: mocks.requireOfficeContext,
  createAdminClient: vi.fn(),
}));

describe('i18n and Contractor Language Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOfficeContext.mockResolvedValue({
      supabase: {},
      accountId: 'acc_123',
      role: 'owner',
    });
  });

  describe('Locale definitions and validation', () => {
    it('defines supported locales with expected metadata', () => {
      const codes = SUPPORTED_LOCALES.map((l) => l.code);
      expect(codes).toEqual(['en', 'es', 'pt', 'fr']);

      expect(SUPPORTED_LOCALES.find((l) => l.code === 'en')?.nativeName).toBe('English');
      expect(SUPPORTED_LOCALES.find((l) => l.code === 'es')?.nativeName).toBe('Español');
      expect(SUPPORTED_LOCALES.find((l) => l.code === 'pt')?.nativeName).toBe('Português');
      expect(SUPPORTED_LOCALES.find((l) => l.code === 'fr')?.nativeName).toBe('Français');
    });

    it('validates supported locales with isSupportedLocale and parseLocale', () => {
      expect(isSupportedLocale('en')).toBe(true);
      expect(isSupportedLocale('es')).toBe(true);
      expect(isSupportedLocale('pt')).toBe(true);
      expect(isSupportedLocale('fr')).toBe(true);

      expect(isSupportedLocale('de')).toBe(false);
      expect(isSupportedLocale('')).toBe(false);
      expect(isSupportedLocale(null)).toBe(false);
      expect(isSupportedLocale(undefined)).toBe(false);

      expect(parseLocale('es')).toBe('es');
      expect(parseLocale('pt')).toBe('pt');
      expect(parseLocale('fr')).toBe('fr');
      expect(parseLocale('invalid')).toBe(null);
    });

    it('formats cookie string correctly', () => {
      const cookieStr = localeCookieString('es');
      expect(cookieStr).toContain(`${LOCALE_COOKIE}=es`);
      expect(cookieStr).toContain('Path=/');
      expect(cookieStr).toContain(`Max-Age=${LOCALE_COOKIE_MAX_AGE}`);
    });
  });

  describe('detectLocale', () => {
    it('defaults to English when header is empty or missing', () => {
      expect(detectLocale(null)).toBe('en');
      expect(detectLocale(undefined)).toBe('en');
      expect(detectLocale('')).toBe('en');
    });

    it('detects Spanish correctly', () => {
      expect(detectLocale('es-MX,es;q=0.9,en;q=0.8')).toBe('es');
      expect(detectLocale('es')).toBe('es');
      expect(detectLocale('en-US,es;q=0.5')).toBe('es');
    });

    it('detects Portuguese correctly', () => {
      expect(detectLocale('pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt');
      expect(detectLocale('pt')).toBe('pt');
    });

    it('detects French correctly', () => {
      expect(detectLocale('fr-CA,fr;q=0.9,en;q=0.8')).toBe('fr');
      expect(detectLocale('fr')).toBe('fr');
    });

    it('falls back to English for other languages', () => {
      expect(detectLocale('de-DE,de;q=0.9')).toBe('en');
      expect(detectLocale('ja-JP')).toBe('en');
    });
  });

  describe('Translation dictionary parity', () => {
    const enKeys = Object.keys(en);

    it('Spanish dictionary contains all English keys', () => {
      for (const key of enKeys) {
        expect(es[key], `Missing key in Spanish: ${key}`).toBeDefined();
      }
    });

    it('Portuguese dictionary contains all English keys', () => {
      for (const key of enKeys) {
        expect(pt[key], `Missing key in Portuguese: ${key}`).toBeDefined();
      }
    });

    it('French dictionary contains all English keys', () => {
      for (const key of enKeys) {
        expect(fr[key], `Missing key in French: ${key}`).toBeDefined();
      }
    });

    it('translates keys across all locales', () => {
      expect(t('en', 'ui.view')).toBe('View');
      expect(t('es', 'ui.view')).toBe('Ver');
      expect(t('pt', 'ui.view')).toBe('Visualizar');
      expect(t('fr', 'ui.view')).toBe('Afficher');

      expect(t('en', 'payment.status.paid')).toBe('Paid');
      expect(t('es', 'payment.status.paid')).toBe('Pagado');
      expect(t('pt', 'payment.status.paid')).toBe('Pago');
      expect(t('fr', 'payment.status.paid')).toBe('Payé');
    });

    it('tRecord produces localized status dictionaries', () => {
      const records = tRecord('pt', 'payment.status', ['requested', 'processing', 'paid']);
      expect(records).toEqual({
        requested: 'Aguardando pagamento',
        processing: 'Processando',
        paid: 'Pago',
      });
    });
  });

  describe('updateLanguagePreferenceAction', () => {
    it('rejects unsupported languages', async () => {
      const { updateLanguagePreferenceAction } = await import(
        '@/app/dashboard/settings/actions'
      );

      await expect(updateLanguagePreferenceAction('de')).rejects.toThrow('Unsupported language');
      expect(mocks.cookieStore.set).not.toHaveBeenCalled();
    });

    it('sets cookie and revalidates paths for valid locale', async () => {
      const { updateLanguagePreferenceAction } = await import(
        '@/app/dashboard/settings/actions'
      );

      const res = await updateLanguagePreferenceAction('es');
      expect(res).toEqual({ ok: true, locale: 'es' });

      expect(mocks.cookieStore.set).toHaveBeenCalledWith(LOCALE_COOKIE, 'es', {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });

      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard', 'layout');
      expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/settings');
    });
  });
});
