import 'server-only';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { isPrivateIp } from '@/lib/public-api/ssrf-guard';

const MAX_MEDIA_BYTES = 35 * 1024 * 1024;
export class SmsMediaBlockedError extends Error {}

function publicAddress(address: string): boolean {
  if (isPrivateIp(address)) return false;
  // IPv6 downloads must use global unicast, excluding mapped/compatible and
  // translation ranges that could disguise an internal IPv4 destination.
  return isIP(address) !== 6 || /^[23][0-9a-f]{0,3}:/i.test(address);
}

const publicLookup: LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { all: true }).then((addresses) => {
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
      callback(new SmsMediaBlockedError('Media host resolves to a restricted address.'), '');
    } else if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  }).catch((error: Error) => callback(error, ''));
};

/** One HTTPS hop. Validate DNS in the socket lookup itself to prevent rebinding. */
export async function fetchSmsMedia(
  url: string,
  options: { headers?: Record<string, string>; signal: AbortSignal },
): Promise<Response> {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
      || (parsed.port && parsed.port !== '443') || (isIP(host) && !publicAddress(host))) {
    throw new SmsMediaBlockedError('Disallowed media location.');
  }
  return new Promise((resolve, reject) => {
    const req = request(parsed, {
      method: 'GET', headers: options.headers, signal: options.signal,
      lookup: publicLookup, agent: false,
    }, (res) => {
      const status = res.statusCode ?? 502;
      if (status < 200 || status > 599) {
        res.destroy();
        reject(new Error('Invalid media response status.'));
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(res.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      // node:https never follows redirects. Leave their validation to the route.
      if (status < 200 || status >= 300 || status === 204 || status === 205) {
        resolve(new Response(null, { status, headers }));
        res.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      res.on('error', reject);
      res.on('aborted', () => reject(new Error('Media download interrupted.')));
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_MEDIA_BYTES) {
          res.destroy(new Error('Media attachment exceeds the download limit.'));
        } else {
          chunks.push(chunk);
        }
      });
      res.on('end', () => resolve(new Response(new Uint8Array(Buffer.concat(chunks)), { status, headers })));
    });
    req.on('error', reject);
    req.end();
  });
}
