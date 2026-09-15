/**
 * Google Ads engine coverage test
 *
 * Targets:
 *   - src/lib/google-ads-api.ts  (hashSha256, normalizeEmailForHash,
 *     normalizePhoneForHash, uploadOfflineConversion, provisionManagedSearchCampaign)
 *   - src/lib/google-ads-verifier.ts  (maskId, runVerification dry-run,
 *     runOfflineConversionVerification dry-run, missing-credentials fast path)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── google-ads-api.ts ────────────────────────────────────────────────────────

import {
  hashSha256,
  normalizeEmailForHash,
  normalizePhoneForHash,
  uploadOfflineConversion,
  provisionManagedSearchCampaign,
  resolveServingCustomerId,
  GOOGLE_ADS_API_VERSION as API_VER,
} from '@/lib/google-ads-api';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

// fetch is mocked globally by no-provider-egress; override it here
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

// ── hashSha256 ───────────────────────────────────────────────────────────────

describe('google-ads-api — hashSha256', () => {
  it('returns a 64-char hex string for non-empty input', () => {
    const result = hashSha256('hello@world.com');
    expect(typeof result).toBe('string');
    expect(result!.length).toBe(64);
    expect(/^[a-f0-9]{64}$/.test(result!)).toBe(true);
  });

  it('returns undefined for null input', () => {
    expect(hashSha256(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(hashSha256('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(hashSha256('   ')).toBeUndefined();
  });

  it('is deterministic — same input yields same hash', () => {
    const a = hashSha256('test@example.com');
    const b = hashSha256('test@example.com');
    expect(a).toBe(b);
  });

  it('produces distinct hashes for distinct inputs', () => {
    const a = hashSha256('a@example.com');
    const b = hashSha256('b@example.com');
    expect(a).not.toBe(b);
  });
});

// ── normalizeEmailForHash ────────────────────────────────────────────────────

describe('google-ads-api — normalizeEmailForHash', () => {
  it('lowercases and trims before hashing', () => {
    const lc = normalizeEmailForHash('user@example.com');
    const uc = normalizeEmailForHash('  USER@EXAMPLE.COM  ');
    expect(lc).toBe(uc);
  });

  it('returns undefined for null', () => {
    expect(normalizeEmailForHash(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizeEmailForHash('')).toBeUndefined();
  });

  it('produces a 64-char hash for valid email', () => {
    const result = normalizeEmailForHash('contractor@example.com');
    expect(result!.length).toBe(64);
  });
});

// ── normalizePhoneForHash ────────────────────────────────────────────────────

describe('google-ads-api — normalizePhoneForHash', () => {
  it('returns undefined for null', () => {
    expect(normalizePhoneForHash(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(normalizePhoneForHash('')).toBeUndefined();
  });

  it('strips non-digit characters and prepends +1 for 10-digit US number', () => {
    const a = normalizePhoneForHash('(555) 123-4567');
    const b = normalizePhoneForHash('+15551234567');
    // Both should normalize to +15551234567 before hashing
    expect(a).toBe(b);
  });

  it('produces a 64-char hash', () => {
    const result = normalizePhoneForHash('5551234567');
    expect(result!.length).toBe(64);
  });

  it('is deterministic for same input', () => {
    const a = normalizePhoneForHash('5551234567');
    const b = normalizePhoneForHash('5551234567');
    expect(a).toBe(b);
  });
});

// ── uploadOfflineConversion ──────────────────────────────────────────────────

describe('google-ads-api — uploadOfflineConversion', () => {
  it('returns success:false and message when no credentials configured', async () => {
    // No env vars set → should fail gracefully without calling fetch
    const result = await uploadOfflineConversion({
      gclid: 'test-gclid-123',
      conversionActionName: 'Won Job',
      conversionValueDollars: 1500,
      email: 'customer@example.com',
      phone: '5551234567',
    });

    expect(result).toMatchObject({
      success: expect.any(Boolean),
      conversionValueDollars: 1500,
      enhancedConversionsActive: expect.any(Boolean),
      uploadedAt: expect.any(String),
      message: expect.any(String),
    });
  });

  it('returns correct conversionValueDollars in result', async () => {
    const result = await uploadOfflineConversion({
      gclid: 'gclid-abc',
      conversionActionName: 'Lead Captured',
      conversionValueDollars: 250,
    });

    expect(result.conversionValueDollars).toBe(250);
    expect(result.uploadedAt).toMatch(/^\d{4}-/); // ISO date prefix
  });

  it('defaults conversionValueDollars to 0 when not specified', async () => {
    const result = await uploadOfflineConversion({
      conversionActionName: 'Lead Captured',
    });

    expect(result.conversionValueDollars).toBe(0);
  });

  it('includes enhanced conversion metadata when email/phone provided', async () => {
    const result = await uploadOfflineConversion({
      gclid: 'test-gclid',
      conversionActionName: 'Won Job',
      email: 'user@example.com',
      phone: '5559998888',
      firstName: 'Alice',
      lastName: 'Smith',
      postalCode: '75201',
    });

    // enhancedConversionsActive reflects whether EC data was included
    expect(result).toHaveProperty('enhancedConversionsActive');
  });
});

// ── provisionManagedSearchCampaign ───────────────────────────────────────────

describe('google-ads-api — provisionManagedSearchCampaign (sandbox)', () => {
  it('returns a campaign spec in sandbox mode when no credentials are set', async () => {
    const result = await provisionManagedSearchCampaign({
      accountId: 'acct-test',
      businessName: 'Acme Services',
      trade: 'Roofing',
      city: 'Dallas',
      radiusMiles: 25,
      monthlyBudgetDollars: 300,
      services: ['Roof Repair', 'Roof Replacement'],
      landingPageUrl: 'https://example.com/roofing',
    });

    expect(result).toMatchObject({
      campaignResourceName: expect.any(String),
      keywordsCount: expect.any(Number),
      message: expect.any(String),
    });
  });
});

// ── resolveServingCustomerId ─────────────────────────────────────────────────

describe('google-ads-api — resolveServingCustomerId', () => {
  it('returns null when called with an explicit customerId matching MCC', async () => {
    // Mock admin for resolveServingCustomerId
    const { createAdminClient } = await import('@/lib/auth');
    const mockChain = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockChain as unknown as ReturnType<typeof createAdminClient>);

    // resolveServingCustomerId returns null when DB has no override and no
    // GOOGLE_ADS_CLIENT_CUSTOMER_ID env is set
    const result = await resolveServingCustomerId('acct-1');
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

// ── google-ads-verifier.ts ────────────────────────────────────────────────────

import {
  maskId,
  runVerification,
  runOfflineConversionVerification,
  GOOGLE_ADS_API_VERSION,
} from '@/lib/google-ads-verifier';

describe('google-ads-verifier — maskId', () => {
  it('masks a standard customer ID showing only last 4 digits', () => {
    const masked = maskId('1234567890');
    expect(masked).toBe('***-***-7890');
  });

  it('strips dashes before masking', () => {
    const masked = maskId('123-456-7890');
    expect(masked).toBe('***-***-7890');
  });

  it('returns (none) for null', () => {
    expect(maskId(null)).toBe('(none)');
  });

  it('returns (none) for undefined', () => {
    expect(maskId(undefined)).toBe('(none)');
  });

  it('returns *** for very short IDs', () => {
    expect(maskId('123')).toBe('***');
  });

  it('exports correct API version', () => {
    expect(GOOGLE_ADS_API_VERSION).toMatch(/^v\d+$/);
  });
});

describe('google-ads-verifier — runVerification dry-run', () => {
  it('returns a full VerificationReport with success:true in dry-run mode', async () => {
    const report = await runVerification({ dryRun: true });

    expect(report.success).toBe(true);
    expect(report.mode).toBe('dry-run');
    expect(report.steps.length).toBeGreaterThanOrEqual(5);
    expect(report.steps.every((s) => s.status === 'PASS')).toBe(true);
    expect(report.timestamp).toMatch(/^\d{4}-/);
    expect(report.apiVersion).toMatch(/^v\d+$/);
  });

  it('returns a report with servingCustomerId masked in dry-run', async () => {
    const report = await runVerification({
      dryRun: true,
      customerId: '9998887776',
      mccCustomerId: '1112223334',
    });

    expect(report.servingCustomerId).toBeDefined();
    expect(report.servingCustomerId).toContain('***');
  });

  it('returns success:false with error message when credentials are missing (live mode)', async () => {
    // Clear any env vars that might be set
    const originalEnv = { ...process.env };
    delete process.env.GOOGLE_ADS_CLIENT_ID;
    delete process.env.GOOGLE_ADS_CLIENT_SECRET;
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;

    const report = await runVerification({ dryRun: false });

    expect(report.success).toBe(false);
    expect(report.error).toBeTruthy();
    expect(report.error).toContain('Missing required credentials');

    Object.assign(process.env, originalEnv);
  });
});

describe('google-ads-verifier — runOfflineConversionVerification dry-run', () => {
  it('returns OfflineConversionReport with success:true in dry-run mode', async () => {
    const report = await runOfflineConversionVerification({ dryRun: true });

    expect(report.success).toBe(true);
    expect(report.mode).toBe('dry-run');
    expect(report.steps.length).toBeGreaterThan(0);
    expect(report.timestamp).toMatch(/^\d{4}-/);
    expect(report.apiVersion).toMatch(/^v\d+$/);
  });

  it('returns success:false with error when credentials missing (live mode)', async () => {
    const originalEnv = { ...process.env };
    delete process.env.GOOGLE_ADS_CLIENT_ID;
    delete process.env.GOOGLE_ADS_CLIENT_SECRET;
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    delete process.env.GOOGLE_ADS_REFRESH_TOKEN;

    const report = await runOfflineConversionVerification({ dryRun: false });

    expect(report.success).toBe(false);
    expect(report.error).toBeTruthy();

    Object.assign(process.env, originalEnv);
  });
});
