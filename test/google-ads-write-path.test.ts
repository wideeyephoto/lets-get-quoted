import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  isGoogleAdsConfigured,
  toggleCampaignStatus,
  updateGoogleAdsCampaignStatus,
  resolveServingCustomerId,
  GOOGLE_ADS_API_VERSION,
  GOOGLE_ADS_API_BASE_URL,
} from '@/lib/google-ads-api';
// @ts-ignore - raw ESM script
import { parseArgs, maskId, runVerification } from '../scripts/verify-google-ads-v25-write-path.mjs';

describe('Google Ads v25 Write-Path & Status Toggle Verification Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Serving Customer ID & Configuration Predicate', () => {
    it('isGoogleAdsConfigured accepts explicit clientCustomerId', () => {
      const config = {
        clientId: 'mock-client-id',
        clientSecret: 'mock-client-secret',
        developerToken: 'mock-dev-token',
        refreshToken: 'mock-refresh-token',
        mccCustomerId: '111-222-3333',
      };

      // Unconfigured when no client customer ID is passed
      expect(isGoogleAdsConfigured(undefined, config)).toBe(false);

      // Unconfigured when client customer ID matches MCC
      expect(isGoogleAdsConfigured('111-222-3333', config)).toBe(false);

      // Configured when distinct client customer ID is passed
      expect(isGoogleAdsConfigured('444-555-6666', config)).toBe(true);
    });

    it('masks customer IDs safely for logs and reports', () => {
      expect(maskId('1234567890')).toBe('***-***-7890');
      expect(maskId('123-456-7890')).toBe('***-***-7890');
      expect(maskId('123')).toBe('***');
      expect(maskId('')).toBe('(none)');
      expect(maskId(null)).toBe('(none)');
    });
  });

  describe('2. Campaign Status Toggle Write-Path Mutation', () => {
    it('toggleCampaignStatus passes clientCustomerId and sends v25 mutate payload with updateMask', async () => {
      process.env.GOOGLE_ADS_CLIENT_ID = 'cid';
      process.env.GOOGLE_ADS_CLIENT_SECRET = 'csec';
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'devtok';
      process.env.GOOGLE_ADS_REFRESH_TOKEN = 'reftok';
      process.env.GOOGLE_ADS_MCC_CUSTOMER_ID = '1112223333';

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        // OAuth token refresh
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'mock_access_token' }),
        } as Response)
        // campaigns:mutate
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ resourceName: 'customers/4445556666/campaigns/987654' }],
          }),
        } as Response);

      const result = await toggleCampaignStatus('987654', 'PAUSED', '444-555-6666');

      expect(result.success).toBe(true);
      expect(result.status).toBe('PAUSED');
      expect(result.message).toContain('successfully set to PAUSED');

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Verify OAuth call
      expect(fetchSpy.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');

      // Verify Google Ads API v25 Mutate call
      const mutateUrl = fetchSpy.mock.calls[1][0] as string;
      expect(mutateUrl).toBe(`${GOOGLE_ADS_API_BASE_URL}/customers/4445556666/campaigns:mutate`);

      const mutateReq = fetchSpy.mock.calls[1][1] as RequestInit;
      expect(mutateReq.method).toBe('POST');
      expect(mutateReq.headers).toMatchObject({
        Authorization: 'Bearer mock_access_token',
        'developer-token': 'devtok',
        'login-customer-id': '1112223333',
        'Content-Type': 'application/json',
      });

      const body = JSON.parse(mutateReq.body as string);
      expect(body.operations).toEqual([
        {
          update: {
            resourceName: 'customers/4445556666/campaigns/987654',
            status: 'PAUSED',
          },
          updateMask: 'status',
        },
      ]);
    });

    it('updateGoogleAdsCampaignStatus supports REMOVED status for teardown', async () => {
      process.env.GOOGLE_ADS_CLIENT_ID = 'cid';
      process.env.GOOGLE_ADS_CLIENT_SECRET = 'csec';
      process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'devtok';
      process.env.GOOGLE_ADS_REFRESH_TOKEN = 'reftok';
      process.env.GOOGLE_ADS_MCC_CUSTOMER_ID = '1112223333';

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'mock_access_token' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ resourceName: 'customers/4445556666/campaigns/987654' }],
          }),
        } as Response);

      const result = await updateGoogleAdsCampaignStatus('987654', 'REMOVED', '444-555-6666');

      expect(result.success).toBe(true);

      const mutateReq = fetchSpy.mock.calls[1][1] as RequestInit;
      const body = JSON.parse(mutateReq.body as string);
      expect(body.operations[0].update.status).toBe('REMOVED');
      expect(body.operations[0].updateMask).toBe('status');
    });
  });

  describe('3. Verification Runner Argument Parsing & Dry-Run Lifecycle', () => {
    it('parseArgs correctly parses CLI arguments', () => {
      const args = parseArgs([
        '--dry-run',
        '--customer-id', '7778889999',
        '--client-id', 'test-cid',
        '--client-secret', 'test-csec',
        '--developer-token', 'test-devtok',
        '--refresh-token', 'test-reftok',
        '--mcc-id', '1112223333',
        '--no-cleanup',
      ]);

      expect(args.dryRun).toBe(true);
      expect(args.customerId).toBe('7778889999');
      expect(args.clientId).toBe('test-cid');
      expect(args.clientSecret).toBe('test-csec');
      expect(args.developerToken).toBe('test-devtok');
      expect(args.refreshToken).toBe('test-reftok');
      expect(args.mccCustomerId).toBe('1112223333');
      expect(args.cleanup).toBe(false);
    });

    it('runVerification executes dry-run validation successfully', async () => {
      const report = await runVerification({
        dryRun: true,
        mccCustomerId: '1112223333',
        customerId: '4445556666',
      });

      expect(report.success).toBe(true);
      expect(report.apiVersion).toBe(GOOGLE_ADS_API_VERSION);
      expect(report.mode).toBe('dry-run');
      expect(report.mccCustomerId).toBe('***-***-3333');
      expect(report.servingCustomerId).toBe('***-***-6666');
      expect(report.steps.length).toBe(6);
      expect(report.steps.every((s: { status: string }) => s.status === 'PASS')).toBe(true);
    });
  });
});
