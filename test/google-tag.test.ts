import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_GOOGLE_TAG_ID,
  DEFAULT_SIGNUP_CONVERSION_SEND_TO,
  getGoogleTagId,
  getSignupConversionSendTo,
  trackGoogleAdsConversion,
  trackSignupConversion,
} from '@/lib/google-tag';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

const GOOGLE_TAG_CODE = read('src', 'components', 'google-tag.tsx');
const ROOT_LAYOUT_CODE = read('src', 'app', 'layout.tsx');

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

  it('uses default Google tag ID and conversion send_to', () => {
    expect(DEFAULT_GOOGLE_TAG_ID).toBe('AW-18400954668');
    expect(DEFAULT_SIGNUP_CONVERSION_SEND_TO).toBe('AW-18400954668/lyRGCLLH6-QcEKySocZE');
    expect(getGoogleTagId()).toBe('AW-18400954668');
    expect(getSignupConversionSendTo()).toBe('AW-18400954668/lyRGCLLH6-QcEKySocZE');
  });

  it('respects environment overrides when set', () => {
    try {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_TAG_ID', 'AW-999999999');
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID', 'AW-999999999/customLabel');
      expect(getGoogleTagId()).toBe('AW-999999999');
      expect(getSignupConversionSendTo()).toBe('AW-999999999/customLabel');
    } finally {
      vi.unstubAllEnvs();
    }
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
  });

  it('returns false when window is undefined (SSR)', () => {
    delete (globalThis as any).window;
    expect(trackGoogleAdsConversion()).toBe(false);
    expect(trackSignupConversion()).toBe(false);
  });

  it('pushes conversion event to dataLayer if gtag function is not defined', () => {
    (globalThis as any).window.dataLayer = [];
    const result = trackGoogleAdsConversion({ value: 1.0, currency: 'USD' });
    expect(result).toBe(true);
    expect((globalThis as any).window.dataLayer).toHaveLength(1);
    expect((globalThis as any).window.dataLayer[0]).toEqual([
      'event',
      'conversion',
      {
        send_to: 'AW-18400954668/lyRGCLLH6-QcEKySocZE',
        value: 1.0,
        currency: 'USD',
      },
    ]);
  });

  it('invokes window.gtag if present', () => {
    const gtagMock = vi.fn();
    (globalThis as any).window.gtag = gtagMock;

    const result = trackGoogleAdsConversion({ value: 5.0, currency: 'USD', transaction_id: 'tx_123' });
    expect(result).toBe(true);
    expect(gtagMock).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-18400954668/lyRGCLLH6-QcEKySocZE',
      value: 5.0,
      currency: 'USD',
      transaction_id: 'tx_123',
    });
  });

  it('prevents double-tracking signup conversion in trackSignupConversion', () => {
    const gtagMock = vi.fn();
    (globalThis as any).window.gtag = gtagMock;

    expect(trackSignupConversion('tx_1')).toBe(true);
    expect(gtagMock).toHaveBeenCalledTimes(1);

    // Second invocation within same window lifecycle is blocked
    expect(trackSignupConversion('tx_2')).toBe(false);
    expect(gtagMock).toHaveBeenCalledTimes(1);
  });
});
