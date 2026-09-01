import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProxyImage } from '../src/lib/photo-proxy-guard';
import { qboQuery } from '../src/lib/quickbooks/api';
import { fetchForecast } from '../src/lib/weather-nws';

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '127.0.0.1' }),
}));

vi.mock('@/lib/rate-limit', () => ({
  clientIpFrom: () => '127.0.0.1',
  checkRateLimitStrict: async () => true,
  checkRateLimit: async () => true,
}));

describe('Egress & Third-Party Timeout Resilience', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cloudflare Turnstile Verification Resilience', () => {
    it('proves submit contact action fails closed on Turnstile timeout or network exception', async () => {
      // Simulate network timeout throwing AbortError
      const mockFetch = vi.fn().mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
      vi.stubGlobal('fetch', mockFetch);

      const { submitContactMessage } = await import('../src/app/contact/actions');
      const formData = new FormData();
      formData.set('name', 'Test User');
      formData.set('email', 'test@example.com');
      formData.set('phone', '5125550100');
      formData.set('message', 'Test message inquiry');
      formData.set('cf-turnstile-response', 'invalid_or_timed_out_token');

      vi.stubEnv('TURNSTILE_SECRET', 'test_secret_key');
      const result = await submitContactMessage(formData);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('“I’m human” check');
    });
  });

  describe('Photo Proxy Overall Deadline & Body Resilience', () => {
    it('handles body read timeout gracefully with 504 status rather than 500 unhandled exception', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test-project.supabase.co');

      const mockRes = {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: vi.fn().mockRejectedValue(new Error('Body stream timed out')),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockRes));

      const result = await fetchProxyImage(new URL('https://test-project.supabase.co/storage/v1/object/public/lead-photos/photo.jpg'));
      expect(result.ok).toBe(false);
      expect(result.status).toBe(504);
      expect(result.error).toContain('Image body download failed');
    });

    it('blocks disallowed proxy hosts with 403 status immediately without outbound network call', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchProxyImage(new URL('https://internal-metadata.google.internal/computeMetadata/v1/'));
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('QuickBooks API Timeout Handling', () => {
    it('proves qboQuery fails fast on API timeout', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Request timed out', 'TimeoutError')));

      const mockConnection = {
        accountId: 'acc-1',
        realmId: 'realm-1',
        accessToken: 'tok-1',
        refreshToken: 'ref-1',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        refreshExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        connectedAt: new Date().toISOString(),
        connectedBy: 'owner@example.com',
        companyName: 'QuickBooks Test Co',
        environment: 'sandbox' as const,
      };

      await expect(qboQuery(mockConnection, 'select * from Customer')).rejects.toThrow();
    });
  });

  describe('Weather NWS Timeout & Fallback', () => {
    it('returns null on NWS timeout without crashing the caller', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('NWS timed out', 'TimeoutError')));

      const forecast = await fetchForecast(30.2672, -97.7431);
      expect(forecast).toBeNull();
    });
  });
});
