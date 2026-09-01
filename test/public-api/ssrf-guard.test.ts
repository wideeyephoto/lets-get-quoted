import { describe, it, expect } from 'vitest';
import { validateWebhookUrl, isPrivateIp } from '@/lib/public-api/ssrf-guard';

describe('SSRF Protection & URL Validation', () => {
  it('allows valid public HTTPS URLs', async () => {
    const res = await validateWebhookUrl('https://hooks.zapier.com/hooks/catch/123456/abcdef');
    expect(res.safe).toBe(true);
  });

  it('rejects plain HTTP URLs (HTTPS enforcement)', async () => {
    const res = await validateWebhookUrl('http://api.example.com/webhook');
    expect(res.safe).toBe(false);
    if (!res.safe) {
      expect(res.reason).toContain('HTTPS');
    }
  });

  it('rejects URLs with embedded basic auth credentials', async () => {
    const res = await validateWebhookUrl('https://user:password@example.com/webhook');
    expect(res.safe).toBe(false);
    if (!res.safe) {
      expect(res.reason).toContain('credentials');
    }
  });

  it('rejects non-standard ports (enforcing port 443)', async () => {
    const res = await validateWebhookUrl('https://example.com:8443/webhook');
    expect(res.safe).toBe(false);
    if (!res.safe) {
      expect(res.reason).toContain('Port "8443" is forbidden');
    }
  });

  it('identifies and blocks IPv4 private, loopback, and cloud metadata ranges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.5.10')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true); // AWS / GCP metadata
    expect(isPrivateIp('0.0.0.0')).toBe(true);

    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('104.26.10.1')).toBe(false);
  });

  it('identifies and blocks IPv6 private and loopback ranges', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true); // IPv4-mapped loopback
    expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false); // Cloudflare public DNS
  });

  it('rejects localhost and private IP hostnames directly in validateWebhookUrl', async () => {
    const localhostRes = await validateWebhookUrl('https://localhost/webhook');
    expect(localhostRes.safe).toBe(false);

    const privateIpRes = await validateWebhookUrl('https://192.168.1.1/webhook');
    expect(privateIpRes.safe).toBe(false);
  });
});
