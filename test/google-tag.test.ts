import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getGoogleTagId,
  getGoogleAdsSignupTrackingConfig,
  getSignupConversionSendTo,
  trackGoogleAdsConversion,
  trackSignupConversion,
} from '@/lib/google-tag';
import { isSensitivePath, SENSITIVE_PREFIXES } from '@/components/google-tag';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const GOOGLE_TAG_CODE = read('src', 'components', 'google-tag.tsx');
const ROOT_LAYOUT_CODE = read('src', 'app', 'layout.tsx');
const WELCOME_PAGE_CODE = read('src', 'app', 'welcome', 'page.tsx');
const WELCOME_FORM_CODE = read('src', 'app', 'welcome', 'WelcomeForm.tsx');

describe('google-tag defaults and configuration', () => {
  it('loads nonced Google scripts after hydration from the document body', () => {
    expect(GOOGLE_TAG_CODE).toContain("import Script from 'next/script';");
    expect(GOOGLE_TAG_CODE).toContain('id="lgq-google-tag"');
    expect(GOOGLE_TAG_CODE).toContain('id="lgq-google-tag-init"');
    expect(GOOGLE_TAG_CODE.match(/strategy="afterInteractive"/g)).toHaveLength(2);
    expect(GOOGLE_TAG_CODE).not.toMatch(/<script\b/);

    const bodyStart = ROOT_LAYOUT_CODE.indexOf('<body');
    const googleTag = ROOT_LAYOUT_CODE.indexOf('<GoogleTag />');
    expect(bodyStart).toBeGreaterThan(-1);
    expect(googleTag).toBeGreaterThan(bodyStart);
  });

  it('has no hardcoded production fallback tag ID and returns empty string when unset', () => {
    try {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_TAG_ID', '');
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID', '');
      expect(getGoogleTagId()).toBe('');
      expect(getSignupConversionSendTo()).toBe('');
      expect(getGoogleAdsSignupTrackingConfig()).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('respects environment overrides when set', () => {
    try {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_TAG_ID', 'AW-999999999');
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID', 'AW-999999999/customLabel');
      expect(getGoogleTagId()).toBe('AW-999999999');
      expect(getSignupConversionSendTo()).toBe('AW-999999999/customLabel');
      expect(getGoogleAdsSignupTrackingConfig()).toEqual({
        tagId: 'AW-999999999',
        sendTo: 'AW-999999999/customLabel',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ['tag only', 'AW-999999999', ''],
    ['conversion only', '', 'AW-999999999/customLabel'],
    ['different base IDs', 'AW-999999999', 'AW-111111111/customLabel'],
    ['malformed tag ID', 'G-999999999', 'G-999999999/customLabel'],
    ['missing conversion label', 'AW-999999999', 'AW-999999999'],
  ])('fails closed for %s configuration', (_case, tagId, sendTo) => {
    try {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_TAG_ID', tagId);
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID', sendTo);
      expect(getGoogleAdsSignupTrackingConfig()).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('emits no conversion on welcome-page arrival and tracks only an eligible successful action', () => {
    expect(WELCOME_PAGE_CODE).not.toContain('GoogleTagConversion');
    expect(WELCOME_PAGE_CODE).not.toContain('trackSignupConversion');

    const successGuard = WELCOME_FORM_CODE.indexOf('if (!result.ok)');
    const eligibilityGuard = WELCOME_FORM_CODE.indexOf('if (result.signupConversionTransactionId)');
    const conversionCall = WELCOME_FORM_CODE.indexOf(
      'trackSignupConversion(result.signupConversionTransactionId)',
    );

    expect(successGuard).toBeGreaterThan(-1);
    expect(eligibilityGuard).toBeGreaterThan(successGuard);
    expect(conversionCall).toBeGreaterThan(eligibilityGuard);
    expect(WELCOME_FORM_CODE.match(/trackSignupConversion\(/g)).toHaveLength(1);
  });
});

describe('google-tag route suppression and fail-closed security', () => {
  it('fails closed when pathname is missing, empty, or invalid', () => {
    expect(isSensitivePath(undefined)).toBe(true);
    expect(isSensitivePath(null)).toBe(true);
    expect(isSensitivePath('')).toBe(true);
    expect(isSensitivePath('invalid-path')).toBe(true);
  });

  it('suppresses execution on all token-bearing and capability routes', () => {
    const tokenRoutes = [
      '/quick-stop/req_12345678',
      '/quick-stop',
      '/unsubscribe',
      '/unsubscribe?token=sig_123',
      '/track/token_abc',
      '/portal/view/token_xyz',
      '/office-invite/token_invite',
      '/office-access',
      '/review/token_rev',
      '/schedule/token_sch',
      '/sub/token_sub',
      '/client/jobs/token_job',
      '/pay/req_payment',
      '/invoice/token_invoice',
      '/auth/confirm',
      '/auth/callback',
      '/login',
      '/card-saved',
      '/book/subdomain',
      '/dashboard',
      '/dashboard/jobs',
      '/field',
      '/admin',
      '/quickbooks/callback',
      '/account-suspended',
      '/site-preview-frame',
    ];

    for (const route of tokenRoutes) {
      expect(isSensitivePath(route)).toBe(true);
    }
  });

  it('allows public marketing routes when tag ID is configured', () => {
    const publicRoutes = [
      '/',
      '/pricing',
      '/features',
      '/features/crm',
      '/compare',
      '/demo',
      '/contact',
      '/start',
      '/welcome',
      '/terms',
      '/privacy',
      '/security',
      '/dpa',
      '/sms-terms',
      '/how-it-works',
      '/help',
    ];

    for (const route of publicRoutes) {
      expect(isSensitivePath(route)).toBe(false);
    }
  });

  it('includes key sensitive prefixes in SENSITIVE_PREFIXES constant', () => {
    expect(SENSITIVE_PREFIXES).toContain('/quick-stop');
    expect(SENSITIVE_PREFIXES).toContain('/unsubscribe');
    expect(SENSITIVE_PREFIXES).toContain('/track');
    expect(SENSITIVE_PREFIXES).toContain('/portal');
    expect(SENSITIVE_PREFIXES).toContain('/office-invite');
    expect(SENSITIVE_PREFIXES).toContain('/auth');
    expect(SENSITIVE_PREFIXES).toContain('/dashboard');
    expect(SENSITIVE_PREFIXES).toContain('/login');
  });
});

describe('trackGoogleAdsConversion and trackSignupConversion', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).window = {};
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    vi.unstubAllEnvs();
  });

  it('returns false when window is undefined (SSR)', () => {
    delete (globalThis as any).window;
    expect(trackGoogleAdsConversion({ send_to: 'AW-123/abc' })).toBe(false);
    expect(trackSignupConversion()).toBe(false);
  });

  it('returns false when no send_to target is configured or provided', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID', '');
    expect(trackGoogleAdsConversion()).toBe(false);
  });

  it('pushes conversion event to dataLayer if gtag function is not defined', () => {
    (globalThis as any).window.dataLayer = [];
    const result = trackGoogleAdsConversion({
      send_to: 'AW-999999999/customLabel',
      value: 1.0,
      currency: 'USD',
    });
    expect(result).toBe(true);
    expect((globalThis as any).window.dataLayer).toHaveLength(1);
    expect((globalThis as any).window.dataLayer[0]).toEqual([
      'event',
      'conversion',
      {
        send_to: 'AW-999999999/customLabel',
        value: 1.0,
        currency: 'USD',
      },
    ]);
  });

  it('invokes window.gtag if present', () => {
    const gtagMock = vi.fn();
    (globalThis as any).window.gtag = gtagMock;

    const result = trackGoogleAdsConversion({
      send_to: 'AW-999999999/customLabel',
      value: 5.0,
      currency: 'USD',
      transaction_id: 'tx_123',
    });
    expect(result).toBe(true);
    expect(gtagMock).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-999999999/customLabel',
      value: 5.0,
      currency: 'USD',
      transaction_id: 'tx_123',
    });
  });

  it('prevents double-tracking signup conversion in trackSignupConversion', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_TAG_ID', 'AW-999999999');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID', 'AW-999999999/customLabel');
    if ((globalThis as any).window) {
      delete (globalThis as any).window.__lgq_signup_converted;
    }
    const gtagMock = vi.fn();
    (globalThis as any).window.gtag = gtagMock;

    expect(trackSignupConversion('tx_1')).toBe(true);
    expect(gtagMock).toHaveBeenCalledTimes(1);

    // Second invocation within same window lifecycle is blocked
    expect(trackSignupConversion('tx_2')).toBe(false);
    expect(gtagMock).toHaveBeenCalledTimes(1);
  });
});
