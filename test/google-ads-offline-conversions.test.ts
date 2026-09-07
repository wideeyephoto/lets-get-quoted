import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore - raw ESM script
import { parseArgs, maskId, runOfflineConversionVerification } from '../scripts/verify-google-ads-offline-conversions.mjs';

describe('Google Ads v25 Offline Conversion Upload & Allowlist Verification Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Argument Parsing and ID Masking', () => {
    it('parses custom arguments correctly', () => {
      const args = parseArgs([
        '--customer-id', '228-567-1544',
        '--client-id', 'test-client-id',
        '--action-id', '987654321',
      ]);
      expect(args.customerId).toBe('228-567-1544');
      expect(args.clientId).toBe('test-client-id');
      expect(args.conversionActionId).toBe('987654321');
    });

    it('masks IDs cleanly without exposing sensitive digits', () => {
      expect(maskId('228-567-1544')).toBe('***-***-1544');
      expect(maskId('2285671544')).toBe('***-***-1544');
      expect(maskId(null)).toBe('(none)');
    });
  });

  describe('2. Dry-Run Verification', () => {
    it('executes dry-run contract verification successfully', async () => {
      const report = await runOfflineConversionVerification({ dryRun: true });
      expect(report.success).toBe(true);
      expect(report.allowlisted).toBe(true);
      expect(report.steps).toHaveLength(3);
    });
  });

  describe('3. Allowlist Restriction Detection (CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE)', () => {
    it('detects June 2026 ConversionUploadService restriction and flags Data Manager API requirement', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        // OAuth token refresh
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'mock-token' }), { status: 200 })
        )
        // uploadClickConversions returning 403 allowlist restriction
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                code: 403,
                message: 'The customer is not allowlisted for accessing this feature.',
                status: 'PERMISSION_DENIED',
                details: [
                  {
                    '@type': 'type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure',
                    errors: [
                      {
                        errorCode: {
                          customerError: 'CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE',
                        },
                        message: 'The customer is not allowlisted for accessing this feature.',
                      },
                    ],
                  },
                ],
              },
            }),
            { status: 403 }
          )
        );

      const report = await runOfflineConversionVerification({
        clientId: 'mock-cid',
        clientSecret: 'mock-secret',
        developerToken: 'mock-devtok',
        refreshToken: 'mock-reftok',
        customerId: '2285671544',
      });

      expect(report.success).toBe(false);
      expect(report.allowlisted).toBe(false);
      expect(report.requiresDataManagerApi).toBe(true);
      expect(report.error).toContain('DEVELOPER TOKEN RESTRICTION CONFIRMED');
      expect(report.error).toContain('Must migrate to Google Data Manager API');

      fetchSpy.mockRestore();
    });
  });

  describe('4. Developer Token Unapproved Detection (Test Account Access only)', () => {
    it('detects DEVELOPER_TOKEN_NOT_APPROVED error', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'mock-token' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: {
                code: 403,
                message: 'The developer token is not approved for production accounts.',
                status: 'PERMISSION_DENIED',
                details: [
                  {
                    errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' } }],
                  },
                ],
              },
            }),
            { status: 403 }
          )
        );

      const report = await runOfflineConversionVerification({
        clientId: 'mock-cid',
        clientSecret: 'mock-secret',
        developerToken: 'mock-devtok',
        refreshToken: 'mock-reftok',
        customerId: '2285671544',
      });

      expect(report.success).toBe(false);
      expect(report.allowlisted).toBe(false);
      expect(report.error).toContain('DEVELOPER TOKEN UNAPPROVED');
      expect(report.error).toContain('Explorer or Basic Access approval in API Center');

      fetchSpy.mockRestore();
    });
  });

  describe('5. Allowlisted HTTP 200 Response Handling', () => {
    it('marks allowlisted as true even when partialFailureError is present for synthetic data', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'mock-token' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              results: [],
              partialFailureError: {
                code: 3,
                message: 'This click ID is not recognized.',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );

      const report = await runOfflineConversionVerification({
        clientId: 'mock-cid',
        clientSecret: 'mock-secret',
        developerToken: 'mock-devtok',
        refreshToken: 'mock-reftok',
        customerId: '2285671544',
      });

      expect(report.success).toBe(true);
      expect(report.allowlisted).toBe(true);
      expect(report.steps[2].note).toContain('HTTP 200 received');
      expect(report.steps[2].note).toContain('This click ID is not recognized');

      fetchSpy.mockRestore();
    });
  });
});
