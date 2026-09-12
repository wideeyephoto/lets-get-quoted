import { describe, it, expect } from 'vitest';
import { postToPinnedAddress } from '@/lib/public-api/pinned-fetch';

describe('postToPinnedAddress', () => {

  it('refuses a pinned value that is not a literal IP address', async () => {
    // The point of pinning is lost if a hostname can be passed here — it would
    // be resolved, which is the lookup this exists to avoid.
    await expect(
      postToPinnedAddress(new URL('https://example.com/hook'), {
        method: 'POST', headers: {}, body: '{}', timeoutMs: 1000,
        pinnedIp: 'evil.example.com',
      }),
    ).rejects.toThrow(/not a literal IP address/);
  });

  it('refuses a non-HTTPS target', async () => {
    await expect(
      postToPinnedAddress(new URL('http://example.com/hook'), {
        method: 'POST', headers: {}, body: '{}', timeoutMs: 1000,
        pinnedIp: '93.184.216.34',
      }),
    ).rejects.toThrow(/HTTPS only/);
  });

  it('connects to the pinned address rather than resolving the hostname', async () => {
    // Rather than stand up TLS, assert the connection target directly: a
    // hostname that resolves nowhere still reaches a pinned loopback address.
    // A refused connection proves the socket went to 127.0.0.1 rather than
    // failing DNS resolution for the made-up hostname.
    await expect(
      postToPinnedAddress(new URL('https://nonexistent.invalid/hook'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: '{}', timeoutMs: 2000,
        pinnedIp: '127.0.0.1',
      }),
    ).rejects.toSatisfy((e: unknown) => {
      const code = (e as { code?: string }).code;
      // ECONNREFUSED means we reached 127.0.0.1. ENOTFOUND would mean the
      // hostname was resolved after all, which is the bug this closes.
      expect(code).not.toBe('ENOTFOUND');
      return code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EPROTO';
    });
  });
});
