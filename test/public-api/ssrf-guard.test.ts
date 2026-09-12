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

describe('SSRF Protection: IPv4-mapped IPv6 addresses', () => {
  // The dotted spelling was already handled, but nothing produces it: both
  // `new URL()` and `dns.lookup` hand back the hex form, so every real mapped
  // address used to fall past the check and be reported safe.
  const mapped: ReadonlyArray<readonly [string, string]> = [
    ['::ffff:a9fe:a9fe', '169.254.169.254 (cloud metadata)'],
    ['::ffff:7f00:1', '127.0.0.1 (loopback)'],
    ['::ffff:c0a8:0101', '192.168.1.1 (RFC 1918)'],
    ['::ffff:0a00:0001', '10.0.0.1 (RFC 1918)'],
    ['::ffff:ac10:0001', '172.16.0.1 (RFC 1918)'],
  ];

  for (const [address, label] of mapped) {
    it(`treats ${address} as restricted — it is ${label}`, () => {
      expect(isPrivateIp(address)).toBe(true);
    });
  }

  it('still recognises the dotted spelling of a mapped address', () => {
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true);
  });

  it('does not over-block a mapped PUBLIC address', () => {
    // ::ffff:0808:0808 is 8.8.8.8, which is routable and must stay allowed.
    expect(isPrivateIp('::ffff:0808:0808')).toBe(false);
  });

  it('treats an undecodable ::ffff: prefix as restricted', () => {
    expect(isPrivateIp('::ffff:not-an-address')).toBe(true);
  });

  it('treats NAT64 (64:ff9b::/96) as restricted', () => {
    expect(isPrivateIp('64:ff9b::a9fe:a9fe')).toBe(true);
  });

  it('rejects a bracketed IPv6 loopback literal in a URL', async () => {
    const res = await validateWebhookUrl('https://[::1]/webhook');
    expect(res.safe).toBe(false);
  });

  it('rejects a bracketed IPv4-mapped metadata literal in a URL', async () => {
    const res = await validateWebhookUrl('https://[::ffff:a9fe:a9fe]/webhook');
    expect(res.safe).toBe(false);
  });
});
