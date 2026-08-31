import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getConfiguredAllowedHosts,
  isAllowedProxyUrl,
  fetchProxyImage,
} from '@/lib/photo-proxy-guard';

describe('Lead Photo Proxy SSRF Hardening & Redirect Validation', () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalBackendSupabaseUrl = process.env.SUPABASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc-myproject.supabase.co';
    delete process.env.SUPABASE_URL;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    if (originalBackendSupabaseUrl) {
      process.env.SUPABASE_URL = originalBackendSupabaseUrl;
    } else {
      delete process.env.SUPABASE_URL;
    }
    vi.restoreAllMocks();
  });

  describe('getConfiguredAllowedHosts', () => {
    it('extracts only the configured Supabase host', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc-myproject.supabase.co';
      const allowed = getConfiguredAllowedHosts();
      expect(allowed.has('abc-myproject.supabase.co')).toBe(true);
      expect(allowed.has('other-project.supabase.co')).toBe(false);
      expect(allowed.has('evil.supabase.co')).toBe(false);
    });

    it('handles trailing slashes and ports in env', () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://custom-domain.example.com:8443/';
      const allowed = getConfiguredAllowedHosts();
      expect(allowed.has('custom-domain.example.com')).toBe(true);
    });
  });

  describe('isAllowedProxyUrl', () => {
    it('allows valid HTTPS URLs from the configured Supabase project', () => {
      const validUrl = new URL(
        'https://abc-myproject.supabase.co/storage/v1/object/sign/lead-photos/123/test.jpg?token=abc'
      );
      expect(isAllowedProxyUrl(validUrl)).toBe(true);
    });

    it('rejects arbitrary other Supabase tenant projects (*.supabase.co)', () => {
      const otherTenant = new URL(
        'https://attacker-tenant.supabase.co/storage/v1/object/public/lead-photos/photo.jpg'
      );
      expect(isAllowedProxyUrl(otherTenant)).toBe(false);
    });

    it('rejects *.supabase.in projects', () => {
      const supabaseIn = new URL('https://attacker.supabase.in/test.jpg');
      expect(isAllowedProxyUrl(supabaseIn)).toBe(false);
    });

    it('rejects domain suffix spoofing', () => {
      expect(isAllowedProxyUrl(new URL('https://evil-supabase.co/test.jpg'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('https://abc-myproject.supabase.co.attacker.com/test.jpg'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('https://supabase.co.evil.com/test.jpg'))).toBe(false);
    });

    it('rejects cloud metadata endpoints', () => {
      expect(isAllowedProxyUrl(new URL('http://169.254.169.254/latest/meta-data/'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('http://metadata.google.internal/computeMetadata/v1/'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('http://metadata/'))).toBe(false);
    });

    it('rejects private and loopback IP addresses', () => {
      expect(isAllowedProxyUrl(new URL('http://127.0.0.1:3000/api/admin'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('http://localhost:3000/api/admin'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('http://0.0.0.0/'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('http://10.0.0.1/internal'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('http://172.16.0.1/internal'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('http://192.168.1.1/internal'))).toBe(false);
      expect(isAllowedProxyUrl(new URL('http://[::1]/internal'))).toBe(false);
    });

    it('rejects non-HTTP(S) protocols', () => {
      expect(isAllowedProxyUrl(new URL('file:///etc/passwd'))).toBe(false);
    });

    it('rejects embedded credentials', () => {
      expect(isAllowedProxyUrl(new URL('https://user:pass@abc-myproject.supabase.co/test.jpg'))).toBe(false);
    });

    it('rejects unencrypted HTTP for remote domains', () => {
      expect(isAllowedProxyUrl(new URL('http://abc-myproject.supabase.co/test.jpg'))).toBe(false);
    });
  });

  describe('fetchProxyImage with redirect handling', () => {
    it('blocks redirect to cloud metadata service (SSRF protection)', async () => {
      const initialUrl = new URL('https://abc-myproject.supabase.co/storage/v1/object/sign/lead-photos/photo.jpg');

      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            Location: 'http://169.254.169.254/latest/meta-data/',
          },
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchProxyImage(initialUrl);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('not allowed for proxying');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('blocks redirect to another untrusted Supabase tenant', async () => {
      const initialUrl = new URL('https://abc-myproject.supabase.co/photo.jpg');

      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            Location: 'https://evil-tenant.supabase.co/photo.jpg',
          },
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchProxyImage(initialUrl);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('not allowed for proxying');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('allows valid redirects on the same allowed Supabase host', async () => {
      const initialUrl = new URL('https://abc-myproject.supabase.co/photo.jpg');
      const targetUrl = 'https://abc-myproject.supabase.co/storage/v1/object/public/lead-photos/photo.jpg';
      const fakeImageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

      const mockFetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: {
              Location: targetUrl,
            },
          })
        )
        .mockResolvedValueOnce(
          new Response(fakeImageBytes.buffer, {
            status: 200,
            headers: {
              'Content-Type': 'image/jpeg',
              'Content-Length': String(fakeImageBytes.length),
            },
          })
        );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchProxyImage(initialUrl);
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.contentType).toBe('image/jpeg');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('rejects redirect chains exceeding MAX_REDIRECTS', async () => {
      const initialUrl = new URL('https://abc-myproject.supabase.co/hop1.jpg');

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: {
            Location: 'https://abc-myproject.supabase.co/hop-next.jpg',
          },
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchProxyImage(initialUrl);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(508);
      expect(result.error).toContain('Too many redirects');
    });

    it('rejects non-image responses', async () => {
      const initialUrl = new URL('https://abc-myproject.supabase.co/file.html');

      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response('<html><body>secret internal data</body></html>', {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
          },
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchProxyImage(initialUrl);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(415);
      expect(result.error).toContain('not a valid image');
    });

    it('rejects payload exceeding maximum size limit', async () => {
      const initialUrl = new URL('https://abc-myproject.supabase.co/giant.jpg');

      const mockFetch = vi.fn().mockResolvedValueOnce(
        new Response(new Uint8Array(100), {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(50 * 1024 * 1024), // 50 MB
          },
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchProxyImage(initialUrl);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(413);
      expect(result.error).toContain('Image exceeds maximum allowed size');
    });
  });
});
